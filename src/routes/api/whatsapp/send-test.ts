import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/whatsapp/send-test")({
  server: {
    handlers: {
      POST: handler,
    },
  },
});

async function handler({ request }: { request: Request }) {
  const auth = request.headers.get("authorization");
  const jwt = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!jwt) {
    return Response.json({ ok: false, message: "Faça login novamente para testar o envio." }, { status: 401 });
  }

  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const instanceToken = process.env.ZAPI_INSTANCE_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!instanceId || !instanceToken || !clientToken) {
    return Response.json({
      ok: false,
      message: "O serviço de WhatsApp ainda não está configurado.",
    }, { status: 200 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
  if (userErr || !userData.user) {
    return Response.json({ ok: false, message: "Sessão inválida. Faça login novamente." }, { status: 401 });
  }
  const userId = userData.user.id;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("whatsapp_phone, display_name")
    .eq("user_id", userId)
    .maybeSingle();

  const phone = sanitizePhone(profile?.whatsapp_phone);
  if (!phone) {
    return Response.json({
      ok: false,
      message: "Cadastre seu WhatsApp no perfil antes de testar.",
    }, { status: 200 });
  }

  const greeting = profile?.display_name ? `Olá, ${profile.display_name}!` : "Olá!";
  const message = [
    `${greeting} 💰`,
    "",
    "✅ Teste de envio bem-sucedido!",
    "Se você recebeu esta mensagem, os avisos diários de vencimento chegarão por aqui.",
    "",
    "— Agenda Financeira",
  ].join("\n");

  try {
    const zapiUrl = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-text`;
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
      return Response.json({
        ok: false,
        message: friendlyError(res.status, txt),
      });
    }
    await supabaseAdmin.from("email_send_log").insert({
      user_id: userId,
      recipient_email: `whatsapp:${phone}`,
      subject: "Teste WhatsApp",
      status: "sent",
      is_test: true,
    });
    return Response.json({ ok: true, message: `Mensagem enviada para o WhatsApp cadastrado.` });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, message: `Falha de rede: ${raw}` });
  }
}

function sanitizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  return digits;
}

function friendlyError(status: number, raw: string): string {
  const low = raw.toLowerCase();
  if (status === 401 || status === 403) return "Credenciais do WhatsApp inválidas. Reconecte a instância Z-API.";
  if (low.includes("not connected") || low.includes("disconnected")) {
    return "A instância do WhatsApp está desconectada. Reconecte no painel da Z-API.";
  }
  return `Não foi possível enviar (status ${status}): ${raw.slice(0, 200)}`;
}