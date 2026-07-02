ALTER TABLE public.appointments DROP CONSTRAINT appointments_therapist_id_fkey;
ALTER TABLE public.appointments DROP CONSTRAINT appointments_co_therapist_id_fkey;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_therapist_id_fkey
  FOREIGN KEY (therapist_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_co_therapist_id_fkey
  FOREIGN KEY (co_therapist_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';