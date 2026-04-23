import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { X, Camera, Keyboard } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (text: string) => void;
}

export function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.ITF,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
    ]);
    const reader = new BrowserMultiFormatReader(hints);

    let cancelled = false;
    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const back = devices.find((d) => /back|rear|traseira|environment/i.test(d.label)) ?? devices[0];
        if (!back) {
          setError("Nenhuma câmera encontrada.");
          return;
        }
        if (cancelled) return;
        const controls = await reader.decodeFromConstraints(
          {
            video: {
              deviceId: back.deviceId ? { exact: back.deviceId } : undefined,
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              focusMode: "continuous",
            } as MediaTrackConstraints,
          },
          videoRef.current!,
          (result, _err, ctrl) => {
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
          }
        );
        controlsRef.current = controls;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro ao acessar a câmera";
        setError(msg);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onClose, onDetected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          <span className="font-medium">Escanear boleto</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/10">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        <div className="absolute inset-x-4 h-24 border-2 border-primary-foreground/90 rounded-lg pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
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