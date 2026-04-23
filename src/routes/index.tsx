import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Wallet, AlertCircle, Clock, Search, LogOut, Loader2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BillFormDialog } from "@/components/bills/BillFormDialog";
import { PayDialog } from "@/components/bills/PayDialog";
import { BillCard } from "@/components/bills/BillCard";
import { IncomeFormDialog } from "@/components/income/IncomeFormDialog";
import { IncomeCard } from "@/components/income/IncomeCard";
import { formatCurrency, daysUntil } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { Navigate } from "@tanstack/react-router";
import type { Bill } from "@/components/bills/types";
import type { IncomeEntry } from "@/components/income/types";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { session, loading: authLoading, signOut, user } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [incomeEntries, setIncomeEntries] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"pending" | "paid" | "income" | "all">("pending");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [paying, setPaying] = useState<Bill | null>(null);
  const [incomeFormOpen, setIncomeFormOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeEntry | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("bills")
      .select("*")
      .order("due_date", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar contas", { description: error.message });
    } else {
      setBills((data ?? []) as Bill[]);
    }
    const { data: incomeData, error: incomeError } = await (supabase as any)
      .from("income_entries")
      .select("*")
      .order("received_date", { ascending: false });
    if (incomeError) {
      toast.error("Erro ao carregar receitas", { description: incomeError.message });
    } else {
      setIncomeEntries((incomeData ?? []) as IncomeEntry[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (session) load();
  }, [session]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" />;
  }

  async function handleDelete(b: Bill) {
    if (!confirm(`Excluir "${b.description}"?`)) return;
    const { error } = await supabase.from("bills").delete().eq("id", b.id);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Conta excluída");
    load();
  }

  async function handleUnpay(b: Bill) {
    const { error } = await supabase
      .from("bills")
      .update({ status: "pending", paid_date: null, paid_amount: null })
      .eq("id", b.id);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Baixa desfeita");
    load();
  }

  async function handleDeleteIncome(income: IncomeEntry) {
    if (!confirm(`Excluir receita "${income.description}"?`)) return;
    const { error } = await (supabase as any).from("income_entries").delete().eq("id", income.id);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Receita excluída");
    load();
  }

  const stats = useMemo(() => {
    const pending = bills.filter((b) => b.status !== "paid");
    const overdue = pending.filter((b) => daysUntil(b.due_date) < 0);
    const paid = bills.filter((b) => b.status === "paid");
    const dueSoon = pending.filter((b) => daysUntil(b.due_date) <= 1);
    const totalPending = pending.reduce((s, b) => s + Number(b.amount), 0);
    const totalOverdue = overdue.reduce((s, b) => s + Number(b.amount), 0);
    const totalPaid = paid.reduce((s, b) => s + Number(b.paid_amount ?? b.amount), 0);
    const totalIncome = incomeEntries.reduce((s, income) => s + Number(income.amount), 0);
    return { pending, overdue, dueSoon, paid, totalPending, totalOverdue, totalPaid, totalIncome };
  }, [bills, incomeEntries]);

  const filtered = useMemo(() => {
    let list = bills;
    if (tab === "pending") list = stats.pending;
    else if (tab === "paid") list = stats.paid;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          b.description.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [bills, tab, search, stats]);

  const filteredIncome = useMemo(() => {
    if (!search.trim()) return incomeEntries;
    const q = search.toLowerCase();
    return incomeEntries.filter((income) => income.description.toLowerCase().includes(q) || income.category.toLowerCase().includes(q));
  }, [incomeEntries, search]);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero / header */}
      <header
        className="text-primary-foreground"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="mx-auto max-w-3xl px-4 pt-8 pb-20">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-semibold leading-tight">Agenda Financeira</h1>
              <p className="text-xs text-primary-foreground/70 truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-6">
            <p className="text-xs uppercase tracking-wider text-primary-foreground/70">
              Total a pagar
            </p>
            <p className="text-3xl font-bold mt-1">{formatCurrency(stats.totalPending)}</p>
            <p className="mt-1 text-sm text-primary-foreground/80">
              Receitas registradas · {formatCurrency(stats.totalIncome)}
            </p>
            {stats.overdue.length > 0 && (
              <p className="mt-1 text-sm text-warning-foreground bg-warning/30 inline-flex items-center gap-1 px-2 py-1 rounded-md">
                <AlertCircle className="h-3.5 w-3.5" />
                {stats.overdue.length} em atraso · {formatCurrency(stats.totalOverdue)}
              </p>
            )}
            {stats.dueSoon.length > 0 && (
              <p className="mt-2 text-sm text-warning-foreground bg-warning/30 flex w-fit items-center gap-1 px-2 py-1 rounded-md">
                <Clock className="h-3.5 w-3.5" />
                {stats.dueSoon.length} conta{stats.dueSoon.length > 1 ? "s" : ""} vencendo até amanhã
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Cards de stats */}
      <div className="mx-auto max-w-3xl px-4 -mt-12">
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            icon={<Clock className="h-4 w-4 text-primary" />}
            label="A vencer"
            value={stats.pending.length - stats.overdue.length}
          />
          <StatCard
            icon={<AlertCircle className="h-4 w-4 text-destructive" />}
            label="Atrasadas"
            value={stats.overdue.length}
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4 text-success" />}
            label="Receitas"
            value={incomeEntries.length}
          />
        </div>
      </div>

      {/* Lista */}
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar conta…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => { setEditingIncome(null); setIncomeFormOpen(true); }} className="shrink-0">
            <TrendingUp className="h-4 w-4" /> Receita
          </Button>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="shrink-0">
            <Plus className="h-4 w-4" /> Conta
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="paid">Pagas</TabsTrigger>
            <TabsTrigger value="income">Receitas</TabsTrigger>
            <TabsTrigger value="all">Todas</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Carregando…</div>
          ) : tab === "income" ? (
            filteredIncome.length === 0 ? (
              <div className="text-center py-16">
                <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">Nenhuma receita encontrada.</p>
                <Button className="mt-4" onClick={() => { setEditingIncome(null); setIncomeFormOpen(true); }}>
                  <Plus className="h-4 w-4" /> Adicionar receita
                </Button>
              </div>
            ) : (
              filteredIncome.map((income) => (
                <IncomeCard key={income.id} income={income} onEdit={(x) => { setEditingIncome(x); setIncomeFormOpen(true); }} onDelete={handleDeleteIncome} />
              ))
            )
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Wallet className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                {bills.length === 0 ? "Nenhuma conta cadastrada ainda." : "Nada por aqui."}
              </p>
              {bills.length === 0 && (
                <Button
                  className="mt-4"
                  onClick={() => { setEditing(null); setFormOpen(true); }}
                >
                  <Plus className="h-4 w-4" /> Adicionar primeira conta
                </Button>
              )}
            </div>
          ) : (
            filtered.map((b) => (
              <BillCard
                key={b.id}
                bill={b}
                onPay={(x) => setPaying(x)}
                onEdit={(x) => { setEditing(x); setFormOpen(true); }}
                onDelete={handleDelete}
                onUnpay={handleUnpay}
              />
            ))
          )}
        </div>
      </main>

      <BillFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={load}
        editing={editing}
      />
      <PayDialog bill={paying} onClose={() => setPaying(null)} onSaved={load} />
      <IncomeFormDialog
        open={incomeFormOpen}
        onOpenChange={setIncomeFormOpen}
        onSaved={load}
        editing={editingIncome}
      />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-card border p-3" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}