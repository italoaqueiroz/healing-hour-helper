
REVOKE EXECUTE ON FUNCTION public.complete_password_setup() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.complete_duration_setup(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.advance_tutorial() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_appointment_change() FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_password_setup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_duration_setup(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_tutorial() TO authenticated;
