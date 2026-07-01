
CREATE TABLE public.email_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  send_hour smallint NOT NULL DEFAULT 8 CHECK (send_hour BETWEEN 0 AND 23),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_settings TO authenticated;
GRANT ALL ON public.email_settings TO service_role;
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own email settings" ON public.email_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  subject text,
  status text NOT NULL,
  error_message text,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.email_send_log TO authenticated;
GRANT ALL ON public.email_send_log TO service_role;
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own email logs read" ON public.email_send_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE INDEX email_send_log_user_created_idx
  ON public.email_send_log (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.email_settings_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER email_settings_updated_at
  BEFORE UPDATE ON public.email_settings
  FOR EACH ROW EXECUTE FUNCTION public.email_settings_touch_updated_at();
