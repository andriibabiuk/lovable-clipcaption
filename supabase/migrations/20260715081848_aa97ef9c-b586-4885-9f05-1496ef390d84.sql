
-- Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS renewal_date timestamptz;

-- video_metadata
CREATE TABLE public.video_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_name text NOT NULL,
  thumbnail_url text,
  language text,
  topic text,
  keywords text[] NOT NULL DEFAULT '{}',
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  subtitle_srt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_metadata TO authenticated;
GRANT ALL ON public.video_metadata TO service_role;

ALTER TABLE public.video_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own video metadata"
  ON public.video_metadata FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all video metadata"
  ON public.video_metadata FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own video metadata"
  ON public.video_metadata FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own video metadata"
  ON public.video_metadata FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own video metadata"
  ON public.video_metadata FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_video_metadata_updated_at
  BEFORE UPDATE ON public.video_metadata
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX video_metadata_user_created_idx
  ON public.video_metadata (user_id, created_at DESC);

-- subscriptions
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text,
  plan_type text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  renewal_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Top keywords aggregation for admin
CREATE OR REPLACE FUNCTION public.top_keywords(_limit integer DEFAULT 30)
RETURNS TABLE(keyword text, uses bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(trim(kw)) AS keyword, COUNT(*)::bigint AS uses
  FROM public.video_metadata,
       LATERAL unnest(keywords) AS kw
  WHERE length(trim(kw)) > 0
  GROUP BY lower(trim(kw))
  ORDER BY uses DESC, keyword ASC
  LIMIT _limit;
$$;

REVOKE ALL ON FUNCTION public.top_keywords(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.top_keywords(integer) TO authenticated;
