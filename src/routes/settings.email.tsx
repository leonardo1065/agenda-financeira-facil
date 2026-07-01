import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Mail, Send, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/settings/email")({
  component: EmailSettingsPage,
});

type Settings = {
  recipient_email: string;
  send_hour: number;
  enabled: boolean;
};

type LogRow = {
  id: string;
  recipient_email: string;
  subject: string | null;
  status: string;
  error_message: string | null;
  is_test: boolean;
  created_at: string;
};

function EmailSettingsPage() {
  const { session, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    recipient_email: "",
    send_hour: 8,
    enabled: true,
  });
  const [logs, setLogs] = useState<LogRow[]>([]);

  async function load() {
    if (!user) return;
    setLoading(true);
    const [{ data: s }, { data: l }] = await Promise.all([
      (supabase as any)
        .from("email_settings")
        .select("recipient_email, send_hour, enabled")
        .eq("user_id", user.id)
        .maybeSingle(),
      (supabase as any)
        .from("email_send_log")
        .select("id, recipient_email, subject, status, error_message, is_test, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (s) {
      setSettings({
        recipient_email: s.recipient_email ?? "",
        send_hour: s.send_hour ?? 8,
        enabled: s.enabled ?? true,
      });
    } else {
      setSettings((prev) => ({
        ...prev,
        recipient_email: user.email ?? "",
      }));
    }
    setLogs((l as LogRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, user?.id]);

  async function handleSave() {
    if (!user) return;
    const email = settings.recipient_email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("email_settings").upsert(
      {
        user_id: user.id,
        recipient_email: email,
        send_hour: settings.send_hour,
        enabled: settings.enabled,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar", { description: error.message });
      return;
    }
    toast.success("Configurações salvas!");
    setSettings((s) => ({ ...s, recipient_email: email }));
  }

  async function handleTest() {
    if (!session) return;
    if (!settings.recipient_email.trim()) {
      toast.error("Salve o e-mail de destino antes de testar.");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/email/send-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const body = await res.json().catch(() => ({}));
      if (body?.ok) {
        toast.success("Teste enviado!", { description: body.message });
      } else {
        toast.error("Não foi possível enviar", {
          description: body?.message ?? "Tente novamente em alguns instantes.",
        });
      }
    } catch (e) {
      toast.error("Falha de rede", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTesting(false);
      load();
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" />;

  return (
    <div className="min-h-screen bg-background">
      <header
        className="text-primary-foreground"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="mx-auto max-w-2xl px-4 pt-6 pb-16">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ to: "/" })}
              className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold leading-tight">Avisos por e-mail</h1>
              <p className="text-xs text-primary-foreground/70">
                Configure e teste o envio dos lembretes de vencimento.
              </p>
            </div>
            <Mail className="h-5 w-5 opacity-80" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 -mt-10 pb-10 space-y-4">
        <section
          className="rounded-xl bg-card border p-4 space-y-4"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Envio ativo</p>
              <p className="text-xs text-muted-foreground">
                Desative para pausar os avisos diários.
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rcpt">E-mail de destino</Label>
            <Input
              id="rcpt"
              type="email"
              placeholder="voce@exemplo.com"
              value={settings.recipient_email}
              onChange={(e) =>
                setSettings((s) => ({ ...s, recipient_email: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>Horário do envio (Brasília)</Label>
            <Select
              value={String(settings.send_hour)}
              onValueChange={(v) =>
                setSettings((s) => ({ ...s, send_hour: Number(v) }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {String(i).padStart(2, "0")}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Padrão: 08:00
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving || loading} className="flex-1">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar configurações
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={testing || loading}
              className="flex-1"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar teste
            </Button>
          </div>
        </section>

        <section
          className="rounded-xl bg-card border p-4"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Histórico de envios</h2>
            <span className="text-xs text-muted-foreground">
              últimos {logs.length}
            </span>
          </div>
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Carregando…
            </div>
          ) : logs.length === 0 ? (
            <div className="py-8 text-center">
              <Mail className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhum envio registrado ainda.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {logs.map((l) => (
                <LogItem key={l.id} log={l} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function LogItem({ log }: { log: LogRow }) {
  const ok = log.status === "sent";
  return (
    <li className="py-2.5 flex items-start gap-2.5">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">
            {log.subject ?? "(sem assunto)"}
          </p>
          {log.is_test && (
            <span className="text-[10px] uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
              teste
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          Para {log.recipient_email} · {new Date(log.created_at).toLocaleString("pt-BR")}
        </p>
        {!ok && log.error_message && (
          <p className="mt-1 text-xs text-destructive break-words">
            {log.error_message}
          </p>
        )}
      </div>
    </li>
  );
}