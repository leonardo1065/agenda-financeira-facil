import { Button } from "@/components/ui/button";
import { CheckCircle2, Pencil, Trash2, RotateCcw, Calendar } from "lucide-react";
import { getCategory } from "@/lib/categories";
import { formatCurrency, formatDateBR, daysUntil } from "@/lib/format";
import type { Bill } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  bill: Bill;
  onPay: (bill: Bill) => void;
  onEdit: (bill: Bill) => void;
  onDelete: (bill: Bill) => void;
  onUnpay: (bill: Bill) => void;
}

export function BillCard({ bill, onPay, onEdit, onDelete, onUnpay }: Props) {
  const cat = getCategory(bill.category);
  const Icon = cat.icon;
  const isPaid = bill.status === "paid";
  const days = daysUntil(bill.due_date);

  let badge: { label: string; cls: string };
  if (isPaid) badge = { label: "Pago", cls: "bg-success/15 text-success" };
  else if (days < 0) badge = { label: `${Math.abs(days)}d atrasado`, cls: "bg-destructive/15 text-destructive" };
  else if (days === 0) badge = { label: "Vence hoje", cls: "bg-warning/20 text-foreground" };
  else if (days <= 3) badge = { label: `Vence em ${days}d`, cls: "bg-warning/20 text-foreground" };
  else badge = { label: `Em ${days}d`, cls: "bg-muted text-muted-foreground" };

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card p-4 transition-all hover:shadow-[var(--shadow-card)]",
        isPaid && "opacity-70",
      )}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-start gap-3">
        <div className={cn("h-11 w-11 rounded-lg flex items-center justify-center shrink-0", cat.bg)}>
          <Icon className={cn("h-5 w-5", cat.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className={cn("font-semibold leading-tight truncate", isPaid && "line-through")}>
              {bill.description}
            </h3>
            <span className="text-base font-bold whitespace-nowrap">
              {formatCurrency(isPaid ? bill.paid_amount ?? bill.amount : bill.amount)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{cat.label} · {formatDateBR(bill.due_date)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", badge.cls)}>
              {badge.label}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(bill)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(bill)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {isPaid ? (
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onUnpay(bill)}>
            <RotateCcw className="h-3.5 w-3.5" /> Desfazer baixa
          </Button>
        ) : (
          <Button size="sm" className="flex-1" onClick={() => onPay(bill)}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como pago
          </Button>
        )}
      </div>
    </div>
  );
}