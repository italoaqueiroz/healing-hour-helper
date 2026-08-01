CREATE TABLE IF NOT EXISTS public.monthly_report_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_month date NOT NULL,
  recipient_email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (therapist_id, report_month)
);

ALTER TABLE public.monthly_report_deliveries ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.monthly_report_deliveries TO service_role;

CREATE POLICY "Admins view monthly report deliveries"
ON public.monthly_report_deliveries FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
