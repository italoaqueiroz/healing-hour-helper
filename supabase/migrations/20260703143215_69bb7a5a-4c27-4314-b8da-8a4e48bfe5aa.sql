ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS phone text;
CREATE INDEX IF NOT EXISTS patients_full_name_idx ON public.patients (lower(full_name));