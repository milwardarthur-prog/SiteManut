"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanLine, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import dynamic from "next/dynamic";

const QrReader = dynamic(() => import("./qr-reader"), { ssr: false });

export default function ScannerClient() {
  const router = useRouter();
  const [manualCode, setManualCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const lookupCode = async (code: string) => {
    if (!code) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/equipamentos/qr/${encodeURIComponent(code)}`);
      if (res.ok) {
        const data = await res.json();
        router.push(`/equipamentos/${data?.id}`);
      } else {
        toast.error("Equipamento não encontrado");
      }
    } catch { toast.error("Erro na busca"); } finally { setLoading(false); }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900">Escanear QR Code</h1>
        <p className="text-sm text-muted-foreground mt-1">Escaneie o QR code do equipamento ou digite o código manualmente</p>
      </div>

      <Card className="border-0 shadow-md">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ScanLine className="w-4 h-4" /> Câmera</CardTitle></CardHeader>
        <CardContent>
          {showScanner ? (
            <QrReader onResult={(code: string) => { setShowScanner(false); lookupCode(code); }} />
          ) : (
            <Button onClick={() => setShowScanner(true)} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
              <ScanLine className="w-4 h-4 mr-2" /> Abrir Câmera
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-md">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Search className="w-4 h-4" /> Busca Manual</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input placeholder="Código do QR (ex: BELTLOC-EQ001-...)" value={manualCode} onChange={(e: any) => setManualCode(e?.target?.value ?? "")} />
            <Button onClick={() => lookupCode(manualCode)} disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-white">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
