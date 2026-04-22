import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const signupSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido.").max(255),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres.").max(72),
  displayName: z.string().trim().min(2, "Informe seu nome.").max(80),
  accessCode: z.string().trim().min(1, "Informe o código de acesso.").max(80),
});

export const createAccountWithAccessCode = createServerFn({ method: "POST" })
  .inputValidator((input) => signupSchema.parse(input))
  .handler(async ({ data }) => {
    const expectedCode = process.env.SIGNUP_ACCESS_CODE;

    if (!expectedCode) {
      throw new Error("Cadastro indisponível no momento.");
    }

    if (data.accessCode !== expectedCode) {
      throw new Error("Código de acesso inválido.");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        throw new Error("Este e-mail já está cadastrado.");
      }
      throw new Error("Não foi possível criar sua conta.");
    }

    if (created.user?.id) {
      await supabaseAdmin.from("profiles").insert({
        user_id: created.user.id,
        display_name: data.displayName,
      });
    }

    return { ok: true };
  });
