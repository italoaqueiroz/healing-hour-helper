ALTER TABLE public.therapist_unavailability
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'unavailable';

ALTER TABLE public.therapist_unavailability
  DROP CONSTRAINT IF EXISTS therapist_unavailability_kind_check;

ALTER TABLE public.therapist_unavailability
  ADD CONSTRAINT therapist_unavailability_kind_check
  CHECK (kind IN ('unavailable', 'block', 'vacation', 'other'));

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
    AND ends_at < now() - interval '1 hour';
$$;

CREATE OR REPLACE FUNCTION public.notify_therapists_on_check_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
BEGIN
  IF OLD.check_in_at IS NOT NULL
    OR NEW.check_in_at IS NULL
    OR NEW.event_type NOT IN ('session', 'online') THEN
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
