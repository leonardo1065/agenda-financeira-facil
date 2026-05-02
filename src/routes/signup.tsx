import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Wallet, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { createAccountWithAccessCode, checkEmailAvailability } from "@/lib/signup.functions";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COMMON_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "live.com",
  "uol.com.br",
  "bol.com.br",
  "terra.com.br",
];

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function suggestDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || COMMON_DOMAINS.includes(domain)) return null;
  for (const d of COMMON_DOMAINS) {
    if (levenshtein(domain, d) === 1) return `${email.slice(0, at)}@${d}`;
  }
  return null;
}

function SignupPage() {
  const { signIn, session, loading } = useAuth();
  const navigate = useNavigate();
  const createAccount = useServerFn(createAccountWithAccessCode);
  const checkEmail = useServerFn(checkEmailAvailability);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [emailStatus, setEmailStatus] = useState<
    | { state: "idle" }
    | { state: "invalid"; message: string }
    | { state: "checking" }
    | { state: "available" }
    | { state: "taken" }
  >({ state: "idle" });

  const trimmedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const suggestion = useMemo(() => suggestDomain(trimmedEmail), [trimmedEmail]);

  useEffect(() => {
    if (!trimmedEmail) {
      setEmailStatus({ state: "idle" });
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailStatus({ state: "invalid", message: "Formato de e-mail inválido." });
      return;
    }
    setEmailStatus({ state: "checking" });
    const handle = setTimeout(async () => {
      try {
        const res = await checkEmail({ data: { email: trimmedEmail } });
        if (!res.ok) {
          setEmailStatus({ state: "idle" });
          return;
        }
        setEmailStatus({ state: res.available ? "available" : "taken" });
      } catch {
        setEmailStatus({ state: "idle" });
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [trimmedEmail, checkEmail]);

  if (!loading && session) {
    return <Navigate to="/" />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(trimmedEmail)) {
      toast.error("E-mail inválido", { description: "Verifique o formato do e-mail." });
      return;
    }
    if (emailStatus.state === "taken") {
      toast.error("Este e-mail já está cadastrado", {
        description: "Tente entrar ou use outro endereço.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = await createAccount({
        data: { displayName, email: trimmedEmail, password },
      });
      if (!result.ok) {
        if (result.code === "email_exists") setEmailStatus({ state: "taken" });
        toast.error("Não foi possível cadastrar", { description: result.message });
        setSubmitting(false);
        return;
      }
      const { error } = await signIn(trimmedEmail, password);
      if (error) {
        toast.success("Conta criada", { description: "Entre com seu e-mail e senha." });
        navigate({ to: "/login" });
      } else {
        toast.success("Conta criada com sucesso");
        navigate({ to: "/" });
      }
    } catch (error) {
      toast.error("Não foi possível cadastrar", {
        description: error instanceof Error ? error.message : "Verifique os dados e tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const emailHint = (() => {
    if (emailStatus.state === "checking")
      return (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Verificando disponibilidade…
        </p>
      );
    if (emailStatus.state === "invalid")
      return (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {emailStatus.message}
        </p>
      );
    if (emailStatus.state === "taken")
      return (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> Este e-mail já está cadastrado.{" "}
          <Link to="/login" className="underline">
            Entrar
          </Link>
        </p>
      );
    if (emailStatus.state === "available")
      return (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-primary" /> E-mail disponível.
        </p>
      );
    return null;
  })();

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-semibold leading-tight">Criar acesso</h1>
            <p className="text-xs text-muted-foreground">Agenda Financeira</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Nome</Label>
            <Input
              id="displayName"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={255}
            />
            {emailHint}
            {suggestion && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setEmail(suggestion)}
              >
                Você quis dizer {suggestion}?
              </button>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              maxLength={72}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={
              submitting ||
              emailStatus.state === "taken" ||
              emailStatus.state === "invalid" ||
              emailStatus.state === "checking"
            }
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar conta
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Já tem acesso?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
