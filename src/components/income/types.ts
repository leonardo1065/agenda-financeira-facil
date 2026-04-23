export interface IncomeEntry {
  id: string;
  description: string;
  category: string;
  amount: number;
  received_date: string;
  recurrence: "none" | "monthly" | "yearly" | string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}