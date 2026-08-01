ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS session_duration_selected_at timestamptz,
  ADD COLUMN IF NOT EXISTS tutorial_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tutorial_completed_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_tutorial_step_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tutorial_step_check CHECK (tutorial_step BETWEEN 0 AND 20);

CREATE TABLE IF NOT EXISTS public.appointment_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  patient_name text,
  event_type text,
  changed_fields text[] NOT NULL DEFAULT '{}',
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointment_audit_logs_created_idx
  ON public.appointment_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS appointment_audit_logs_appointment_idx
  ON public.appointment_audit_logs (appointment_id);

ALTER TABLE public.appointment_audit_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.appointment_audit_logs TO authenticated;
GRANT ALL ON public.appointment_audit_logs TO service_role;

DROP POLICY IF EXISTS "Admins view appointment history" ON public.appointment_audit_logs;
CREATE POLICY "Admins view appointment history"
  ON public.appointment_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.enforce_appointment_consistency_and_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  care_event boolean;
  attendance_or_checkin_changed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF actor IS NOT NULL AND NOT public.has_role(actor, 'admin') THEN
      RAISE EXCEPTION 'Apenas administradores podem eliminar sessões';
    END IF;
    IF actor IS NOT NULL AND now() >= OLD.ends_at + interval '1 hour' THEN
      RAISE EXCEPTION 'Esta sessão está congelada e não pode ser eliminada';
    END IF;
    RETURN OLD;
  END IF;

  care_event := NEW.event_type IN ('session', 'online');

  IF TG_OP = 'UPDATE' THEN
    IF actor IS NOT NULL AND now() >= OLD.ends_at + interval '1 hour' THEN
      RAISE EXCEPTION 'Esta sessão está congelada e não pode ser alterada';
    END IF;

    attendance_or_checkin_changed :=
      NEW.attendance_status IS DISTINCT FROM OLD.attendance_status
      OR NEW.check_in_at IS DISTINCT FROM OLD.check_in_at;

    IF care_event AND attendance_or_checkin_changed THEN
      IF OLD.check_in_at IS NOT NULL
        AND NEW.check_in_at IS NULL
        AND NEW.attendance_status = OLD.attendance_status
        AND NEW.attendance_status = 'present' THEN
        NEW.attendance_status := 'pending';
        NEW.attendance_marked_at := NULL;
      ELSIF NEW.attendance_status = 'present' AND NEW.check_in_at IS NULL THEN
        NEW.check_in_at := now();
        NEW.check_in_by := actor;
      ELSIF NEW.check_in_at IS NOT NULL AND NEW.attendance_status = 'pending' THEN
        NEW.attendance_status := 'present';
        NEW.attendance_marked_at := now();
      ELSIF NEW.attendance_status IN (
        'absent', 'absent_therapist', 'absent_unjustified', 'absent_justified',
        'cancelled', 'rescheduled'
      ) THEN
        NEW.check_in_at := NULL;
        NEW.check_in_by := NULL;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, color, default_session_minutes) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_duration_setup(_minutes integer)
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE result public.profiles;
BEGIN
  IF auth.uid() IS NULL OR _minutes < 15 OR _minutes > 240 THEN RAISE EXCEPTION 'Duração inválida'; END IF;
  UPDATE public.profiles
  SET default_session_minutes = _minutes,
      session_duration_selected_at = COALESCE(session_duration_selected_at, now())
  WHERE id = auth.uid() RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_tutorial()
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE result public.profiles;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  UPDATE public.profiles
  SET tutorial_step = LEAST(tutorial_step + 1, 6),
      tutorial_completed_at = CASE WHEN tutorial_step + 1 >= 6 THEN COALESCE(tutorial_completed_at, now()) ELSE tutorial_completed_at END
  WHERE id = auth.uid() RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_duration_setup(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.advance_tutorial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_duration_setup(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_tutorial() TO authenticated;

DROP TRIGGER IF EXISTS appointments_consistency_and_lock ON public.appointments;
CREATE TRIGGER appointments_consistency_and_lock
BEFORE UPDATE OR DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.enforce_appointment_consistency_and_lock();

CREATE OR REPLACE FUNCTION public.audit_appointment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_json jsonb;
  new_json jsonb;
  fields text[] := '{}';
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_json := to_jsonb(NEW);
    INSERT INTO public.appointment_audit_logs (
      appointment_id, action, actor_id, patient_name, event_type, changed_fields, new_data
    ) VALUES (
      NEW.id, 'created', auth.uid(), COALESCE(NEW.patient_name, NEW.title), NEW.event_type::text,
      ARRAY(SELECT jsonb_object_keys(new_json)), new_json
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    old_json := to_jsonb(OLD);
    INSERT INTO public.appointment_audit_logs (
      appointment_id, action, actor_id, patient_name, event_type, changed_fields, old_data
    ) VALUES (
      OLD.id, 'deleted', auth.uid(), COALESCE(OLD.patient_name, OLD.title), OLD.event_type::text,
      ARRAY(SELECT jsonb_object_keys(old_json)), old_json
    );
    RETURN OLD;
  END IF;

  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);
  SELECT COALESCE(array_agg(key ORDER BY key), '{}') INTO fields
  FROM (
    SELECT key
    FROM jsonb_object_keys(old_json || new_json) AS key
    WHERE old_json -> key IS DISTINCT FROM new_json -> key
      AND key NOT IN ('updated_at', 'attendance_marked_at')
  ) changed;

  IF cardinality(fields) > 0 THEN
    INSERT INTO public.appointment_audit_logs (
      appointment_id, action, actor_id, patient_name, event_type,
      changed_fields, old_data, new_data
    ) VALUES (
      NEW.id, 'updated', auth.uid(), COALESCE(NEW.patient_name, NEW.title), NEW.event_type::text,
      fields, old_json, new_json
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_audit_log ON public.appointments;
CREATE TRIGGER appointments_audit_log
AFTER INSERT OR UPDATE OR DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.audit_appointment_change();

DROP POLICY IF EXISTS "Approved therapist or admin updates appointments" ON public.appointments;
CREATE POLICY "Approved staff involved update appointments"
  ON public.appointments FOR UPDATE TO authenticated
  USING (
    public.is_staff(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR auth.uid() = therapist_id
      OR auth.uid() = co_therapist_id
      OR auth.uid() = ANY(additional_therapist_ids)
    )
  )
  WITH CHECK (
    public.is_staff(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR auth.uid() = therapist_id
      OR auth.uid() = co_therapist_id
      OR auth.uid() = ANY(additional_therapist_ids)
    )
  );

DROP POLICY IF EXISTS "Approved therapist or admin deletes appointments" ON public.appointments;
CREATE POLICY "Only admins delete appointments"
  ON public.appointments FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.auto_mark_present()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.appointments
  SET attendance_status = 'present', attendance_marked_at = now()
  WHERE attendance_status = 'pending'
    AND event_type IN ('session', 'online')
    AND check_in_at IS NOT NULL
    AND ends_at < now() - interval '1 hour';
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_appointment_consistency_and_lock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_appointment_change() FROM PUBLIC, anon, authenticated;
