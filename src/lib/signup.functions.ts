import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(255),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres.").max(72),
  displayName: z.string().trim().min(2, "Informe seu nome.").max(80),
});

export type SignupResult =
  | { ok: true }
  | { ok: false; code: "email_exists" | "weak_password" | "invalid_email" | "unknown"; message: string };

const emailCheckSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
});

export type EmailCheckResult =
  | { ok: true; available: boolean }
  | { ok: false; message: string };

export const checkEmailAvailability = createServerFn({ method: "POST" })
  .inputValidator((input) => emailCheckSchema.parse(input))
  .handler(async ({ data }): Promise<EmailCheckResult> => {
    try {
      // Attempt to generate a recovery link as a probe — succeeds only when email exists.
      const { data: linkData, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: data.email,
      });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("not found") || msg.includes("no user")) {
          return { ok: true, available: true };
        }
        return { ok: true, available: true };
      }
      return { ok: true, available: !linkData?.user };
    } catch {
      return { ok: false, message: "Não foi possível validar o e-mail." };
    }
  });

export const createAccountWithAccessCode = createServerFn({ method: "POST" })
  .inputValidator((input) => signupSchema.parse(input))
  .handler(async ({ data }): Promise<SignupResult> => {
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return { ok: false, code: "email_exists", message: "Este e-mail já está cadastrado." };
      }
      if (msg.includes("password")) {
        return { ok: false, code: "weak_password", message: "Senha muito fraca." };
      }
      return { ok: false, code: "unknown", message: "Não foi possível criar sua conta." };
    }

    if (created.user?.id) {
      await supabaseAdmin.from("profiles").insert({
        user_id: created.user.id,
        display_name: data.displayName,
      });
    }

    return { ok: true };
  });
