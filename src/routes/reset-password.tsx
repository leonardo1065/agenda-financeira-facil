import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Wallet, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function finishReady() {
      if (!cancelled) {
        setLinkError(null);
        setReady(true);
      }
    }

    function finishInvalid(message = "O link expirou ou já foi usado. Solicite um novo link.") {
      if (!cancelled) {
        setReady(false);
        setLinkError(message);
      }
    }

    async function consumeUrl() {
      if (typeof window === "undefined") return;
      try {
        const url = new URL(window.location.href);
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const authError = url.searchParams.get("error_description") || hash.get("error_description");
        if (authError) {
          finishInvalid(decodeURIComponent(authError.replace(/\+/g, " ")));
          return;
        }

        // Fluxo PKCE: ?code=...
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!cancelled) {
            if (error) {
              finishInvalid(error.message);
              return;
            }
            url.searchParams.delete("code");
            window.history.replaceState({}, "", url.pathname + url.search);
            finishReady();
          }
          return;
        }

        // Fluxo com token_hash em templates de e-mail personalizados.
        const tokenHash = url.searchParams.get("token_hash") ?? hash.get("token_hash");
        const type = url.searchParams.get("type") ?? hash.get("type");
        if (tokenHash && type === "recovery") {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
          if (!cancelled) {
            if (error) {
              finishInvalid(error.message);
              return;
            }
            window.history.replaceState({}, "", window.location.pathname);
            finishReady();
          }
          return;
        }

        // Fluxo implícito: #access_token=...&refresh_token=...&type=recovery
        if (window.location.hash.includes("access_token")) {
          const access_token = hash.get("access_token");
          const refresh_token = hash.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (!cancelled) {
              if (error) {
                finishInvalid(error.message);
                return;
              }
              window.history.replaceState({}, "", window.location.pathname);
              finishReady();
            }
            return;
          }
        }

        finishInvalid();
      } catch {
        finishInvalid();
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        finishReady();
      }
    });
    consumeUrl();
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Senha muito curta", { description: "Use pelo menos 6 caracteres." });
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não conferem");
      return;
    }
    setSubmitting(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setSubmitting(false);
      setReady(false);
      setLinkError("Sua sessão de redefinição expirou. Solicite um novo link.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error("Não foi possível atualizar a senha", { description: error.message });
      return;
    }
    toast.success("Senha atualizada");
    setDone(true);
    await supabase.auth.signOut();
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
            <h1 className="font-semibold leading-tight">Nova senha</h1>
            <p className="text-xs text-muted-foreground">Escolha uma senha segura</p>
          </div>
        </div>

        {done ? (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-4 w-4" /> Senha atualizada com sucesso.
            </div>
            <Button className="w-full" onClick={() => navigate({ to: "/login", replace: true })}>
              Entrar com a nova senha
            </Button>
          </div>
        ) : linkError ? (
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{linkError}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/forgot-password", replace: true })}>
              <ArrowLeft className="h-4 w-4" /> Enviar novo link
            </Button>
          </div>
        ) : !ready ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Validando link…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirme a senha</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar nova senha
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}