import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/email/send-test")({
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

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
  if (userErr || !userData.user) {
    return Response.json({ ok: false, message: "Sessão inválida. Faça login novamente." }, { status: 401 });
  }
  const userId = userData.user.id;

  const { data: settings } = await supabaseAdmin
    .from("email_settings")
    .select("recipient_email, enabled")
    .eq("user_id", userId)
    .maybeSingle();

  const recipient = settings?.recipient_email?.trim();
  if (!recipient) {
    return Response.json({
      ok: false,
      message: "Cadastre um e-mail de destino antes de testar o envio.",
    }, { status: 400 });
  }

  const subject = "✅ Teste — Agenda Financeira";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#0f172a">
      <h2 style="margin:0 0 12px">Teste de envio bem-sucedido 🎉</h2>
      <p style="margin:0 0 8px">Este é um e-mail de teste da sua Agenda Financeira.</p>
      <p style="margin:0 0 8px">Se você recebeu esta mensagem, os avisos diários de vencimento chegarão neste endereço.</p>
      <p style="margin:24px 0 0;color:#64748b;font-size:12px">Enviado em ${new Date().toLocaleString("pt-BR")}</p>
    </div>
  `;

  const result = await sendEmail({ to: recipient, subject, html });

  await supabaseAdmin.from("email_send_log").insert({
    user_id: userId,
    recipient_email: recipient,
    subject,
    status: result.ok ? "sent" : "error",
    error_message: result.ok ? null : result.message,
    is_test: true,
  });

  if (!result.ok) {
    return Response.json({ ok: false, message: result.message }, { status: 200 });
  }
  return Response.json({ ok: true, message: `E-mail de teste enviado para ${recipient}.` });
}

export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!lovableKey || !resendKey) {
    return {
      ok: false,
      message:
        "O serviço de envio de e-mail ainda não está conectado. Peça para conectar o Resend na configuração do app para começar a enviar.",
    };
  }

  try {
    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: "Agenda Financeira <onboarding@resend.dev>",
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      let msg = txt;
      try {
        const j = JSON.parse(txt);
        msg = j?.message || j?.error || txt;
      } catch {
        // keep raw text
      }
      const friendly = friendlyError(res.status, msg);
      return { ok: false, message: friendly };
    }
    return { ok: true };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Falha de rede ao contatar o servidor de e-mail: ${raw}` };
  }
}

function friendlyError(status: number, raw: string): string {
  const low = raw.toLowerCase();
  if (status === 401 || status === 403) {
    return "Credencial de e-mail inválida. Reconecte o serviço Resend.";
  }
  if (status === 429) {
    return "Muitos envios em pouco tempo. Aguarde alguns minutos e tente novamente.";
  }
  if (low.includes("domain") || low.includes("verify")) {
    return "O domínio do remetente ainda não está verificado no Resend. Enquanto isso, envios só chegam ao e-mail dono da conta Resend.";
  }
  if (low.includes("invalid") && low.includes("to")) {
    return "O endereço de destino é inválido. Verifique o e-mail cadastrado.";
  }
  if (low.includes("testing emails") || low.includes("only send")) {
    return "A conta Resend está em modo de teste: só é possível enviar para o e-mail dono da conta Resend. Verifique um domínio próprio para liberar outros destinatários.";
  }
  return `Não foi possível enviar (status ${status}): ${raw.slice(0, 200)}`;
}