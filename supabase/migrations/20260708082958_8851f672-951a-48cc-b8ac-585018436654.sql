-- 1. Extend app_role enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype AND enumlabel = 'therapist') THEN
    ALTER TYPE public.app_role ADD VALUE 'therapist';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype AND enumlabel = 'pro_infancia') THEN
    ALTER TYPE public.app_role ADD VALUE 'pro_infancia';
  END IF;
END$$;

-- Commit enum additions so they're usable below
COMMIT;
BEGIN;

-- 2. pro_infancia_contacts table (separate from patients)
CREATE TABLE IF NOT EXISTS public.pro_infancia_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  registration_number text,
  phone text,
  email text,
  parent_name text,
  parent_phone text,
  parent_email text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_infancia_contacts TO authenticated;
GRANT ALL ON public.pro_infancia_contacts TO service_role;

ALTER TABLE public.pro_infancia_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pi_contacts_select" ON public.pro_infancia_contacts;
CREATE POLICY "pi_contacts_select" ON public.pro_infancia_contacts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'));

DROP POLICY IF EXISTS "pi_contacts_insert" ON public.pro_infancia_contacts;
CREATE POLICY "pi_contacts_insert" ON public.pro_infancia_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'));

DROP POLICY IF EXISTS "pi_contacts_update" ON public.pro_infancia_contacts;
CREATE POLICY "pi_contacts_update" ON public.pro_infancia_contacts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'));

DROP POLICY IF EXISTS "pi_contacts_delete" ON public.pro_infancia_contacts;
CREATE POLICY "pi_contacts_delete" ON public.pro_infancia_contacts
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'));

DROP TRIGGER IF EXISTS trg_pi_contacts_updated ON public.pro_infancia_contacts;
CREATE TRIGGER trg_pi_contacts_updated BEFORE UPDATE ON public.pro_infancia_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Tighten pro_infancia_children & notes SELECT to admin OR pro_infancia
DROP POLICY IF EXISTS "pro_infancia_children_select" ON public.pro_infancia_children;
DROP POLICY IF EXISTS "pi_children_select_staff" ON public.pro_infancia_children;
CREATE POLICY "pi_children_select_pi" ON public.pro_infancia_children
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'));

DROP POLICY IF EXISTS "pro_infancia_children_insert" ON public.pro_infancia_children;
CREATE POLICY "pi_children_insert_pi" ON public.pro_infancia_children
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'));

DROP POLICY IF EXISTS "pro_infancia_children_update" ON public.pro_infancia_children;
CREATE POLICY "pi_children_update_pi" ON public.pro_infancia_children
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'));

DROP POLICY IF EXISTS "pro_infancia_children_delete" ON public.pro_infancia_children;
CREATE POLICY "pi_children_delete_pi" ON public.pro_infancia_children
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'));

DROP POLICY IF EXISTS "pro_infancia_notes_select" ON public.pro_infancia_notes;
DROP POLICY IF EXISTS "pi_notes_select_staff" ON public.pro_infancia_notes;
CREATE POLICY "pi_notes_select_pi" ON public.pro_infancia_notes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'));

DROP POLICY IF EXISTS "pro_infancia_notes_insert" ON public.pro_infancia_notes;
CREATE POLICY "pi_notes_insert_pi" ON public.pro_infancia_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'));

DROP POLICY IF EXISTS "pro_infancia_notes_update" ON public.pro_infancia_notes;
CREATE POLICY "pi_notes_update_pi" ON public.pro_infancia_notes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'));

DROP POLICY IF EXISTS "pro_infancia_notes_delete" ON public.pro_infancia_notes;
CREATE POLICY "pi_notes_delete_pi" ON public.pro_infancia_notes
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pro_infancia'));

-- 4. push_subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_sub_user ON public.push_subscriptions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_sub_own_select" ON public.push_subscriptions;
CREATE POLICY "push_sub_own_select" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_sub_own_insert" ON public.push_subscriptions;
CREATE POLICY "push_sub_own_insert" ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_sub_own_update" ON public.push_subscriptions;
CREATE POLICY "push_sub_own_update" ON public.push_subscriptions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_sub_own_delete" ON public.push_subscriptions;
CREATE POLICY "push_sub_own_delete" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_push_sub_updated ON public.push_subscriptions;
CREATE TRIGGER trg_push_sub_updated BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;