import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { createAccountWithAccessCode } from "@/lib/signup.functions";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const { signIn, session, loading } = useAuth();
  const navigate = useNavigate();
  const createAccount = useServerFn(createAccountWithAccessCode);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    return <Navigate to="/" />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await createAccount({ data: { displayName, email, password } });
      if (!result.ok) {
        toast.error("Não foi possível cadastrar", { description: result.message });
        setSubmitting(false);
        return;
      }
      const { error } = await signIn(email, password);
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
          <Button type="submit" className="w-full" disabled={submitting}>
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
