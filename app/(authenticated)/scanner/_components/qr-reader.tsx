"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export default function QrReader({ onResult }: { onResult: (code: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const scannerRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!mounted || !containerRef.current) return;
        const scanner = new Html5Qrcode("qr-reader-el");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (text: string) => {
            scanner.stop().catch(() => {});
            onResult(text);
          },
          () => {}
        );
      } catch (err: any) {
        if (mounted) setError("Não foi possível acessar a câmera. Verifique as permissões.");
      }
    };
    init();
    return () => {
      mounted = false;
      scannerRef.current?.stop?.()?.catch?.(() => {});
    };
  }, [onResult]);

  if (error) return <p className="text-sm text-red-500 text-center py-4">{error}</p>;

  return (
    <div ref={containerRef}>
      <div id="qr-reader-el" className="w-full rounded-lg overflow-hidden" />
      <p className="text-xs text-muted-foreground text-center mt-2">Aponte a câmera para o QR code</p>
    </div>
  );
}
