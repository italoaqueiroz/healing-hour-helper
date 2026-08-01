-- Existing staff keep access. New self-service accounts require admin approval.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.profiles
SET approved = true,
    approved_at = COALESCE(approved_at, created_at)
WHERE approved = false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, approved, approved_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.invited_at IS NOT NULL,
    CASE WHEN NEW.invited_at IS NOT NULL THEN now() ELSE NULL END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id AND approved = true
  )
$$;

DROP POLICY IF EXISTS "Staff can view profiles" ON public.profiles;
CREATE POLICY "Staff or self can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Rooms viewable by authenticated" ON public.rooms;
CREATE POLICY "Staff can view rooms" ON public.rooms
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Therapist or admin creates appointments" ON public.appointments;
CREATE POLICY "Approved therapist or admin creates appointments" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    AND (auth.uid() = therapist_id OR public.has_role(auth.uid(), 'admin'))
  );

DROP POLICY IF EXISTS "Therapist or admin updates appointments" ON public.appointments;
CREATE POLICY "Approved therapist or admin updates appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    public.is_staff(auth.uid())
    AND (auth.uid() = therapist_id OR public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    public.is_staff(auth.uid())
    AND (auth.uid() = therapist_id OR public.has_role(auth.uid(), 'admin'))
  );

DROP POLICY IF EXISTS "Therapist or admin deletes appointments" ON public.appointments;
CREATE POLICY "Approved therapist or admin deletes appointments" ON public.appointments
  FOR DELETE TO authenticated
  USING (
    public.is_staff(auth.uid())
    AND (auth.uid() = therapist_id OR public.has_role(auth.uid(), 'admin'))
  );

DROP POLICY IF EXISTS "Authenticated can create patients" ON public.patients;
CREATE POLICY "Staff can create patients" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.notify_therapists_on_check_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
BEGIN
  IF OLD.check_in_at IS NOT NULL OR NEW.check_in_at IS NULL OR NEW.event_type <> 'session' THEN
    RETURN NEW;
  END IF;

  FOR recipient IN
    SELECT DISTINCT id
    FROM unnest(
      ARRAY[NEW.therapist_id, NEW.co_therapist_id]
      || COALESCE(NEW.additional_therapist_ids, '{}'::uuid[])
    ) AS id
    WHERE id IS NOT NULL AND id <> NEW.check_in_by
  LOOP
    INSERT INTO public.notifications (recipient_id, appointment_id, kind, title, message)
    VALUES (
      recipient,
      NEW.id,
      'check_in',
      'Paciente na receção',
      'Seu paciente fez check-in na receção e aguarda atendimento.'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
