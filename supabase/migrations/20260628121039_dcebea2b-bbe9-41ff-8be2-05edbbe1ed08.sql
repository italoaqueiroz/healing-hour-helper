
-- Event type
DO $$ BEGIN
  CREATE TYPE public.event_type AS ENUM ('session','meeting','online','block','vacation','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Appointment columns
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS co_therapist_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_type public.event_type NOT NULL DEFAULT 'session',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS check_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- For non-session events, patient_name can be empty placeholder; keep NOT NULL for compat but allow ''
ALTER TABLE public.appointments ALTER COLUMN patient_name DROP NOT NULL;

CREATE INDEX IF NOT EXISTS appointments_co_therapist_idx ON public.appointments(co_therapist_id);

-- Therapist unavailability
CREATE TABLE IF NOT EXISTS public.therapist_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.therapist_unavailability TO authenticated;
GRANT ALL ON public.therapist_unavailability TO service_role;

ALTER TABLE public.therapist_unavailability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Unavailability viewable by authenticated"
  ON public.therapist_unavailability FOR SELECT TO authenticated USING (true);

CREATE POLICY "Therapist or admin inserts unavailability"
  ON public.therapist_unavailability FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = therapist_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Therapist or admin updates unavailability"
  ON public.therapist_unavailability FOR UPDATE TO authenticated
  USING (auth.uid() = therapist_id OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = therapist_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Therapist or admin deletes unavailability"
  ON public.therapist_unavailability FOR DELETE TO authenticated
  USING (auth.uid() = therapist_id OR public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS therapist_unavailability_therapist_idx ON public.therapist_unavailability(therapist_id);
CREATE INDEX IF NOT EXISTS therapist_unavailability_range_idx ON public.therapist_unavailability(starts_at, ends_at);
