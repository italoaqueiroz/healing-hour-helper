CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('check_in')),
  title text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications (recipient_id, created_at DESC)
  WHERE read_at IS NULL;

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (recipient_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_therapists_on_check_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
  patient_label text;
  room_label text;
BEGIN
  IF OLD.check_in_at IS NOT NULL OR NEW.check_in_at IS NULL OR NEW.event_type <> 'session' THEN
    RETURN NEW;
  END IF;

  patient_label := COALESCE(NULLIF(BTRIM(NEW.patient_name), ''), 'O paciente');
  SELECT name INTO room_label FROM public.rooms WHERE id = NEW.room_id;

  FOR recipient IN
    SELECT DISTINCT assigned_id
    FROM unnest(
      ARRAY[NEW.therapist_id, NEW.co_therapist_id]
      || COALESCE(NEW.additional_therapist_ids, '{}'::uuid[])
    ) AS assigned_id
    WHERE assigned_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (
      recipient_id,
      appointment_id,
      kind,
      title,
      message
    ) VALUES (
      recipient,
      NEW.id,
      'check_in',
      'Paciente chegou',
      patient_label || ' fez check-in' ||
        CASE WHEN room_label IS NOT NULL THEN ' para ' || room_label ELSE '' END || '.'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_check_in_notification ON public.appointments;
CREATE TRIGGER appointments_check_in_notification
AFTER UPDATE OF check_in_at ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.notify_therapists_on_check_in();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END;
$$;
