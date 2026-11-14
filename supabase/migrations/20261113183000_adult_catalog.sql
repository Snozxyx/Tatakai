-- Adult classification and source-owned catalog satellite records.
ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS adult_category text CHECK (adult_category IN ('explicit','ecchi','mature'));
CREATE OR REPLACE FUNCTION public.content_adult_category(adult boolean, genres text[], tags jsonb, rating text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT CASE
 WHEN adult OR EXISTS (SELECT 1 FROM unnest(genres) g WHERE lower(g) IN ('hentai','erotica','pornographic')) OR lower(coalesce(rating,'')) ~ '^(erotica|pornographic|rx|r.?18)' THEN 'explicit'
 WHEN lower(coalesce(rating,''))='suggestive' OR EXISTS (SELECT 1 FROM unnest(genres) g WHERE lower(g)='ecchi') OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(tags,'[]')) t WHERE lower(coalesce(t->>'name',t#>>'{}')) IN ('ecchi','sexual content','nudity')) THEN 'ecchi'
 WHEN lower(coalesce(rating,'')) ~ '^(r( *-? *17|[+]|$)|nc.?17|18[+]|17[+]|mature)' THEN 'mature' ELSE NULL END;
$$;
CREATE OR REPLACE FUNCTION public.set_content_adult_category() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.adult_category := public.content_adult_category(NEW.is_adult,NEW.genres,NEW.tags,NEW.rating); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS content_adult_classification ON public.content_items;
CREATE TRIGGER content_adult_classification BEFORE INSERT OR UPDATE OF is_adult,genres,tags,rating ON public.content_items FOR EACH ROW EXECUTE FUNCTION public.set_content_adult_category();
UPDATE public.content_items SET adult_category=public.content_adult_category(is_adult,genres,tags,rating);
CREATE INDEX IF NOT EXISTS content_items_adult_category ON public.content_items(adult_category,format,popularity DESC,tatakai_id);
CREATE TABLE IF NOT EXISTS public.adult_source_records (
 source text NOT NULL, kind text NOT NULL, source_id text NOT NULL, payload jsonb NOT NULL,
 tatakai_id uuid REFERENCES public.content_items(tatakai_id), active boolean NOT NULL DEFAULT true,
 imported_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(source,kind,source_id)
);
CREATE INDEX IF NOT EXISTS adult_source_records_content ON public.adult_source_records(tatakai_id);
CREATE TABLE IF NOT EXISTS public.adult_sync_state (source text PRIMARY KEY, manifest jsonb NOT NULL DEFAULT '{}', watermark text, checkpoint jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.adult_gallery_pages (query_key text PRIMARY KEY, payload jsonb NOT NULL, fetched_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.adult_source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adult_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adult_gallery_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS source_catalog_active boolean NOT NULL DEFAULT true;
-- API service-role only. Clients read normalized data through TatakaiAPI.

CREATE OR REPLACE FUNCTION public.import_pornhwadb_catalog(dataset jsonb, manifest jsonb, reconcile boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; cid uuid; aid integer; mid integer; link jsonb; srcid text; inserted_count integer:=0;
BEGIN
 IF dataset->>'schemaVersion' <> 'v3' OR jsonb_typeof(dataset->'pornhwa') <> 'array' THEN RAISE EXCEPTION 'Unsupported PornhwaDB export schema'; END IF;
 IF jsonb_array_length(dataset->'pornhwa')=0 AND reconcile THEN RAISE EXCEPTION 'Refusing empty catalog reconciliation'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(dataset->'pornhwa') LOOP
  srcid:=r->>'id'; IF srcid IS NULL OR coalesce(r->>'title','')='' THEN RAISE EXCEPTION 'Invalid source series'; END IF;
  SELECT tatakai_id INTO cid FROM public.adult_source_records WHERE source='pornhwadb' AND kind='series' AND source_id=srcid;
  aid:=NULL; mid:=NULL;
  FOR link IN SELECT value FROM jsonb_array_elements(coalesce(r->'externalLinks','[]')) LOOP
   IF lower(coalesce(link->>'siteName',''))='anilist' AND link->>'url' ~ '://anilist[.]co/manga/[0-9]+' THEN aid:=substring(link->>'url' FROM '/manga/([0-9]+)')::integer; END IF;
   IF lower(coalesce(link->>'siteName','')) IN ('myanimelist','mal') AND link->>'url' ~ '://myanimelist[.]net/manga/[0-9]+' THEN mid:=substring(link->>'url' FROM '/manga/([0-9]+)')::integer; END IF;
  END LOOP;
  IF cid IS NULL AND aid IS NOT NULL THEN SELECT tatakai_id INTO cid FROM public.content_items WHERE anilist_id=aid AND format IN ('MANGA','ONE_SHOT','MANHWA','MANHUA','OEL'); END IF;
  IF cid IS NULL AND mid IS NOT NULL THEN SELECT CASE WHEN count(*)=1 THEN (array_agg(tatakai_id))[1] END INTO cid FROM public.content_items WHERE mal_id=mid AND format IN ('MANGA','ONE_SHOT','MANHWA','MANHUA','OEL'); END IF;
  IF cid IS NULL THEN
   INSERT INTO public.content_items(anilist_id,mal_id,title_romaji,title_english,description,cover_image_large,format,status,chapters,genres,is_adult,country_of_origin,start_date,average_score,popularity,synonyms,external_links,last_synced_from)
   VALUES(aid,mid,r->>'title',r->>'title',r->>'description',r->>'coverImage','MANGA',CASE r->>'status' WHEN 'Completed' THEN 'FINISHED' WHEN 'On Going' THEN 'RELEASING' ELSE 'HIATUS' END,(r->>'totalChapters')::integer,ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'genreTags','[]'))),true,'KR',jsonb_build_object('year',r->'releaseYear'),round(coalesce((r->'ratingAggregate'->>'averageRating')::numeric,0)*20)::integer,coalesce((r->>'viewCount')::integer,0),ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'alternativeTitles','[]'))),r->'externalLinks','pornhwadb') RETURNING tatakai_id INTO cid;
   inserted_count:=inserted_count+1;
  ELSE
   UPDATE public.content_items SET is_adult=true WHERE tatakai_id=cid;
   UPDATE public.content_items SET is_adult=true,source_catalog_active=true,chapters=coalesce((r->>'totalChapters')::integer,chapters),updated_at=now() WHERE tatakai_id=cid AND last_synced_from='pornhwadb';
  END IF;
  INSERT INTO public.adult_source_records(source,kind,source_id,payload,tatakai_id,active) VALUES('pornhwadb','series',srcid,r,cid,true)
  ON CONFLICT(source,kind,source_id) DO UPDATE SET payload=excluded.payload,tatakai_id=excluded.tatakai_id,active=true,imported_at=now();
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(dataset->'creators','[]')) LOOP
  INSERT INTO public.adult_source_records(source,kind,source_id,payload) VALUES('pornhwadb','creator',r->>'id',r) ON CONFLICT(source,kind,source_id) DO UPDATE SET payload=excluded.payload,active=true,imported_at=now();
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(dataset->'tags','[]')) LOOP
  INSERT INTO public.adult_source_records(source,kind,source_id,payload) VALUES('pornhwadb','tag',r->>'id',r) ON CONFLICT(source,kind,source_id) DO UPDATE SET payload=excluded.payload,active=true,imported_at=now();
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(dataset->'slugHistory','[]')) LOOP
  INSERT INTO public.adult_source_records(source,kind,source_id,payload) VALUES('pornhwadb','slug',r->>'oldSlug',r) ON CONFLICT(source,kind,source_id) DO UPDATE SET payload=excluded.payload,active=true,imported_at=now();
 END LOOP;
 IF reconcile THEN
  UPDATE public.adult_source_records SET active=false WHERE source='pornhwadb' AND kind='series' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(dataset->'pornhwa') x WHERE x->>'id'=source_id);
  UPDATE public.content_items SET source_catalog_active=false WHERE last_synced_from='pornhwadb' AND NOT EXISTS(SELECT 1 FROM public.adult_source_records r WHERE r.tatakai_id=content_items.tatakai_id AND r.source='pornhwadb' AND r.kind='series' AND r.active);
  INSERT INTO public.adult_sync_state(source,manifest,watermark) VALUES('pornhwadb',manifest,dataset->>'generatedAt') ON CONFLICT(source) DO UPDATE SET manifest=excluded.manifest,watermark=excluded.watermark,updated_at=now();
 END IF;
 RETURN jsonb_build_object('series',jsonb_array_length(dataset->'pornhwa'),'created',inserted_count);
END $$;
REVOKE ALL ON FUNCTION public.import_pornhwadb_catalog(jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_pornhwadb_catalog(jsonb,jsonb,boolean) TO service_role;

NOTIFY pgrst, 'reload schema';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.adult_source_records, public.adult_sync_state, public.adult_gallery_pages TO service_role;
