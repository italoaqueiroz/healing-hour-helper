
-- Staff membership helper (avoids recursion on profiles SELECT policy)
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id)
$$;

REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

-- Tighten SELECT policies: only staff (not just any authenticated JWT) can read
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Staff can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Appointments viewable by authenticated" ON public.appointments;
CREATE POLICY "Staff can view appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Unavailability viewable by authenticated" ON public.therapist_unavailability;
CREATE POLICY "Staff can view unavailability" ON public.therapist_unavailability
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Patients viewable by authenticated" ON public.patients;
CREATE POLICY "Staff can view patients" ON public.patients
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Auth read children" ON public.pro_infancia_children;
CREATE POLICY "Staff can view children" ON public.pro_infancia_children
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Auth read notes" ON public.pro_infancia_notes;
CREATE POLICY "Staff can view notes" ON public.pro_infancia_notes
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- Tighten UPDATE policies from USING(true) to creator-or-admin
DROP POLICY IF EXISTS "Authenticated can update patients" ON public.patients;
CREATE POLICY "Creator or admin updates patients" ON public.patients
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Auth update children" ON public.pro_infancia_children;
CREATE POLICY "Creator or admin updates children" ON public.pro_infancia_children
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::app_role));

-- Hide internal SECURITY DEFINER helpers from direct API calls.
-- Triggers still execute; RLS policies calling has_role still work (owner-run).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_mark_present() FROM PUBLIC, anon, authenticated;
-- has_role and claim_admin are intentionally callable by authenticated users
-- (has_role: used by server code via RPC; claim_admin: bootstrap first admin)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_admin() FROM PUBLIC, anon;
