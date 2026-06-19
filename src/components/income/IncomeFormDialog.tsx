import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toISODate, parseCurrency } from "@/lib/format";
import { toast } from "sonner";
import type { IncomeEntry } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: IncomeEntry | null;
}

const db = supabase as any;

export function IncomeFormDialog({ open, onOpenChange, onSaved, editing }: Props) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("salario");
  const [amount, setAmount] = useState("");
  const [receivedDate, setReceivedDate] = useState(toISODate(new Date()));
  const [recurrence, setRecurrence] = useState("none");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDescription(editing.description);
      setCategory(editing.category);
      setAmount(String(editing.amount).replace(".", ","));
      setReceivedDate(editing.received_date);
      setRecurrence(editing.recurrence);
      setNotes(editing.notes ?? "");
    } else {
      setDescription("");
      setCategory("salario");
      setAmount("");
      setReceivedDate(toISODate(new Date()));
      setRecurrence("none");
      setNotes("");
    }
  }, [open, editing]);

  async function handleSave() {
    if (!description.trim()) return toast.error("Informe a descrição da receita");
    const numAmount = parseCurrency(amount);
    setSaving(true);
    try {
      if (editing) {
        const { error } = await db.from("income_entries").update({
          description: description.trim(), category, amount: numAmount, received_date: receivedDate, recurrence, notes: notes.trim() || null,
        }).eq("id", editing.id);
        if (error) throw error;
        toast.success("Receita atualizada");
      } else {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("Sessão expirada. Faça login novamente.");
        const { error } = await db.from("income_entries").insert({
          description: description.trim(), category, amount: numAmount, received_date: receivedDate, recurrence, notes: notes.trim() || null, user_id: userData.user.id,
        });
        if (error) throw error;
        toast.success("Receita adicionada");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error("Erro ao salvar receita", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Editar receita" : "Nova receita"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="income-desc">Descrição</Label><Input id="income-desc" placeholder="Ex: Salário" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="income-amount">Valor (R$)</Label><Input id="income-amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="income-date">Recebimento</Label><Input id="income-date" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Categoria</Label><Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="salario">Salário</SelectItem><SelectItem value="freelance">Freelance</SelectItem><SelectItem value="aluguel">Aluguel recebido</SelectItem><SelectItem value="vendas">Vendas</SelectItem><SelectItem value="investimentos">Investimentos</SelectItem><SelectItem value="outros">Outros</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Recorrência</Label><Select value={recurrence} onValueChange={setRecurrence}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Nenhuma</SelectItem><SelectItem value="monthly">Mensal</SelectItem><SelectItem value="yearly">Anual</SelectItem></SelectContent></Select></div>
          </div>
          <div className="space-y-2"><Label htmlFor="income-notes">Observações</Label><Textarea id="income-notes" placeholder="Opcional" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Salvar" : "Adicionar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}