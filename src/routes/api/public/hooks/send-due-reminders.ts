import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/send-due-reminders")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

async function handler() {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const instanceToken = process.env.ZAPI_INSTANCE_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instanceId || !instanceToken || !clientToken) {
    return Response.json(
      { error: "Z-API credentials not configured" },
      { status: 500 },
    );
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Today and tomorrow in BRT (UTC-3)
  const now = new Date();
  const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const today = isoDate(brtNow);
  const tmrw = new Date(brtNow);
  tmrw.setUTCDate(tmrw.getUTCDate() + 1);
  const tomorrow = isoDate(tmrw);

  const { data: bills, error } = await supabaseAdmin
    .from("bills")
    .select("id, user_id, description, amount, due_date, category")
    .eq("status", "pending")
    .in("due_date", [today, tomorrow]);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!bills || bills.length === 0) {
    return Response.json({ ok: true, sent: 0, today, tomorrow });
  }

  const userIds = Array.from(new Set(bills.map((b) => b.user_id)));
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, whatsapp_phone, display_name")
    .in("user_id", userIds);

  const profileByUser = new Map(
    (profiles ?? []).map((p) => [p.user_id, p]),
  );

  const zapiUrl = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-text`;
  const results: Array<{ bill_id: string; status: "sent" | "skipped" | "error"; reason?: string }> = [];

  // Group bills by user
  const billsByUser = new Map<string, typeof bills>();
  for (const b of bills) {
    const arr = billsByUser.get(b.user_id) ?? [];
    arr.push(b);
    billsByUser.set(b.user_id, arr);
  }

  for (const [userId, userBills] of billsByUser.entries()) {
    const profile = profileByUser.get(userId);
    const phone = sanitizePhone(profile?.whatsapp_phone);
    if (!phone) {
      for (const b of userBills) {
        results.push({ bill_id: b.id, status: "skipped", reason: "no_phone" });
      }
      continue;
    }

    const greeting = profile?.display_name ? `Olá, ${profile.display_name}!` : "Olá!";
    const dueToday = userBills.filter((b) => b.due_date === today);
    const dueTomorrow = userBills.filter((b) => b.due_date === tomorrow);
    const sections: string[] = [];
    if (dueToday.length) {
      sections.push(
        dueToday.length === 1
          ? "⚠️ Vence HOJE:"
          : `⚠️ Vencem HOJE (${dueToday.length}):`,
      );
      for (const b of dueToday) {
        sections.push(`${categoryEmoji(b.category)} ${categoryLabel(b.category)} — ${b.description}: ${formatBRL(Number(b.amount))}`);
      }
    }
    if (dueTomorrow.length) {
      if (sections.length) sections.push("");
      sections.push(
        dueTomorrow.length === 1
          ? "📅 Vence AMANHÃ:"
          : `📅 Vencem AMANHÃ (${dueTomorrow.length}):`,
      );
      for (const b of dueTomorrow) {
        sections.push(`${categoryEmoji(b.category)} ${categoryLabel(b.category)} — ${b.description}: ${formatBRL(Number(b.amount))} (${formatDateBR(b.due_date)})`);
      }
    }
    const message = [
      `${greeting} 💰`,
      "",
      ...sections,
      "",
      "Não esqueça de pagar para evitar juros!",
      "— Agenda Financeira",
    ].join("\n");

    try {
      const res = await fetch(zapiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": clientToken,
        },
        body: JSON.stringify({ phone, message }),
      });
      if (!res.ok) {
        const txt = await res.text();
        for (const b of userBills) {
          results.push({ bill_id: b.id, status: "error", reason: `${res.status}: ${txt.slice(0, 120)}` });
        }
      } else {
        for (const b of userBills) {
          results.push({ bill_id: b.id, status: "sent" });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const b of userBills) {
        results.push({ bill_id: b.id, status: "error", reason: msg });
      }
    }
  }

  const sent = results.filter((r) => r.status === "sent").length;
  return Response.json({ ok: true, today, tomorrow, total: bills.length, sent, results });
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sanitizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // If no country code (Brazilian number with 10 or 11 digits), add 55
  if (digits.length === 10 || digits.length === 11) {
    digits = "55" + digits;
  }
  return digits;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const CATEGORY_INFO: Record<string, { emoji: string; label: string; tip: string }> = {
  agua:        { emoji: "💧", label: "Água",         tip: "Evite o corte do abastecimento." },
  luz:         { emoji: "💡", label: "Luz",          tip: "Evite o corte de energia." },
  internet:    { emoji: "🌐", label: "Internet",     tip: "Evite ficar sem conexão." },
  condominio:  { emoji: "🏢", label: "Condomínio",   tip: "Evite multas do condomínio." },
  aluguel:     { emoji: "🏠", label: "Aluguel",      tip: "Evite juros e desgaste com o locador." },
  iptu:        { emoji: "🏛️", label: "IPTU",         tip: "Evite multa e juros municipais." },
  ipva:        { emoji: "🚗", label: "IPVA",         tip: "Mantenha o veículo regular." },
  carro:       { emoji: "🚙", label: "Prest. carro", tip: "Evite juros do financiamento." },
  seguro:      { emoji: "🛡️", label: "Seguro",       tip: "Mantenha sua cobertura ativa." },
  telefone:    { emoji: "📞", label: "Telefone",     tip: "Evite a suspensão da linha." },
  mercado:     { emoji: "🛒", label: "Mercado",      tip: "" },
  combustivel: { emoji: "⛽", label: "Combustível",  tip: "" },
  boleto:      { emoji: "🧾", label: "Boleto",       tip: "Evite juros e protesto." },
  outros:      { emoji: "📌", label: "Outros",       tip: "" },
};

function categoryEmoji(key?: string | null): string {
  return CATEGORY_INFO[key ?? "outros"]?.emoji ?? "📌";
}

function categoryLabel(key?: string | null): string {
  return CATEGORY_INFO[key ?? "outros"]?.label ?? "Outros";
}