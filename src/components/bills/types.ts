export interface Bill {
  id: string;
  description: string;
  category: string;
  amount: number;
  due_date: string;
  paid_date: string | null;
  paid_amount: number | null;
  status: "pending" | "paid" | string;
  recurrence: "none" | "monthly" | "yearly" | string;
  barcode: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}