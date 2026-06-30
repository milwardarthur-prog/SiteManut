"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Loader2, Wrench, FileText, Upload, Trash2, ClipboardList, QrCode, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const QRCode: any = dynamic(() => import("react-qr-code").then((m: any) => m.default ?? m), { ssr: false });

export default function EquipDetailClient({ id }: { id: string }) {
  const { data: session } = useSession() || {};
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const [equip, setEquip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`/api/equipamentos/${id}`);
      if (res.ok) setEquip(await res.json());
    } catch {} finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e?.target?.files ?? [])[0];
    if (!file) return;
    setUploading(true);
    try {
      const presignRes = await fetch("/api/upload/presigned", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, isPublic: false }),
      });
      if (!presignRes.ok) throw new Error();
      const { uploadUrl, cloud_storage_path } = await presignRes.json();
      const upRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!upRes.ok) throw new Error();
      await fetch(`/api/equipamentos/${id}/files`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, cloudStoragePath: cloud_storage_path, contentType: file.type, isPublic: false, fileSize: file.size }),
      });
      toast.success("Arquivo enviado!"); fetch_();
    } catch { toast.error("Erro ao enviar arquivo"); } finally { setUploading(false); e.target.value = ""; }
  };

  const deleteFile = async (fileId: string) => {
    try {
      await fetch(`/api/equipamentos/${id}/files/${fileId}`, { method: "DELETE" });
      toast.success("Arquivo removido"); fetch_();
    } catch { toast.error("Erro"); }
  };

  const downloadFile = async (f: any) => {
    try {
      const res = await fetch("/api/upload/file-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloudStoragePath: f?.cloudStoragePath, contentType: f?.contentType, isPublic: f?.isPublic }),
      });
      if (res.ok) {
        const { url } = await res.json();
        const a = document.createElement("a"); a.href = url; a.download = f?.fileName ?? "arquivo"; document.body.appendChild(a); a.click(); a.remove();
      }
    } catch { toast.error("Erro ao baixar"); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;
  if (!equip) return <div className="text-center py-12 text-muted-foreground">Equipamento não encontrado</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/equipamentos"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">{equip?.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">{equip?.equipmentNumber}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Wrench className="w-4 h-4" /> Informações</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Modelo" value={equip?.model ?? "-"} />
            <Row label="Ano" value={equip?.year ?? "-"} />
            <Row label="Horímetro" value={`${equip?.currentHorimeter ?? 0}h`} />
            <Row label="Localização" value={equip?.location ?? "-"} />
            <Row label="N° Série" value={equip?.serialNumber ?? "-"} />
            {equip?.description && <p className="text-muted-foreground pt-2">{equip.description}</p>}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><QrCode className="w-4 h-4" /> QR Code</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center">
            {equip?.qrCodeData && <QRCode value={equip.qrCodeData} size={160} as any />}
            <p className="text-xs text-muted-foreground mt-2 font-mono">{equip?.qrCodeData ?? ""}</p>
          </CardContent>
        </Card>
      </div>

      {/* Files */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Arquivos PDF ({equip?.files?.length ?? 0})</CardTitle>
            {isAdmin && (
              <label>
                <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                <Button variant="outline" size="sm" className="pointer-events-none">
                  {uploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
                  {uploading ? "Enviando..." : "Upload PDF"}
                </Button>
              </label>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(equip?.files?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum arquivo cadastrado</p>
          ) : (
            <div className="space-y-2">
              {(equip?.files ?? []).map((f: any) => (
                <div key={f?.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-red-500" />
                    <span className="text-sm">{f?.fileName}</span>
                    {f?.fileSize && <span className="text-xs text-muted-foreground">({Math.round((f.fileSize ?? 0) / 1024)}KB)</span>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadFile(f)}>
                      <Download className="w-3 h-3" />
                    </Button>
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteFile(f?.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Work order history */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Histórico de OS ({equip?.workOrders?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {(equip?.workOrders?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma OS registrada</p>
          ) : (
            <div className="space-y-2">
              {(equip?.workOrders ?? []).map((wo: any) => (
                <Link key={wo?.id} href={`/os/${wo?.id}`} className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">OS #{wo?.orderNumber} - {wo?.maintenanceType === "PREVENTIVA" ? "Preventiva" : wo?.maintenanceType === "CORRETIVA" ? "Corretiva" : "Retrabalho"}</span>
                    <span className="text-muted-foreground">{wo?.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Técnico: {wo?.technician?.name ?? "-"}</p>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-medium">{String(value ?? "-")}</span></div>;
}
