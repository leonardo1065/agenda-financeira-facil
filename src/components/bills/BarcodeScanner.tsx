import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { X, Camera, Keyboard, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (text: string) => void;
  /** Solicitação de câmera iniciada no clique do usuário. Evita bloqueio de permissão. */
  initialStreamRequest?: Promise<MediaStream> | null;
}

export function BarcodeScanner({ open, onClose, onDetected, initialStreamRequest }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [starting, setStarting] = useState(false);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStarting(true);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.ITF,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.CODE_93,
      BarcodeFormat.CODABAR,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.PDF_417,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.ALSO_INVERTED, true);
    const reader = new BrowserMultiFormatReader(hints);

    let cancelled = false;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Seu navegador não suporta câmera. Use Chrome/Safari atualizado em HTTPS.");
        }
        // Aguarda a solicitação iniciada no clique (preserva gesto do usuário) ou solicita agora
        let stream = initialStreamRequest ? await initialStreamRequest : null;
        if (!stream) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: "environment" } },
              audio: false,
            });
          } catch {
            // Fallback: qualquer câmera disponível
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          }
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});

        const controls = await reader.decodeFromStream(stream, video, (result, _err, ctrl) => {
          if (result) {
            const text = result.getText().replace(/\D/g, "");
            if ([44, 47, 48].includes(text.length)) {
              ctrl.stop();
              onDetected(text);
              onClose();
            } else if (text.length > 0) {
              setManualCode(text);
            }
          }
        });
        controlsRef.current = controls;
        setStarting(false);
      } catch (e) {
        const err = e as DOMException | Error;
        let msg = err.message || "Erro ao acessar a câmera";
        if (err.name === "NotAllowedError") msg = "Permissão de câmera negada. Habilite nas configurações do navegador.";
        else if (err.name === "NotFoundError") msg = "Nenhuma câmera encontrada no dispositivo.";
        else if (err.name === "NotReadableError") msg = "Câmera em uso por outro aplicativo.";
        else if (location.protocol !== "https:" && location.hostname !== "localhost") {
          msg = "A câmera só funciona em HTTPS. Abra o app em https://";
        }
        setError(msg);
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, onClose, onDetected, initialStreamRequest]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col pointer-events-auto">
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          <span className="font-medium">Escanear boleto</span>
        </div>
        <Button variant="ghost" onClick={onClose} className="text-white hover:bg-white/10">
          <X className="h-5 w-5" />
          Fechar
        </Button>
      </div>
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        <div className="absolute inset-x-4 h-24 border-2 border-primary-foreground/90 rounded-lg pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        {starting && !error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-3 py-1.5 rounded-md text-xs flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Abrindo câmera…
          </div>
        )}
        {error && (
          <div className="absolute bottom-8 left-4 right-4 bg-destructive text-destructive-foreground p-3 rounded-md text-sm text-center">
            {error}
          </div>
        )}
      </div>
      <div className="space-y-3 p-4 text-primary-foreground/80 text-sm text-center">
        <p>Aproxime, mantenha o boleto reto e preencha manualmente se a câmera capturar só parte do código.</p>
        <div className="flex gap-2">
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="Digite ou complete o código"
            className="min-w-0 flex-1 rounded-md border border-primary-foreground/20 bg-background/95 px-3 py-2 text-sm text-foreground outline-none"
          />
          <Button type="button" variant="secondary" onClick={() => manualCode && onDetected(manualCode)} disabled={!manualCode}>
            <Keyboard className="h-4 w-4" /> Usar
          </Button>
        </div>
      </div>
    </div>
  );
}