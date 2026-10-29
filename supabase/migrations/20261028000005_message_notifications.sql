-- Keep private messages and requests identifiable in the shared notification feed.
CREATE OR REPLACE FUNCTION public.send_direct_message(p_conversation uuid,p_id uuid,p_content text,p_attachments jsonb DEFAULT '[]',p_embeds jsonb DEFAULT '[]')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE c direct_conversations; a jsonb; path text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 -- Per-sender lock makes rate limits atomic across conversations.
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 28));
 SELECT * INTO c FROM direct_conversations WHERE id=p_conversation AND auth.uid() IN(user_a,user_b) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conversation unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM direct_messages WHERE id=p_id AND conversation_id=c.id AND sender_id=auth.uid()) THEN RETURN p_id; END IF;
 IF dm_is_blocked(c.user_a,c.user_b) OR EXISTS(SELECT 1 FROM profiles WHERE user_id IN(c.user_a,c.user_b) AND coalesce(is_banned,false)) THEN RAISE EXCEPTION 'Messaging unavailable'; END IF;
 IF c.status='declined' THEN RAISE EXCEPTION 'Request declined'; END IF;
 IF jsonb_typeof(p_attachments)<>'array' OR jsonb_typeof(p_embeds)<>'array' OR jsonb_array_length(p_attachments)>4 OR jsonb_array_length(p_embeds)>4 OR
    p_content IS NULL OR length(p_content)>2000 OR (length(trim(p_content))=0 AND p_attachments='[]' AND p_embeds='[]') OR
    octet_length(p_attachments::text)+octet_length(p_embeds::text)>32768 THEN RAISE EXCEPTION 'Invalid message'; END IF;
 IF c.status='pending' AND (c.requested_by<>auth.uid() OR EXISTS(SELECT 1 FROM direct_messages WHERE conversation_id=c.id) OR p_attachments<>'[]' OR p_embeds<>'[]') THEN
   RAISE EXCEPTION 'Wait for the recipient to accept your request'; END IF;
 IF (SELECT count(*) FROM direct_messages WHERE sender_id=auth.uid() AND created_at>now()-interval '1 minute')>=30 THEN RAISE EXCEPTION 'Please wait before sending more messages'; END IF;
 FOR a IN SELECT * FROM jsonb_array_elements(p_attachments) LOOP
   path:=a->>'storagePath';
   IF path IS NOT NULL THEN
     IF path NOT LIKE auth.uid()::text||'/'||c.id::text||'/%' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='direct-media' AND name=path) THEN RAISE EXCEPTION 'Invalid attachment'; END IF;
   ELSIF coalesce(a->>'url','') !~ '^https://' THEN RAISE EXCEPTION 'Invalid attachment URL'; END IF;
 END LOOP;
 INSERT INTO direct_messages(id,conversation_id,sender_id,content,attachments,embeds) VALUES(p_id,c.id,auth.uid(),trim(p_content),p_attachments,p_embeds);
 UPDATE direct_conversations SET updated_at=now(),typing_a_until=CASE WHEN user_a=auth.uid() THEN NULL ELSE typing_a_until END,
   typing_b_until=CASE WHEN user_b=auth.uid() THEN NULL ELSE typing_b_until END WHERE id=c.id;
 INSERT INTO notifications(user_id,title,body,data) VALUES(CASE WHEN c.user_a=auth.uid() THEN c.user_b ELSE c.user_a END,
   CASE WHEN c.status='pending' THEN 'Message request' ELSE 'New private message' END,'Open your inbox to view it.',jsonb_build_object('type',CASE WHEN c.status='pending' THEN 'message_request' ELSE 'direct_message' END,
     'from_user',auth.uid(),'conversation_id',c.id,'message_id',p_id,'link','/messages/'||c.id));
 RETURN p_id;
END;
$$;


-- Preserve existing notification links and read state while categorizing old requests.
UPDATE public.notifications SET data=jsonb_set(data,'{type}','"message_request"'::jsonb)
WHERE data->>'type'='direct_message' AND title='Message request';
