
-- 1. profiles: aprovação + onboarding
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS password_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_duration_selected_at timestamptz,
  ADD COLUMN IF NOT EXISTS tutorial_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tutorial_completed_at timestamptz;

UPDATE public.profiles SET approved = true, approved_at = now() WHERE approved = false;

-- 2. indisponibilidade: tipo
ALTER TABLE public.therapist_unavailability
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'unavailable';
ALTER TABLE public.therapist_unavailability DROP CONSTRAINT IF EXISTS therapist_unavailability_kind_check;
ALTER TABLE public.therapist_unavailability
  ADD CONSTRAINT therapist_unavailability_kind_check
  CHECK (kind IN ('unavailable','block','vacation','other'));

-- 3. notificações
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid());
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
DROP POLICY IF EXISTS "notifications_insert_staff" ON public.notifications;
CREATE POLICY "notifications_insert_staff" ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON public.notifications (recipient_id, created_at DESC);
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. auditoria
CREATE TABLE IF NOT EXISTS public.appointment_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid,
  action text NOT NULL CHECK (action IN ('created','updated','deleted')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  patient_name text,
  event_type text,
  changed_fields text[] NOT NULL DEFAULT '{}',
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.appointment_audit_logs TO authenticated;
GRANT ALL ON public.appointment_audit_logs TO service_role;
ALTER TABLE public.appointment_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_select_admin" ON public.appointment_audit_logs;
CREATE POLICY "audit_select_admin" ON public.appointment_audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS appointment_audit_created_idx ON public.appointment_audit_logs (created_at DESC);

CREATE OR REPLACE FUNCTION public.log_appointment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed text[] := '{}';
  k text;
  old_j jsonb;
  new_j jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.appointment_audit_logs (appointment_id, action, actor_id, patient_name, event_type, changed_fields, new_data)
    VALUES (NEW.id, 'created', auth.uid(), NEW.patient_name, NEW.event_type, '{}', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.appointment_audit_logs (appointment_id, action, actor_id, patient_name, event_type, changed_fields, old_data)
    VALUES (OLD.id, 'deleted', auth.uid(), OLD.patient_name, OLD.event_type, '{}', to_jsonb(OLD));
    RETURN OLD;
  ELSE
    old_j := to_jsonb(OLD);
    new_j := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(new_j) LOOP
      IF k <> 'updated_at' AND (old_j -> k) IS DISTINCT FROM (new_j -> k) THEN
        changed := array_append(changed, k);
      END IF;
    END LOOP;
    IF array_length(changed, 1) IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.appointment_audit_logs (appointment_id, action, actor_id, patient_name, event_type, changed_fields, old_data, new_data)
    VALUES (NEW.id, 'updated', auth.uid(), NEW.patient_name, NEW.event_type, changed, old_j, new_j);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS appointments_audit ON public.appointments;
CREATE TRIGGER appointments_audit
AFTER INSERT OR UPDATE OR DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.log_appointment_change();

-- 5. RPCs de onboarding
CREATE OR REPLACE FUNCTION public.complete_password_setup()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE row public.profiles;
BEGIN
  UPDATE public.profiles SET password_set_at = now() WHERE id = auth.uid() RETURNING * INTO row;
  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_duration_setup(_minutes integer)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE row public.profiles;
BEGIN
  IF _minutes < 15 OR _minutes > 240 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;
  UPDATE public.profiles
     SET default_session_minutes = _minutes,
         session_duration_selected_at = now()
   WHERE id = auth.uid()
  RETURNING * INTO row;
  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_tutorial()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE row public.profiles;
BEGIN
  UPDATE public.profiles
     SET tutorial_step = tutorial_step + 1,
         tutorial_completed_at = CASE WHEN tutorial_step + 1 >= 4 THEN now() ELSE tutorial_completed_at END
   WHERE id = auth.uid()
  RETURNING * INTO row;
  RETURN row;
END;
$$;
