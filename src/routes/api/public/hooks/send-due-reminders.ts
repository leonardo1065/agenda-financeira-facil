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

  // Tomorrow in BRT (UTC-3)
  const now = new Date();
  const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const tomorrow = new Date(brtNow);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const y = tomorrow.getUTCFullYear();
  const m = String(tomorrow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(tomorrow.getUTCDate()).padStart(2, "0");
  const targetDate = `${y}-${m}-${d}`;

  const { data: bills, error } = await supabaseAdmin
    .from("bills")
    .select("id, user_id, description, amount, due_date")
    .eq("status", "pending")
    .eq("due_date", targetDate);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!bills || bills.length === 0) {
    return Response.json({ ok: true, sent: 0, date: targetDate });
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
    const lines = userBills.map(
      (b) =>
        `• ${b.description} - ${formatBRL(Number(b.amount))} (vence em ${formatDateBR(b.due_date)})`,
    );
    const message = [
      `${greeting} 📅`,
      "",
      userBills.length === 1
        ? "Você tem uma conta vencendo amanhã:"
        : `Você tem ${userBills.length} contas vencendo amanhã:`,
      "",
      ...lines,
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
  return Response.json({ ok: true, date: targetDate, total: bills.length, sent, results });
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