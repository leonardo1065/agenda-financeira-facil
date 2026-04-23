CREATE TABLE public.income_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'outros',
  amount NUMERIC NOT NULL DEFAULT 0,
  received_date DATE NOT NULL,
  recurrence TEXT NOT NULL DEFAULT 'none',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.income_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own income entries"
ON public.income_entries
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own income entries"
ON public.income_entries
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own income entries"
ON public.income_entries
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own income entries"
ON public.income_entries
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_income_entries_user_received_date
ON public.income_entries (user_id, received_date DESC);

CREATE TRIGGER update_income_entries_updated_at
BEFORE UPDATE ON public.income_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();