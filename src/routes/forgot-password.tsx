import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Wallet, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Não foi possível enviar o e-mail", { description: error.message });
      return;
    }
    setSent(true);
    toast.success("E-mail enviado", {
      description: "Verifique sua caixa de entrada (e o spam).",
    });
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-semibold leading-tight">Recuperar senha</h1>
            <p className="text-xs text-muted-foreground">Enviaremos um link por e-mail</p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-4 text-sm">
            <p>
              Enviamos um link de redefinição para <strong>{email}</strong>. Abra o e-mail no
              mesmo dispositivo e clique no link para criar uma nova senha.
            </p>
            <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/login" })}>
              <ArrowLeft className="h-4 w-4" /> Voltar para o login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar link
            </Button>
          </form>
        )}

        <p className="mt-6 text-xs text-muted-foreground text-center">
          Lembrou a senha?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}