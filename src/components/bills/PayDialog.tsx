import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toISODate } from "@/lib/format";
import type { Bill } from "./types";

interface Props {
  bill: Bill | null;
  onClose: () => void;
  onSaved: () => void;
}

export function PayDialog({ bill, onClose, onSaved }: Props) {
  const [paidDate, setPaidDate] = useState(toISODate(new Date()));
  const [paidAmount, setPaidAmount] = useState("");

  useEffect(() => {
    if (bill) {
      setPaidDate(toISODate(new Date()));
      setPaidAmount(String(bill.amount).replace(".", ","));
    }
  }, [bill]);

  async function confirm() {
    if (!bill) return;
    const v = parseFloat(paidAmount.replace(/\./g, "").replace(",", ".")) || 0;
    const { error } = await supabase
      .from("bills")
      .update({ status: "paid", paid_date: paidDate, paid_amount: v })
      .eq("id", bill.id);
    if (error) {
      toast.error("Erro", { description: error.message });
      return;
    }
    toast.success("Baixa registrada");
    onSaved();
    onClose();
  }

  return (
    <Dialog open={!!bill} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Marcar como pago</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Data do pagamento</Label>
            <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Valor pago (R$)</Label>
            <Input inputMode="decimal" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm}>Confirmar baixa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}