
-- 1) Novos estados de presença
ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'absent_therapist';
ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'absent_unjustified';
ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'absent_justified';

-- 2) Cor por terapeuta no profile
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS color text;

-- Paleta fixa: gera cor determinística a partir do id do utilizador
CREATE OR REPLACE FUNCTION public.assign_profile_color()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  palette text[] := ARRAY[
    '#8B2E2E','#2E5E8B','#5E8B2E','#8B5E2E','#5E2E8B',
    '#2E8B5E','#8B2E5E','#2E2E8B','#8B8B2E','#2E8B8B',
    '#B85C5C','#5C8BB8','#8BB85C','#B88B5C','#8B5CB8',
    '#5CB88B','#B85C8B','#5C5CB8','#B8B85C','#5CB8B8'
  ];
  idx int;
BEGIN
  IF NEW.color IS NULL THEN
    idx := (abs(hashtext(NEW.id::text)) % array_length(palette, 1)) + 1;
    NEW.color := palette[idx];
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_assign_color ON public.profiles;
CREATE TRIGGER profiles_assign_color
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_profile_color();

-- Backfill para perfis existentes
UPDATE public.profiles SET color = NULL WHERE color IS NULL;
DO $$
DECLARE r record;
DECLARE palette text[] := ARRAY[
  '#8B2E2E','#2E5E8B','#5E8B2E','#8B5E2E','#5E2E8B',
  '#2E8B5E','#8B2E5E','#2E2E8B','#8B8B2E','#2E8B8B',
  '#B85C5C','#5C8BB8','#8BB85C','#B88B5C','#8B5CB8',
  '#5CB88B','#B85C8B','#5C5CB8','#B8B85C','#5CB8B8'
];
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE color IS NULL LOOP
    UPDATE public.profiles SET color = palette[(abs(hashtext(r.id::text)) % array_length(palette,1)) + 1] WHERE id = r.id;
  END LOOP;
END $$;

-- 3) Tabela de pacientes
CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  registration_number text UNIQUE,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients viewable by authenticated" ON public.patients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create patients" ON public.patients
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update patients" ON public.patients
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins delete patients" ON public.patients
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS patients_set_updated_at ON public.patients;
CREATE TRIGGER patients_set_updated_at
BEFORE UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS patients_registration_idx ON public.patients (registration_number);
CREATE INDEX IF NOT EXISTS patients_name_idx ON public.patients (lower(full_name));

-- 4) Liga atendimentos a pacientes (opcional, mantemos patient_name como cache)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS appointments_patient_id_idx ON public.appointments (patient_id);

-- 5) Marcação automática de Presente após 1h do fim
CREATE OR REPLACE FUNCTION public.auto_mark_present()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.appointments
  SET attendance_status = 'present', attendance_marked_at = now()
  WHERE attendance_status = 'pending'
    AND ends_at < now() - interval '1 hour';
$$;

-- Agendar a cada 15 minutos
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN
  PERFORM cron.unschedule('auto-mark-present');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('auto-mark-present', '*/15 * * * *', $$ SELECT public.auto_mark_present(); $$);
