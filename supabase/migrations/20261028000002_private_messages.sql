CREATE TABLE public.direct_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  read_a bigint NOT NULL DEFAULT 0, read_b bigint NOT NULL DEFAULT 0,
  typing_a_until timestamptz, typing_b_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_a,user_b), CHECK (user_a < user_b), CHECK (requested_by IN (user_a,user_b))
);
CREATE TABLE public.direct_messages (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  conversation_id uuid NOT NULL REFERENCES public.direct_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(content) <= 2000),
  attachments jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(attachments) = 'array' AND jsonb_array_length(attachments) <= 4),
  embeds jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(embeds) = 'array' AND jsonb_array_length(embeds) <= 4),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX direct_messages_history ON public.direct_messages(conversation_id, seq DESC);
CREATE INDEX direct_messages_sender_recent ON public.direct_messages(sender_id, created_at DESC);
CREATE INDEX direct_conversations_a ON public.direct_conversations(user_a,updated_at DESC);
CREATE INDEX direct_conversations_b ON public.direct_conversations(user_b,updated_at DESC);
ALTER TABLE public.direct_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_conversations,public.direct_messages FROM PUBLIC,anon,authenticated;
CREATE POLICY direct_conversation_member ON public.direct_conversations FOR SELECT TO authenticated
  USING (auth.uid() IN (user_a,user_b));
CREATE POLICY direct_message_member ON public.direct_messages FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.direct_conversations c WHERE c.id=conversation_id AND auth.uid() IN (c.user_a,c.user_b)));
GRANT SELECT ON public.direct_conversations, public.direct_messages TO authenticated;

CREATE FUNCTION public.get_direct_unread() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT count(*) FROM direct_messages m JOIN direct_conversations c ON c.id=m.conversation_id
 WHERE auth.uid() IN(c.user_a,c.user_b) AND m.sender_id<>auth.uid() AND c.status<>'declined'
 AND m.seq > CASE WHEN c.user_a=auth.uid() THEN c.read_a ELSE c.read_b END;
$$;
REVOKE ALL ON FUNCTION public.get_direct_unread() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_direct_unread() TO authenticated;

