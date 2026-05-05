import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, XCircle, Loader2, ArrowLeft, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/scanner-test")({
  component: ScannerTestPage,
});

type Step = {
  label: string;
  status: "pending" | "running" | "ok" | "fail";
  detail?: string;
  ms?: number;
};

function ScannerTestPage() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [permission, setPermission] = useState<string>("desconhecido");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [tapMs, setTapMs] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isHttps = typeof location !== "undefined" && (location.protocol === "https:" || location.hostname === "localhost");
  const hasMediaDevices = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    // Estado inicial de permissão (quando suportado)
    const anyNav = navigator as unknown as {
      permissions?: { query: (d: { name: string }) => Promise<{ state: string; onchange: unknown }> };
    };
    anyNav.permissions
      ?.query({ name: "camera" })
      .then((res) => setPermission(res.state))
      .catch(() => setPermission("não consultável"));
  }, []);

  function update(i: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function runTest() {
    setRunning(true);
    setTapMs(null);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    const initial: Step[] = [
      { label: "HTTPS / contexto seguro", status: "pending" },
      { label: "API getUserMedia disponível", status: "pending" },
      { label: "Solicitar câmera traseira", status: "pending" },
      { label: "Renderizar vídeo (primeiro frame)", status: "pending" },
      { label: "Listar dispositivos de mídia", status: "pending" },
    ];
    setSteps(initial);
    const tapStart = performance.now();

    // 1) HTTPS
    update(0, { status: "running" });
    if (isHttps) update(0, { status: "ok", detail: location.protocol + "//" + location.hostname });
    else {
      update(0, { status: "fail", detail: "A câmera exige HTTPS" });
      setRunning(false);
      return;
    }

    // 2) API
    update(1, { status: "running" });
    if (hasMediaDevices) update(1, { status: "ok" });
    else {
      update(1, { status: "fail", detail: "Navegador sem suporte" });
      setRunning(false);
      return;
    }

    // 3) getUserMedia
    update(2, { status: "running" });
    const t0 = performance.now();
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (e) {
        const err = e as DOMException;
        update(2, { status: "fail", detail: `${err.name}: ${err.message}`, ms: Math.round(performance.now() - t0) });
        setRunning(false);
        return;
      }
    }
    const gumMs = Math.round(performance.now() - t0);
    streamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    update(2, {
      status: "ok",
      ms: gumMs,
      detail: `${track?.label || "câmera"} • ${track?.getSettings().width}×${track?.getSettings().height}`,
    });
    setTapMs(Math.round(performance.now() - tapStart));

    // 4) primeiro frame
    update(3, { status: "running" });
    const v = videoRef.current;
    if (v) {
      v.srcObject = stream;
      const tFrame = performance.now();
      try {
        await v.play();
        await new Promise<void>((resolve, reject) => {
          const to = setTimeout(() => reject(new Error("timeout 5s")), 5000);
          v.onloadeddata = () => {
            clearTimeout(to);
            resolve();
          };
        });
        update(3, { status: "ok", ms: Math.round(performance.now() - tFrame) });
      } catch (e) {
        update(3, { status: "fail", detail: e instanceof Error ? e.message : String(e) });
      }
    }

    // 5) devices
    update(4, { status: "running" });
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter((d) => d.kind === "videoinput");
      setDevices(cams);
      update(4, { status: "ok", detail: `${cams.length} câmera(s)` });
    } catch (e) {
      update(4, { status: "fail", detail: e instanceof Error ? e.message : String(e) });
    }

    setRunning(false);
  }

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-md mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <Link to="/" className="text-sm text-muted-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <h1 className="text-base font-semibold">Diagnóstico do Scanner</h1>
      </header>

      <section className="rounded-lg border p-3 text-xs space-y-1 bg-muted/30">
        <div><strong>Dispositivo:</strong> <span className="break-all">{ua}</span></div>
        <div><strong>Viewport:</strong> {typeof window !== "undefined" ? `${window.innerWidth}×${window.innerHeight}` : "-"}</div>
        <div><strong>Origem:</strong> {typeof location !== "undefined" ? location.origin : "-"}</div>
        <div><strong>HTTPS:</strong> {isHttps ? "sim" : "NÃO"}</div>
        <div><strong>Permissão atual:</strong> {permission}</div>
      </section>

      <Button onClick={runTest} disabled={running} className="w-full" size="lg">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {running ? "Executando…" : "Iniciar teste"}
      </Button>

      {tapMs !== null && (
        <div className="text-center text-sm">
          Tempo do clique até a câmera responder: <strong>{tapMs} ms</strong>
        </div>
      )}

      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 rounded-md border p-2 text-sm">
            <span className="mt-0.5">
              {s.status === "ok" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
              {s.status === "fail" && <XCircle className="h-4 w-4 text-destructive" />}
              {s.status === "running" && <Loader2 className="h-4 w-4 animate-spin" />}
              {s.status === "pending" && <span className="block h-4 w-4 rounded-full border" />}
            </span>
            <div className="flex-1">
              <div className="flex justify-between gap-2">
                <span>{i + 1}. {s.label}</span>
                {s.ms != null && <span className="text-xs text-muted-foreground">{s.ms} ms</span>}
              </div>
              {s.detail && <div className="text-xs text-muted-foreground break-words">{s.detail}</div>}
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-lg border overflow-hidden bg-black aspect-video">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
      </div>

      {devices.length > 0 && (
        <div className="rounded-lg border p-3 text-xs space-y-1">
          <div className="font-semibold">Câmeras detectadas</div>
          {devices.map((d, i) => (
            <div key={d.deviceId || i} className="break-all">• {d.label || `Câmera ${i + 1}`}</div>
          ))}
        </div>
      )}

      <Button variant="outline" onClick={stop} className="w-full">
        <RefreshCw className="h-4 w-4" /> Parar câmera
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Compartilhe esta página com diferentes dispositivos para comparar tempos.
      </p>
    </div>
  );
}