import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { X, Camera } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (text: string) => void;
}

export function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
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
        const controls = await reader.decodeFromVideoDevice(
          back.deviceId,
          videoRef.current!,
          (result, _err, ctrl) => {
            if (result) {
              ctrl.stop();
              onDetected(result.getText());
              onClose();
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
        {/* Guia visual */}
        <div className="absolute inset-x-8 h-32 border-2 border-white/80 rounded-lg pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
        {error && (
          <div className="absolute bottom-8 left-4 right-4 bg-destructive text-destructive-foreground p-3 rounded-md text-sm text-center">
            {error}
          </div>
        )}
      </div>
      <p className="p-4 text-white/80 text-sm text-center">
        Aponte para o código de barras do boleto
      </p>
    </div>
  );
}