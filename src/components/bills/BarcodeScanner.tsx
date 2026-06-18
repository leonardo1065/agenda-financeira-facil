import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { X, Camera, Keyboard, Loader2, ScanText } from "lucide-react";
import { extractPixPayload, getBoletoDigitMessage, isValidBoletoDigits } from "@/lib/boleto";

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (text: string) => void;
  /** Solicitação de câmera iniciada no clique do usuário. Evita bloqueio de permissão. */
  initialStreamRequest?: Promise<MediaStream> | null;
}

export function BarcodeScanner({ open, onClose, onDetected, initialStreamRequest }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [starting, setStarting] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorLoopRef = useRef<number | null>(null);
  const zxingFrameLoopRef = useRef<number | null>(null);

  const findReadableCode = useCallback((raw: string): string | null => {
    const clean = raw.trim();
    if (!clean) return null;
    const pix = extractPixPayload(clean);
    if (pix) return pix;

    const digits = clean.replace(/\D/g, "");
    const candidates = [
      digits.match(/\d{48}/)?.[0],
      digits.match(/\d{47}/)?.[0],
      digits.match(/\d{44}/)?.[0],
    ].filter(Boolean) as string[];
    for (const candidate of candidates) {
      if (isValidBoletoDigits(candidate)) return candidate;
    }
    if (digits.length > 0) setManualCode(digits.slice(0, 48));
    return null;
  }, []);

  const acceptIfReadable = useCallback(
    (raw: string): boolean => {
      if (detectedRef.current) return true;
      const code = findReadableCode(raw);
      if (!code) return false;
      detectedRef.current = true;
      onDetected(code);
      onClose();
      return true;
    },
    [findReadableCode, onClose, onDetected],
  );

  const startEnhancedFrameScan = useCallback(
    (reader: BrowserMultiFormatReader, video: HTMLVideoElement, isCancelled: () => boolean) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      const scan = () => {
        if (isCancelled() || detectedRef.current) return;
        if (video.readyState < 2) {
          zxingFrameLoopRef.current = window.setTimeout(scan, 220) as unknown as number;
          return;
        }
        try {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          if (vw && vh) {
            const crops = [
              { x: 0, y: 0, w: vw, h: vh },
              { x: 0, y: Math.round(vh * 0.25), w: vw, h: Math.round(vh * 0.5) },
              {
                x: Math.round(vw * 0.05),
                y: Math.round(vh * 0.35),
                w: Math.round(vw * 0.9),
                h: Math.round(vh * 0.3),
              },
            ];

            for (const crop of crops) {
              canvas.width = crop.w;
              canvas.height = crop.h;
              ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
              try {
                if (acceptIfReadable(reader.decodeFromCanvas(canvas).getText())) return;
              } catch {
                // tenta próximo recorte
              }
            }
          }
        } finally {
          zxingFrameLoopRef.current = window.setTimeout(scan, 220) as unknown as number;
        }
      };
      scan();
    },
    [acceptIfReadable],
  );

  useEffect(() => {
    if (!open) return;
    detectedRef.current = false;
    setError(null);
    setStarting(true);

    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.ITF,
      BarcodeFormat.CODE_128,
      BarcodeFormat.QR_CODE,
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
          throw new Error(
            "Seu navegador não suporta câmera. Use Chrome/Safari atualizado em HTTPS.",
          );
        }
        // Aguarda a solicitação iniciada no clique (preserva gesto do usuário) ou solicita agora
        let stream = initialStreamRequest ? await initialStreamRequest : null;
        if (!stream) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
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

        startEnhancedFrameScan(reader, video, () => cancelled);

        // Tenta ativar foco contínuo e torch off (melhora muito o ITF do boleto)
        try {
          const track = stream.getVideoTracks()[0];
          const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
            focusMode?: string[];
          };
          const advanced: MediaTrackConstraintSet[] = [];
          if (caps.focusMode?.includes("continuous")) {
            (advanced as Array<Record<string, unknown>>).push({ focusMode: "continuous" });
          }
          if (advanced.length) await track.applyConstraints({ advanced });
        } catch {
          // ignora — nem todo dispositivo suporta
        }

        // Caminho 1: BarcodeDetector nativo — ótimo para QR Code/Pix e, em alguns aparelhos, ITF.
        const NativeDetector = (
          window as unknown as {
            BarcodeDetector?: new (opts?: { formats?: string[] }) => {
              detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
            };
          }
        ).BarcodeDetector;
        if (NativeDetector) {
          try {
            const detector = new NativeDetector({
              formats: ["itf", "code_128", "qr_code", "pdf417"],
            });
            const tick = async () => {
              if (cancelled) return;
              try {
                const results = await detector.detect(video);
                for (const r of results) {
                  if (acceptIfReadable(r.rawValue || "")) return;
                }
              } catch {
                // segue o loop
              }
              detectorLoopRef.current = window.setTimeout(tick, 120) as unknown as number;
            };
            tick();
          } catch {
            // cai para ZXing
          }
        }

        const controls = await reader.decodeFromStream(stream, video, (result, _err, ctrl) => {
          if (result) {
            if (acceptIfReadable(result.getText())) {
              // Só aceita leituras com DVs válidos — descarta resultados
              // corrompidos e continua tentando.
              ctrl.stop();
            }
          }
        });
        controlsRef.current = controls;
        setStarting(false);
      } catch (e) {
        const err = e as DOMException | Error;
        let msg = err.message || "Erro ao acessar a câmera";
        if (err.name === "NotAllowedError") {
          msg = "Permissão de câmera negada. Habilite nas configurações do navegador.";
        } else if (err.name === "NotFoundError") msg = "Nenhuma câmera encontrada no dispositivo.";
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
      if (detectorLoopRef.current != null) {
        clearTimeout(detectorLoopRef.current);
        detectorLoopRef.current = null;
      }
      if (zxingFrameLoopRef.current != null) {
        clearTimeout(zxingFrameLoopRef.current);
        zxingFrameLoopRef.current = null;
      }
      controlsRef.current?.stop();
      controlsRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, onClose, onDetected, initialStreamRequest, acceptIfReadable, startEnhancedFrameScan]);

  if (!open) return null;

  async function runOcr() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    setOcrRunning(true);
    try {
      const canvas = document.createElement("canvas");
      const w = video.videoWidth;
      const h = video.videoHeight;
      // Recorta uma faixa horizontal central (onde fica o retângulo do scanner)
      // — OCR fica muito mais rápido e preciso na linha digitável.
      const cropH = Math.round(h * 0.32);
      const cropY = Math.round((h - cropH) / 2);
      canvas.width = w;
      canvas.height = cropH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      ctx.drawImage(video, 0, cropY, w, cropH, 0, 0, w, cropH);
      // Pré-processamento: escala de cinza + contraste
      const img = ctx.getImageData(0, 0, w, cropH);
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
        tessedit_char_whitelist: "0123456789 .-",
        preserve_interword_spaces: "1",
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
        <p>
          Aproxime, mantenha o boleto reto. Se o código não for detectado, toque em "Ler com OCR"
          para tentar via texto.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={runOcr}
          disabled={ocrRunning || starting}
        >
          {ocrRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanText className="h-4 w-4" />
          )}
          {ocrRunning ? "Lendo texto…" : "Ler linha digitável (OCR)"}
        </Button>
        <div className="flex gap-2">
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            maxLength={48}
            placeholder="Digite ou complete o código"
            className="min-w-0 flex-1 rounded-md border border-primary-foreground/20 bg-background/95 px-3 py-2 text-sm text-foreground outline-none"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => manualCode && onDetected(manualCode)}
            disabled={!manualCode}
          >
            <Keyboard className="h-4 w-4" /> Usar
          </Button>
        </div>
        <p className="text-xs text-primary-foreground/70">{getBoletoDigitMessage(manualCode)}</p>
      </div>
    </div>
  );
}