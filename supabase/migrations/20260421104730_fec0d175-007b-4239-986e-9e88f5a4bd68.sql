
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.bills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'outros',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  paid_date DATE,
  paid_amount NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'pending',
  recurrence TEXT NOT NULL DEFAULT 'none',
  barcode TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_bills_due_date ON public.bills(due_date);
CREATE INDEX idx_bills_status ON public.bills(status);

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view bills" ON public.bills FOR SELECT USING (true);
CREATE POLICY "Public can insert bills" ON public.bills FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update bills" ON public.bills FOR UPDATE USING (true);
CREATE POLICY "Public can delete bills" ON public.bills FOR DELETE USING (true);

CREATE TRIGGER update_bills_updated_at
  BEFORE UPDATE ON public.bills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
