import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, ScanLine, Loader2 } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import { parseBoleto } from "@/lib/boleto";
import { toISODate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BarcodeScanner } from "./BarcodeScanner";
import type { Bill } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: Bill | null;
}

export function BillFormDialog({ open, onOpenChange, onSaved, editing }: Props) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("outros");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(toISODate(new Date()));
  const [recurrence, setRecurrence] = useState("none");
  const [barcode, setBarcode] = useState("");
  const [notes, setNotes] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [highlightSave, setHighlightSave] = useState(false);
  const [pendingStream, setPendingStream] = useState<MediaStream | null>(null);

  async function openScanner() {
    // Abre a tela do scanner imediatamente e solicita a câmera no mesmo clique.
    // Assim o usuário não fica preso em uma tela sem retorno enquanto a permissão/carregamento acontece.
    setPendingStream(null);
    setScannerOpen(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("Câmera não suportada", { description: "Use Chrome/Safari atualizado em HTTPS." });
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      setPendingStream(stream);
      setScannerOpen(true);
    } catch (e) {
      const err = e as DOMException;
      let msg = err.message || "Erro ao acessar câmera";
      if (err.name === "NotAllowedError") msg = "Permissão negada. Habilite a câmera nas configurações do navegador.";
      else if (err.name === "NotFoundError") msg = "Nenhuma câmera encontrada.";
      else if (location.protocol !== "https:" && location.hostname !== "localhost") {
        msg = "A câmera só funciona em HTTPS.";
      }
      toast.error("Não foi possível abrir a câmera", { description: msg });
    }
  }

  function closeScanner() {
    setScannerOpen(false);
    setPendingStream(null);
  }

  useEffect(() => {
    if (open) {
      if (editing) {
        setDescription(editing.description);
        setCategory(editing.category);
        setAmount(String(editing.amount).replace(".", ","));
        setDueDate(editing.due_date);
        setRecurrence(editing.recurrence);
        setBarcode(editing.barcode ?? "");
        setNotes(editing.notes ?? "");
      } else {
        setDescription("");
        setCategory("outros");
        setAmount("");
        setDueDate(toISODate(new Date()));
        setRecurrence("none");
        setBarcode("");
        setNotes("");
      }
      setHighlightSave(false);
    }
  }, [open, editing]);

  function applyBarcode(raw: string) {
    const info = parseBoleto(raw);
    setBarcode(info.barcode);

    if (info.type === "desconhecido") {
      toast.warning("Código não reconhecido", {
        description: `Foram lidos ${info.barcode.length} dígitos. Linha digitável precisa ter 47 (boleto) ou 48 (concessionária).`,
      });
      return;
    }

    const filled: string[] = [];
    if (info.amount && info.amount > 0) {
      setAmount(info.amount.toFixed(2).replace(".", ","));
      filled.push("valor");
    }
    if (info.dueDate) {
      setDueDate(toISODate(info.dueDate));
      filled.push("vencimento");
    }
    setCategory((c) => (c === "outros" ? "boleto" : c));

    // Preenche descrição padrão se ainda estiver vazia, para o usuário
    // não esquecer de salvar — a conta só aparece na lista após Adicionar.
    setDescription((d) => {
      if (d.trim()) return d;
      const dueLabel = info.dueDate
        ? info.dueDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
        : "";
      return dueLabel ? `Boleto ${dueLabel}` : "Boleto";
    });

    if (filled.length > 0) {
      toast.success("Boleto interpretado", {
        description: `Preenchido: ${filled.join(" e ")}. Revise e clique em Adicionar para salvar.`,
      });
      setHighlightSave(true);
    } else {
      toast.info("Código capturado", {
        description:
          info.type === "arrecadacao"
            ? "Conta de concessionária — confira valor e vencimento manualmente."
            : "Não foi possível extrair valor/vencimento. Confira manualmente.",
      });
    }
  }

  async function handleSave() {
    if (!description.trim()) {
      toast.error("Informe a descrição");
      return;
    }
    const numAmount = parseFloat(amount.replace(/\./g, "").replace(",", ".")) || 0;
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from("bills").update({
          description: description.trim(),
          category,
          amount: numAmount,
          due_date: dueDate,
          recurrence,
          barcode: barcode || null,
          notes: notes.trim() || null,
        }).eq("id", editing.id);
        if (error) throw error;
        toast.success("Conta atualizada");
      } else {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("Sessão expirada. Faça login novamente.");
        const { error } = await supabase.from("bills").insert({
          description: description.trim(),
          category,
          amount: numAmount,
          due_date: dueDate,
          recurrence,
          barcode: barcode || null,
          notes: notes.trim() || null,
          user_id: userData.user.id,
        });
        if (error) throw error;
        toast.success("Conta adicionada");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Não permite fechar o formulário enquanto o scanner está aberto
          // (evita "pular" para a tela inicial ao escanear).
          if (!next && scannerOpen) return;
          onOpenChange(next);
        }}
      >
        <DialogContent
          className="max-w-md max-h-[92vh] overflow-y-auto"
          onPointerDownOutside={(e) => {
            if (scannerOpen) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (scannerOpen) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (scannerOpen) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Editar conta" : "Nova conta"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Boleto */}
            <div className="rounded-lg border bg-accent/40 p-3 space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Linha digitável / código de barras
              </Label>
              <Textarea
                placeholder="Cole aqui a linha digitável (47 ou 48 dígitos)…"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                rows={2}
                className="font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={openScanner}
                >
                  <Camera className="h-4 w-4" /> Escanear
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => barcode && applyBarcode(barcode)}
                  disabled={!barcode}
                >
                  <ScanLine className="h-4 w-4" /> Interpretar
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="desc">Descrição</Label>
              <Input
                id="desc"
                placeholder="Ex: Conta de luz - Maio"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="amount">Valor (R$)</Label>
                <Input
                  id="amount"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due">Vencimento</Label>
                <Input
                  id="due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Recorrência</Label>
                <Select value={recurrence} onValueChange={setRecurrence}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Opcional"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className={
                highlightSave && !editing
                  ? "relative ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg shadow-primary/40 animate-pulse"
                  : undefined
              }
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeScanner
        open={scannerOpen}
        onClose={closeScanner}
        onDetected={applyBarcode}
        initialStream={pendingStream}
      />
    </>
  );
}