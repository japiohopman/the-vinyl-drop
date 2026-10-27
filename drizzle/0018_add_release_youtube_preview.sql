ALTER TABLE public.releases
  ADD COLUMN youtube_video_id text;
--> statement-breakpoint
ALTER TABLE public.releases
  ADD CONSTRAINT releases_youtube_video_id_check
  CHECK (youtube_video_id IS NULL OR youtube_video_id ~ '^[A-Za-z0-9_-]{11}$');
