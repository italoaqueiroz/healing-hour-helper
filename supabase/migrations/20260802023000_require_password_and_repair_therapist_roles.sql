ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_set_at timestamptz;

-- Approved active accounts without any role were created by the old invite
-- flow. They are therapists and must pass through onboarding.
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'therapist'::public.app_role
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.approved = true
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.complete_password_setup()
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE result public.profiles;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
  UPDATE public.profiles
  SET password_set_at = COALESCE(password_set_at, now())
  WHERE id = auth.uid()
  RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_password_setup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_password_setup() TO authenticated;

