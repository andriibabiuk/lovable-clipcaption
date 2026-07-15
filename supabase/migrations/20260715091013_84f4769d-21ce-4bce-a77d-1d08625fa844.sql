ALTER TABLE public.video_metadata ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('processing','completed','failed'));

COMMENT ON COLUMN public.video_metadata.status IS 'Lifecycle state of the metadata generation job.';