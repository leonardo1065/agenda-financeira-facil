import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { X, Camera, Keyboard, Loader2, ScanText } from "lucide-react";
import { isValidBoletoDigits } from "@/lib/boleto";

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
  const [ocrRunning, setOcrRunning] = useState(false);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStarting(true);

    const hints = new Map<DecodeHintType, unknown>();
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
    // Boletos bancários usam ITF com 44 dígitos. O ZXing rejeita ITF longo por padrão
    // (aceita só 6–14), então liberamos explicitamente os tamanhos esperados.
    hints.set(DecodeHintType.ALLOWED_LENGTHS, [44, 47, 48]);
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 80,
      tryPlayVideoTimeout: 3000,
    });

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
            const raw = result.getText();
            const digits = raw.replace(/\D/g, "");
            // Procura uma sequência numérica válida (44/47/48 dígitos) dentro do resultado
            const match = digits.match(/\d{47,48}/) || digits.match(/\d{44}/);
            const found = match ? match[0] : digits;
            if ([44, 47, 48].includes(found.length) && isValidBoletoDigits(found)) {
              // Só aceita leituras com DVs válidos — descarta resultados
              // corrompidos e continua tentando.
              ctrl.stop();
              onDetected(found);
              onClose();
            } else if (digits.length > 0) {
              // Mostra parcial p/ o usuário, mas não fecha o scanner.
              setManualCode(digits);
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

  async function runOcr() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    setOcrRunning(true);
    try {
      const canvas = document.createElement("canvas");
      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      ctx.drawImage(video, 0, 0, w, h);
      // Pré-processamento: escala de cinza + contraste
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const v = g > 140 ? 255 : g < 90 ? 0 : g;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(img, 0, 0);

      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(canvas, "eng", {
        // Restringe a dígitos e separadores típicos da linha digitável
      } as never);
      const text = (data?.text ?? "").replace(/[^\d\s.]/g, " ");
      const digits = text.replace(/\D/g, "");
      const match = digits.match(/\d{47,48}/) || digits.match(/\d{44}/);
      if (match && isValidBoletoDigits(match[0])) {
        onDetected(match[0]);
        onClose();
      } else if (digits.length >= 20) {
        setManualCode(digits.slice(0, 48));
        setError("OCR leu parcial. Complete os dígitos abaixo e toque em Usar.");
      } else {
        setError("OCR não conseguiu ler. Aproxime, melhore a luz e tente novamente.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no OCR");
    } finally {
      setOcrRunning(false);
    }
  }

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
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-56 border-2 border-primary-foreground/90 rounded-lg pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-56 pointer-events-none overflow-hidden rounded-lg">
          <div className="scanner-laser absolute left-2 right-2 h-[3px] bg-red-500 shadow-[0_0_12px_3px_rgba(239,68,68,0.9)]" />
        </div>
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
        <p>Aproxime, mantenha o boleto reto. Se o código não for detectado, toque em "Ler com OCR" para tentar via texto.</p>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={runOcr}
          disabled={ocrRunning || starting}
        >
          {ocrRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
          {ocrRunning ? "Lendo texto…" : "Ler linha digitável (OCR)"}
        </Button>
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