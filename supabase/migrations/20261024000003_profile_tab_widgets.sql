-- Add SekaiPop widgets for every profile tab. Existing saved layouts remain valid.
BEGIN;

CREATE OR REPLACE FUNCTION public.validate_sekai_configuration(p jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE w jsonb; m jsonb; k text; ids text[] := '{}'; singletons text[] := '{}'; mobile_ids text[] := '{}';
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM '1'
    OR jsonb_typeof(p->'widgets') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p->'mobile') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p->'colors') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p->'wallpaper') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid SekaiPop settings' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p->'widgets') NOT BETWEEN 1 AND 32 OR jsonb_array_length(p->'mobile') > 32
    OR COALESCE(p->>'mode','') NOT IN ('light','dark','darker')
    OR jsonb_typeof(p->'palette') IS DISTINCT FROM 'string' OR length(p->>'palette') > 30
    OR jsonb_typeof(p->'motion') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p->'stickers') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Invalid SekaiPop appearance' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['ink','primary','secondary','paper'] LOOP
    IF jsonb_typeof(p->'colors'->k) IS DISTINCT FROM 'string' OR (p->'colors'->>k) !~ '^#[0-9a-fA-F]{6}$' THEN
      RAISE EXCEPTION 'Invalid profile color' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['radius','shadow'] LOOP
    IF jsonb_typeof(p->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid card dimensions' USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF (p->>'radius')::numeric NOT BETWEEN 4 AND 28 OR (p->>'shadow')::numeric NOT BETWEEN 0 AND 10 THEN
    RAISE EXCEPTION 'Card dimensions out of range' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['x','y','dim','blur'] LOOP
    IF jsonb_typeof(p->'wallpaper'->k) IS DISTINCT FROM 'number' OR (p->'wallpaper'->>k)::numeric < 0 THEN
      RAISE EXCEPTION 'Invalid wallpaper settings' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (p#>>'{wallpaper,x}')::numeric > 100 OR (p#>>'{wallpaper,y}')::numeric > 100
    OR (p#>>'{wallpaper,dim}')::numeric > 80 OR (p#>>'{wallpaper,blur}')::numeric > 20
    OR jsonb_typeof(p#>'{wallpaper,url}') IS DISTINCT FROM 'string'
    OR length(p#>>'{wallpaper,url}') > 2048
    OR ((p#>>'{wallpaper,url}') NOT IN ('','/assets/profile-themes/sekaipop/default-wallpaper.png') AND (p#>>'{wallpaper,url}') !~ '^https://[^/@[:space:]]+([/:?#]|$)') THEN
    RAISE EXCEPTION 'Invalid wallpaper URL or crop' USING ERRCODE = '22023';
  END IF;
  FOR w IN SELECT value FROM jsonb_array_elements(p->'widgets') LOOP
    IF jsonb_typeof(w) IS DISTINCT FROM 'object' OR COALESCE(w->>'kind','') NOT IN
      ('identity','stats','streaks','activity','favorites','library','badges','links','clock','calendar','note','image','overview','watchlist','manga-readlist','novel-readlist','history','vault')
      OR jsonb_typeof(w->'id') IS DISTINCT FROM 'string' OR (w->>'id') !~ '^[a-zA-Z0-9-]{1,64}$'
      OR (w->>'id') = ANY(ids) OR jsonb_typeof(w->'visible') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Invalid profile widget' USING ERRCODE = '22023';
    END IF;
    ids := array_append(ids,w->>'id');
    IF w->>'kind' NOT IN ('note','image') THEN
      IF (w->>'kind') = ANY(singletons) THEN RAISE EXCEPTION 'Duplicate profile widget' USING ERRCODE = '22023'; END IF;
      singletons := array_append(singletons,w->>'kind');
    END IF;
    IF w->>'kind' = 'identity' AND w->>'visible' <> 'true' THEN RAISE EXCEPTION 'The player card is required' USING ERRCODE = '22023'; END IF;
    FOREACH k IN ARRAY ARRAY['x','y','w','h','z','rotation'] LOOP
      IF jsonb_typeof(w->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid widget position' USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF (w->>'w')::numeric NOT BETWEEN 200 AND 900 OR (w->>'h')::numeric NOT BETWEEN 160 AND 900
      OR (w->>'x')::numeric < 0 OR (w->>'y')::numeric < 0
      OR (w->>'x')::numeric + (w->>'w')::numeric > 1144 OR (w->>'y')::numeric + (w->>'h')::numeric > 4000
      OR (w->>'rotation')::numeric NOT BETWEEN -12 AND 12 OR (w->>'z')::numeric NOT BETWEEN 0 AND 100 THEN
      RAISE EXCEPTION 'Widget outside scrapbook bounds' USING ERRCODE = '22023';
    END IF;
    FOREACH k IN ARRAY ARRAY['title','text','image'] LOOP
      IF jsonb_typeof(w->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid widget content' USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF length(w->>'title') > 60 OR length(w->>'text') > 2000 OR length(w->>'image') > 2048
      OR ((w->>'image') NOT IN ('','/assets/profile-themes/sekaipop/default-wallpaper.png') AND (w->>'image') !~ '^https://[^/@[:space:]]+([/:?#]|$)') THEN
      RAISE EXCEPTION 'Invalid widget content length or image URL' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF NOT ('identity' = ANY(singletons)) THEN RAISE EXCEPTION 'The player card is required' USING ERRCODE = '22023'; END IF;
  FOR m IN SELECT value FROM jsonb_array_elements(p->'mobile') LOOP
    IF jsonb_typeof(m->'id') IS DISTINCT FROM 'string' OR NOT ((m->>'id') = ANY(ids))
      OR (m->>'id') = ANY(mobile_ids) OR COALESCE(m->>'width','') NOT IN ('full','half') THEN
      RAISE EXCEPTION 'Invalid phone layout' USING ERRCODE = '22023';
    END IF;
    mobile_ids := array_append(mobile_ids,m->>'id');
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_sekai_configuration(jsonb) FROM PUBLIC;

COMMIT;
