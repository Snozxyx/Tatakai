CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'moderator',
    'user'
);


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NULL)
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: update_comment_likes_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_comment_likes_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.comments SET likes_count = likes_count - 1 WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: comment_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    comment_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    anime_id text NOT NULL,
    episode_id text,
    content text NOT NULL,
    parent_id uuid,
    likes_count integer DEFAULT 0,
    is_spoiler boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comments_content_check CHECK ((char_length(content) <= 2000))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    username text,
    display_name text,
    avatar_url text,
    bio text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    anime_id text NOT NULL,
    rating integer NOT NULL,
    review text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ratings_rating_check CHECK (((rating >= 1) AND (rating <= 10)))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'user'::public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: watch_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watch_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    anime_id text NOT NULL,
    anime_name text NOT NULL,
    anime_poster text,
    episode_id text NOT NULL,
    episode_number integer NOT NULL,
    progress_seconds integer DEFAULT 0,
    duration_seconds integer,
    completed boolean DEFAULT false,
    watched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: watchlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watchlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    anime_id text NOT NULL,
    anime_name text NOT NULL,
    anime_poster text,
    status text DEFAULT 'plan_to_watch'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT watchlist_status_check CHECK ((status = ANY (ARRAY['watching'::text, 'completed'::text, 'plan_to_watch'::text, 'dropped'::text, 'on_hold'::text])))
);


--
-- Name: comment_likes comment_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_pkey PRIMARY KEY (id);


--
-- Name: comment_likes comment_likes_user_id_comment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_user_id_comment_id_key UNIQUE (user_id, comment_id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: ratings ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_user_id_anime_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_user_id_anime_id_key UNIQUE (user_id, anime_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: watch_history watch_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watch_history
    ADD CONSTRAINT watch_history_pkey PRIMARY KEY (id);


--
-- Name: watch_history watch_history_user_id_episode_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watch_history
    ADD CONSTRAINT watch_history_user_id_episode_id_key UNIQUE (user_id, episode_id);


--
-- Name: watchlist watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_pkey PRIMARY KEY (id);


--
-- Name: watchlist watchlist_user_id_anime_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_user_id_anime_id_key UNIQUE (user_id, anime_id);


--
-- Name: idx_comments_anime_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_anime_id ON public.comments USING btree (anime_id);


--
-- Name: idx_comments_episode_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_episode_id ON public.comments USING btree (episode_id);


--
-- Name: idx_ratings_anime_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ratings_anime_id ON public.ratings USING btree (anime_id);


--
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);


--
-- Name: idx_watch_history_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_watch_history_user_id ON public.watch_history USING btree (user_id);


--
-- Name: idx_watch_history_watched_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_watch_history_watched_at ON public.watch_history USING btree (watched_at DESC);


--
-- Name: idx_watchlist_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_watchlist_user_id ON public.watchlist USING btree (user_id);


--
-- Name: comment_likes update_comment_likes_count_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_comment_likes_count_trigger AFTER INSERT OR DELETE ON public.comment_likes FOR EACH ROW EXECUTE FUNCTION public.update_comment_likes_count();


--
-- Name: comments update_comments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ratings update_ratings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ratings_updated_at BEFORE UPDATE ON public.ratings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: watchlist update_watchlist_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_watchlist_updated_at BEFORE UPDATE ON public.watchlist FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: comment_likes comment_likes_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comment_likes comment_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: comments comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comments comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: watch_history watch_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watch_history
    ADD CONSTRAINT watch_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: watchlist watchlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles Admins can delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can insert roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can update roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can view all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: comments Authenticated users can create comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create comments" ON public.comments FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: ratings Authenticated users can create ratings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create ratings" ON public.ratings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: comment_likes Authenticated users can like comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can like comments" ON public.comment_likes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: comments Comments are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Comments are viewable by everyone" ON public.comments FOR SELECT USING (true);


--
-- Name: comment_likes Likes are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Likes are viewable by everyone" ON public.comment_likes FOR SELECT USING (true);


--
-- Name: profiles Profiles are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);


--
-- Name: ratings Ratings are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Ratings are viewable by everyone" ON public.ratings FOR SELECT USING (true);


--
-- Name: comments Users can delete own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own comments" ON public.comments FOR DELETE USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role)));


--
-- Name: watch_history Users can delete own history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own history" ON public.watch_history FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: ratings Users can delete own ratings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own ratings" ON public.ratings FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: watchlist Users can delete own watchlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own watchlist" ON public.watchlist FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: watch_history Users can insert own history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own history" ON public.watch_history FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: watchlist Users can insert own watchlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own watchlist" ON public.watchlist FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: comment_likes Users can unlike comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can unlike comments" ON public.comment_likes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: comments Users can update own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own comments" ON public.comments FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: watch_history Users can update own history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own history" ON public.watch_history FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: ratings Users can update own ratings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own ratings" ON public.ratings FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: watchlist Users can update own watchlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own watchlist" ON public.watchlist FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: watch_history Users can view own history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own history" ON public.watch_history FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: watchlist Users can view own watchlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own watchlist" ON public.watchlist FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: comment_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: watch_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;

--
-- Name: watchlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;