CREATE FUNCTION public.dm_is_blocked(p_a uuid,p_b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM user_blocks WHERE (blocker_id=p_a AND blocked_id=p_b) OR (blocker_id=p_b AND blocked_id=p_a));
$$;
-- Internal helper; do not expose arbitrary users' block relationships through RPC.
REVOKE ALL ON FUNCTION public.dm_is_blocked(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.start_direct_conversation(p_recipient uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c direct_conversations;
BEGIN
 IF auth.uid() IS NULL OR auth.uid()=p_recipient THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE user_id=p_recipient AND NOT coalesce(is_banned,false)) OR
    EXISTS(SELECT 1 FROM profiles WHERE user_id=auth.uid() AND coalesce(is_banned,false)) OR dm_is_blocked(auth.uid(),p_recipient) THEN
   RAISE EXCEPTION 'Messaging unavailable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 28));
 SELECT * INTO c FROM direct_conversations WHERE user_a=least(auth.uid(),p_recipient) AND user_b=greatest(auth.uid(),p_recipient);
 IF FOUND THEN
   IF c.status='declined' AND c.requested_by <> auth.uid() THEN
     UPDATE direct_conversations SET status='accepted', updated_at=now() WHERE id=c.id;
   END IF;
   RETURN c.id;
 END IF;
 IF (SELECT count(*) FROM direct_conversations WHERE requested_by=auth.uid() AND updated_at>now()-interval '1 hour') >= 10 THEN RAISE EXCEPTION 'Too many requests. Try again later.'; END IF;
 INSERT INTO direct_conversations(user_a,user_b,requested_by) VALUES(least(auth.uid(),p_recipient),greatest(auth.uid(),p_recipient),auth.uid())
 ON CONFLICT(user_a,user_b) DO UPDATE SET user_a=excluded.user_a RETURNING * INTO c;
 RETURN c.id;
END;
$$;

CREATE FUNCTION public.respond_direct_conversation(p_conversation uuid,p_accept boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE direct_conversations SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,updated_at=now()
 WHERE id=p_conversation AND auth.uid() IN (user_a,user_b) AND requested_by<>auth.uid() AND status='pending'
   AND NOT dm_is_blocked(user_a,user_b);
 IF NOT FOUND THEN RAISE EXCEPTION 'Request unavailable'; END IF;
END;
$$;

CREATE FUNCTION public.send_direct_message(p_conversation uuid,p_id uuid,p_content text,p_attachments jsonb DEFAULT '[]',p_embeds jsonb DEFAULT '[]')
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
   CASE WHEN c.status='pending' THEN 'Message request' ELSE 'New private message' END,'Open your inbox to view it.',jsonb_build_object('type','direct_message','link','/messages/'||c.id));
 RETURN p_id;
END;
$$;

CREATE FUNCTION public.update_direct_presence(p_conversation uuid,p_read_seq bigint DEFAULT NULL,p_typing boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c direct_conversations; boundary bigint;
BEGIN
 SELECT * INTO c FROM direct_conversations WHERE id=p_conversation AND auth.uid() IN(user_a,user_b) FOR UPDATE;
 IF NOT FOUND OR c.status<>'accepted' OR dm_is_blocked(c.user_a,c.user_b) THEN RETURN; END IF;
 SELECT coalesce(max(seq),0) INTO boundary FROM direct_messages WHERE conversation_id=c.id AND seq<=p_read_seq;
 UPDATE direct_conversations SET
   read_a=CASE WHEN user_a=auth.uid() THEN greatest(read_a,boundary) ELSE read_a END,
   read_b=CASE WHEN user_b=auth.uid() THEN greatest(read_b,boundary) ELSE read_b END,
   typing_a_until=CASE WHEN user_a=auth.uid() THEN CASE WHEN p_typing THEN now()+interval '6 seconds' END ELSE typing_a_until END,
   typing_b_until=CASE WHEN user_b=auth.uid() THEN CASE WHEN p_typing THEN now()+interval '6 seconds' END ELSE typing_b_until END
 WHERE id=c.id;
END;
$$;

CREATE FUNCTION public.report_direct_message(p_message uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m direct_messages;
BEGIN
 SELECT d.* INTO m FROM direct_messages d JOIN direct_conversations c ON c.id=d.conversation_id
 WHERE d.id=p_message AND auth.uid() IN(c.user_a,c.user_b) AND d.sender_id<>auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Message unavailable'; END IF;
 IF length(trim(p_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Please describe the report'; END IF;
 -- Snapshot only the reported message, not the rest of the conversation.
 INSERT INTO reports(reporter_id,target_type,target_id,reason,details) VALUES(auth.uid(),'other',m.id::text,left(p_reason,1000),
   jsonb_build_object('type','direct_message','sender_id',m.sender_id,'content',m.content,'attachments',m.attachments,'embeds',m.embeds)::text);
END;
$$;

REVOKE ALL ON FUNCTION public.start_direct_conversation(uuid),public.respond_direct_conversation(uuid,boolean),
 public.send_direct_message(uuid,uuid,text,jsonb,jsonb),public.update_direct_presence(uuid,bigint,boolean),public.report_direct_message(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_direct_conversation(uuid),public.respond_direct_conversation(uuid,boolean),
 public.send_direct_message(uuid,uuid,text,jsonb,jsonb),public.update_direct_presence(uuid,bigint,boolean),public.report_direct_message(uuid,text) TO authenticated;

-- Private uploads have no public URL or legacy public-bucket fallback.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('direct-media','direct-media',false,8388608,ARRAY['image/png','image/jpeg','image/gif','image/webp']) ON CONFLICT(id) DO NOTHING;
CREATE FUNCTION public.can_use_direct_media(p_name text,p_write boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE c direct_conversations; cid uuid; owner_uid uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 BEGIN owner_uid:=(storage.foldername(p_name))[1]::uuid; cid:=(storage.foldername(p_name))[2]::uuid; EXCEPTION WHEN others THEN RETURN false; END;
 IF NOT p_write AND public.is_staff(auth.uid()) THEN
   IF EXISTS(SELECT 1 FROM direct_messages m JOIN reports r ON r.target_id=m.id::text
     WHERE r.target_type='other' AND r.details LIKE '%"type": "direct_message"%'
       AND m.attachments @> jsonb_build_array(jsonb_build_object('storagePath',p_name))) THEN RETURN true; END IF;
 END IF;
 SELECT * INTO c FROM direct_conversations WHERE id=cid AND auth.uid() IN(user_a,user_b);
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_write THEN RETURN owner_uid=auth.uid() AND c.status='accepted' AND NOT dm_is_blocked(c.user_a,c.user_b); END IF;
 RETURN owner_uid=auth.uid() OR EXISTS(SELECT 1 FROM direct_messages WHERE conversation_id=cid AND attachments @> jsonb_build_array(jsonb_build_object('storagePath',p_name)));
END;
$$;
REVOKE ALL ON FUNCTION public.can_use_direct_media(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_use_direct_media(text,boolean) TO authenticated;
CREATE POLICY direct_media_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='direct-media' AND public.can_use_direct_media(name));
CREATE POLICY direct_media_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='direct-media' AND public.can_use_direct_media(name,true));
CREATE POLICY direct_media_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='direct-media' AND public.storage_object_owner_uid(name)=auth.uid());

-- Reuse the existing quota and usage triggers for both media buckets, locking the
-- owner's profile so concurrent uploads cannot bypass the shared storage limit.
CREATE OR REPLACE FUNCTION public.enforce_storage_quota() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE uid uuid; quota bigint; used bigint;
BEGIN
 IF NEW.bucket_id NOT IN ('user-media','direct-media') THEN RETURN NEW; END IF;
 uid:=public.storage_object_owner_uid(NEW.name);
 SELECT storage_quota_bytes INTO quota FROM profiles WHERE user_id=uid FOR UPDATE;
 IF quota IS NULL THEN RAISE EXCEPTION 'Storage profile unavailable'; END IF;
 SELECT coalesce(sum((metadata->>'size')::bigint),0) INTO used FROM storage.objects
 WHERE bucket_id IN ('user-media','direct-media') AND public.storage_object_owner_uid(name)=uid
   AND id<>NEW.id;
 IF used+coalesce((NEW.metadata->>'size')::bigint,0)>quota THEN RAISE EXCEPTION 'Storage quota exceeded' USING errcode='check_violation'; END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_storage_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE uid uuid; delta bigint:=0;
BEGIN
 IF TG_OP IN('UPDATE','DELETE') AND OLD.bucket_id IN('user-media','direct-media') THEN
   uid:=public.storage_object_owner_uid(OLD.name);
   UPDATE profiles SET storage_used_bytes=greatest(0,storage_used_bytes-coalesce((OLD.metadata->>'size')::bigint,0)) WHERE user_id=uid;
 END IF;
 IF TG_OP IN('INSERT','UPDATE') AND NEW.bucket_id IN('user-media','direct-media') THEN
   uid:=public.storage_object_owner_uid(NEW.name);
   UPDATE profiles SET storage_used_bytes=storage_used_bytes+coalesce((NEW.metadata->>'size')::bigint,0) WHERE user_id=uid;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_storage_quota ON storage.objects;
CREATE TRIGGER trg_enforce_storage_quota BEFORE INSERT OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_quota();

CREATE FUNCTION public.list_direct_media() RETURNS TABLE(path text,size bigint,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
 SELECT name,coalesce((metadata->>'size')::bigint,0),created_at FROM storage.objects
 WHERE bucket_id='direct-media' AND public.storage_object_owner_uid(name)=auth.uid()
 ORDER BY created_at DESC LIMIT 2000;
$$;
REVOKE ALL ON FUNCTION public.list_direct_media() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_direct_media() TO authenticated;

CREATE OR REPLACE FUNCTION public.recompute_storage_usage(p_target_user_id uuid) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE uid uuid:=coalesce(p_target_user_id,auth.uid()); total bigint;
BEGIN
 IF auth.uid() IS NULL OR (uid<>auth.uid() AND NOT public.is_staff(auth.uid())) THEN RAISE EXCEPTION 'Not permitted'; END IF;
 PERFORM 1 FROM profiles WHERE user_id=uid FOR UPDATE;
 SELECT coalesce(sum((metadata->>'size')::bigint),0) INTO total FROM storage.objects
 WHERE bucket_id IN('user-media','direct-media') AND public.storage_object_owner_uid(name)=uid;
 UPDATE profiles SET storage_used_bytes=total WHERE user_id=uid;
 RETURN total;
END;
$$;

DO $$ BEGIN
 ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
 ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
