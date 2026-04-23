import { Calendar, Pencil, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateBR } from "@/lib/format";
import type { IncomeEntry } from "./types";

interface Props {
  income: IncomeEntry;
  onEdit: (income: IncomeEntry) => void;
  onDelete: (income: IncomeEntry) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  salario: "Salário",
  freelance: "Freelance",
  aluguel: "Aluguel recebido",
  vendas: "Vendas",
  investimentos: "Investimentos",
  outros: "Outros",
};

export function IncomeCard({ income, onEdit, onDelete }: Props) {
  return (
    <div className="group rounded-xl border bg-card p-4 transition-all hover:shadow-[var(--shadow-card)]" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0 bg-success/15">
          <TrendingUp className="h-5 w-5 text-success" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-tight truncate">{income.description}</h3>
            <span className="text-base font-bold whitespace-nowrap text-success">{formatCurrency(income.amount)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{CATEGORY_LABELS[income.category] ?? income.category} · {formatDateBR(income.received_date)}</span>
          </div>
          <div className="mt-2 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(income)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(income)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}