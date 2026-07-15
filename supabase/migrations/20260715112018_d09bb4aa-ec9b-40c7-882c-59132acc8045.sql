
ALTER TABLE public.video_metadata ADD COLUMN IF NOT EXISTS audio_path TEXT;

-- RLS on storage.objects: users manage files under their own {user_id}/ prefix in the optimized-audio bucket.
CREATE POLICY "Users read own optimized audio"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'optimized-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own optimized audio"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'optimized-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own optimized audio"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'optimized-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
