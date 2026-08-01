-- Keep the therapist profile as a historical record when the authentication
-- account is removed. Appointments and audit entries continue to show who was
-- responsible, while auth.users deletion still revokes access immediately.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

