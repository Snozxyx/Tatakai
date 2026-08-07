-- Add unique constraint to anilist_id in anime_id_map to allow it as an upsert target
alter table mappings.anime_id_map add constraint anime_id_map_anilist_id_key unique (anilist_id);
