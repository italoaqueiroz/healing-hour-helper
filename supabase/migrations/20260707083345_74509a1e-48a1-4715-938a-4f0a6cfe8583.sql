
-- Extend patients with email + parents contacts
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS parent_name text,
  ADD COLUMN IF NOT EXISTS parent_phone text,
  ADD COLUMN IF NOT EXISTS parent_email text;

-- Pró Infância: children fichas + timeline of notes
CREATE TABLE IF NOT EXISTS public.pro_infancia_children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  birth_date date,
  parent_name text,
  parent_phone text,
  parent_email text,
  school text,
  diagnosis text,
  goals text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_infancia_children TO authenticated;
GRANT ALL ON public.pro_infancia_children TO service_role;

ALTER TABLE public.pro_infancia_children ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read children" ON public.pro_infancia_children
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert children" ON public.pro_infancia_children
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update children" ON public.pro_infancia_children
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin delete children" ON public.pro_infancia_children
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER pro_infancia_children_set_updated_at
  BEFORE UPDATE ON public.pro_infancia_children
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.pro_infancia_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.pro_infancia_children(id) ON DELETE CASCADE,
  therapist_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_date date NOT NULL DEFAULT (now()::date),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_infancia_notes TO authenticated;
GRANT ALL ON public.pro_infancia_notes TO service_role;

ALTER TABLE public.pro_infancia_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read notes" ON public.pro_infancia_notes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert own notes" ON public.pro_infancia_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = therapist_id OR therapist_id IS NULL);
CREATE POLICY "Author or admin update note" ON public.pro_infancia_notes
  FOR UPDATE TO authenticated
  USING (auth.uid() = therapist_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = therapist_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Author or admin delete note" ON public.pro_infancia_notes
  FOR DELETE TO authenticated
  USING (auth.uid() = therapist_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER pro_infancia_notes_set_updated_at
  BEFORE UPDATE ON public.pro_infancia_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS pro_infancia_notes_child_idx ON public.pro_infancia_notes(child_id, session_date DESC);
