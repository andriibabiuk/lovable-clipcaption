
-- 1. Role enum + user_roles table
CREATE TYPE public.app_role AS ENUM ('free', 'premium', 'admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role helper (security definer avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Auto-assign 'free' role on new signup
CREATE OR REPLACE FUNCTION public.assign_default_role()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'free')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_default_role() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created_assign_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.assign_default_role();

-- Backfill existing users as free
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'free' FROM auth.users
ON CONFLICT DO NOTHING;

-- 3. Generations log (one row per generation for quota accounting)
CREATE TABLE public.generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX generations_user_created_idx
  ON public.generations (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.generations TO authenticated;
GRANT ALL ON public.generations TO service_role;

ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own generations"
  ON public.generations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all generations"
  ON public.generations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own generations"
  ON public.generations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. Quota helpers
CREATE OR REPLACE FUNCTION public.monthly_generation_limit(_user_id UUID)
RETURNS INTEGER
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'admin')   THEN NULL   -- unlimited
    WHEN public.has_role(_user_id, 'premium') THEN 150
    ELSE 3
  END
$$;

REVOKE EXECUTE ON FUNCTION public.monthly_generation_limit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.monthly_generation_limit(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_user_quota()
RETURNS TABLE (tier public.app_role, used INTEGER, monthly_limit INTEGER, remaining INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  t   public.app_role;
  lim INTEGER;
  cnt INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT CASE
    WHEN public.has_role(uid, 'admin')   THEN 'admin'::public.app_role
    WHEN public.has_role(uid, 'premium') THEN 'premium'::public.app_role
    ELSE 'free'::public.app_role
  END INTO t;

  lim := public.monthly_generation_limit(uid);

  SELECT COUNT(*)::INTEGER INTO cnt
  FROM public.generations
  WHERE user_id = uid
    AND created_at >= date_trunc('month', now());

  RETURN QUERY SELECT
    t,
    cnt,
    lim,
    CASE WHEN lim IS NULL THEN NULL ELSE GREATEST(lim - cnt, 0) END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_quota() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_generation()
RETURNS TABLE (generation_id UUID, used INTEGER, monthly_limit INTEGER, remaining INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid  UUID := auth.uid();
  lim  INTEGER;
  cnt  INTEGER;
  new_id UUID;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  lim := public.monthly_generation_limit(uid);

  SELECT COUNT(*)::INTEGER INTO cnt
  FROM public.generations
  WHERE user_id = uid
    AND created_at >= date_trunc('month', now());

  IF lim IS NOT NULL AND cnt >= lim THEN
    RAISE EXCEPTION 'Monthly generation limit reached (%).', lim
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.generations (user_id)
  VALUES (uid)
  RETURNING id INTO new_id;

  cnt := cnt + 1;

  RETURN QUERY SELECT
    new_id,
    cnt,
    lim,
    CASE WHEN lim IS NULL THEN NULL ELSE GREATEST(lim - cnt, 0) END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_generation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_generation() TO authenticated, service_role;
