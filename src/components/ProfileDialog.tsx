import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  email?: string;
}

const onlyDigits = (value: string) => value.replace(/\D/g, "");

function formatWhatsappPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function validateWhatsappPhone(value: string) {
  const digits = onlyDigits(value);
  if (!digits) return "Informe o WhatsApp com DDD.";
  if (!/^\d{10,11}$/.test(digits)) return "Use 10 ou 11 números, incluindo o DDD.";
  if (digits.startsWith("0")) return "Informe o DDD sem zero inicial.";
  return null;
}

export function ProfileDialog({ open, onOpenChange, userId, email }: ProfileDialogProps) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let mounted = true;
    setLoading(true);
    setError(null);

    (supabase as any)
      .from("profiles")
      .select("id, whatsapp_phone")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error: loadError }: any) => {
        if (!mounted) return;
        if (loadError) {
          toast.error("Erro ao carregar perfil", { description: loadError.message });
        } else {
          setProfileId(data?.id ?? null);
          setWhatsappPhone(formatWhatsappPhone(data?.whatsapp_phone ?? ""));
        }
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [open, userId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validationError = validateWhatsappPhone(whatsappPhone);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    const digits = onlyDigits(whatsappPhone);
    const payload = { user_id: userId, whatsapp_phone: digits };
    const request = profileId
      ? (supabase as any).from("profiles").update({ whatsapp_phone: digits }).eq("id", profileId)
      : (supabase as any).from("profiles").insert(payload);
    const { error: saveError } = await request;
    setSaving(false);

    if (saveError) {
      toast.error("Erro ao salvar WhatsApp", { description: saveError.message });
      return;
    }

    toast.success("WhatsApp salvo");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Perfil</DialogTitle>
          <DialogDescription>{email}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="whatsappPhone">WhatsApp com DDD</Label>
            <div className="relative">
              <Phone className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="whatsappPhone"
                className="pl-8"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="(11) 99999-9999"
                value={whatsappPhone}
                onChange={(event) => {
                  setWhatsappPhone(formatWhatsappPhone(event.target.value));
                  setError(null);
                }}
                disabled={loading || saving}
                required
              />
            </div>
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" className="w-full" disabled={loading || saving}>
              {(loading || saving) && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}