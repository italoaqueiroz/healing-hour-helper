
-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'therapist');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Allow reading any role for the current user (used by client to know if admin)
CREATE POLICY "Admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Recurrence grouping on appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS recurrence_group_id uuid;

-- Replace appointment policies to grant admin override
DROP POLICY IF EXISTS "Therapist updates own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Therapist deletes own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Therapist creates own appointments" ON public.appointments;

CREATE POLICY "Therapist or admin creates appointments" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = therapist_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Therapist or admin updates appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (auth.uid() = therapist_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = therapist_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Therapist or admin deletes appointments" ON public.appointments
  FOR DELETE TO authenticated
  USING (auth.uid() = therapist_id OR public.has_role(auth.uid(), 'admin'));
