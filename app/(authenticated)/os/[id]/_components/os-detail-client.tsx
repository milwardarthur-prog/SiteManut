"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, Play, StopCircle,
  Plus, Trash2, UserPlus, Camera, MessageSquare, Wrench, Clock,
  FileText, Users, Package, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  PENDENTE_APROVACAO: "Pendente Aprovação",
  APROVADA: "Aprovada",
  EM_EXECUCAO: "Em Execução",
  AGUARDANDO_ENCERRAMENTO: "Aguard. Encerramento",
  FINALIZADA: "Finalizada",
  REJEITADA: "Rejeitada",
};

const statusColors: Record<string, string> = {
  PENDENTE_APROVACAO: "bg-amber-100 text-amber-800",
  APROVADA: "bg-blue-100 text-blue-800",
  EM_EXECUCAO: "bg-orange-100 text-orange-800",
  AGUARDANDO_ENCERRAMENTO: "bg-purple-100 text-purple-800",
  FINALIZADA: "bg-green-100 text-green-800",
  REJEITADA: "bg-red-100 text-red-800",
};

const typeLabels: Record<string, string> = {
  PREVENTIVA: "Preventiva",
  CORRETIVA: "Corretiva",
  RETRABALHO: "Retrabalho",
};

export default function OSDetailClient({ id }: { id: string }) {
  const { data: session } = useSession() || {};
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [technicians, setTechnicians] = useState<any[]>([]);

  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const userId = (session?.user as any)?.id;

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/os/${id}`);
      if (res.ok) setOrder(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();
    fetch("/api/users/technicians").then((r) => r.json()).then(setTechnicians).catch(() => {});
  }, [fetchOrder]);

  const doAction = async (action: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/os/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        toast.success("Status atualizado!");
        fetchOrder();
      } else {
        const data = await res.json();
        toast.error(data?.error ?? "Erro ao atualizar");
      }
    } catch {
      toast.error("Erro ao atualizar status");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;
  }

  if (!order) {
    return <div className="text-center py-12 text-muted-foreground">OS não encontrada</div>;
  }

  const status = order?.status ?? "";
  const canStart = status === "APROVADA" && (isAdmin || order?.technicianId === userId);
  const canTechClose = status === "EM_EXECUCAO" && (isAdmin || order?.technicianId === userId);
  const canAdminClose = status === "AGUARDANDO_ENCERRAMENTO" && isAdmin;
  const canApprove = status === "PENDENTE_APROVACAO" && isAdmin;
  const canEdit = ["APROVADA", "EM_EXECUCAO"].includes(status);
  const isExecuting = status === "EM_EXECUCAO";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/os">
            <Button variant="ghost" size="icon" className="text-gray-500">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900">
                OS #{order?.orderNumber ?? 0}
              </h1>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[status] ?? "bg-gray-100"}`}>
                {statusLabels[status] ?? status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {typeLabels[order?.maintenanceType] ?? order?.maintenanceType} • {order?.equipment?.name ?? ""}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {canApprove && (
            <>
              <Button onClick={() => doAction("approve")} disabled={actionLoading} className="bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle2 className="w-4 h-4 mr-1" /> Aprovar
              </Button>
              <Button onClick={() => doAction("reject")} disabled={actionLoading} variant="destructive">
                <XCircle className="w-4 h-4 mr-1" /> Rejeitar
              </Button>
            </>
          )}
          {canStart && (
            <Button onClick={() => doAction("start")} disabled={actionLoading} className="bg-orange-500 hover:bg-orange-600 text-white">
              <Play className="w-4 h-4 mr-1" /> Iniciar Execução
            </Button>
          )}
          {canTechClose && (
            <Button onClick={() => doAction("tech_close")} disabled={actionLoading} className="bg-purple-600 hover:bg-purple-700 text-white">
              <StopCircle className="w-4 h-4 mr-1" /> Encerrar OS
            </Button>
          )}
          {canAdminClose && (
            <Button onClick={() => doAction("final_close")} disabled={actionLoading} className="bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle2 className="w-4 h-4 mr-1" /> Encerrar Definitivamente
            </Button>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoCard title="Informações da OS" icon={<FileText className="w-4 h-4" />}>
          <InfoRow label="Número" value={`#${order?.orderNumber ?? 0}`} />
          <InfoRow label="Tipo" value={typeLabels[order?.maintenanceType] ?? ""} />
          <InfoRow label="Equipamento" value={`${order?.equipment?.equipmentNumber ?? ""} - ${order?.equipment?.name ?? ""}`} />
          <InfoRow label="Horímetro" value={order?.horimeter != null ? `${order.horimeter}h` : "-"} />
          <InfoRow label="Criado por" value={order?.createdBy?.name ?? "-"} />
          <InfoRow label="Abertura" value={order?.createdAt ? new Date(order.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "-"} />
          {order?.startedAt && <InfoRow label="Início" value={new Date(order.startedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} />}
          {order?.closedAt && <InfoRow label="Encerramento" value={new Date(order.closedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} />}
          {order?.totalTimeMinutes != null && (
            <InfoRow label="Tempo Total" value={`${Math.floor((order.totalTimeMinutes ?? 0) / 60)}h ${(order.totalTimeMinutes ?? 0) % 60}min`} />
          )}
        </InfoCard>

        <InfoCard title="Técnico Responsável" icon={<Users className="w-4 h-4" />}>
          <InfoRow label="Nome" value={order?.technician?.name ?? "-"} />
          <InfoRow label="Email" value={order?.technician?.email ?? "-"} />
          {order?.closedBy && <InfoRow label="Encerrado por" value={order.closedBy.name} />}
        </InfoCard>
      </div>

      {/* Admin notes */}
      {isAdmin && (
        <AdminNotesSection orderId={id} currentNotes={order?.adminNotes ?? ""} onSaved={fetchOrder} />
      )}
      {!isAdmin && order?.adminNotes && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Instruções do Gestor</CardTitle>
          </CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{order.adminNotes}</p></CardContent>
        </Card>
      )}

      {/* Comments */}
      <CommentsSection orderId={id} currentComments={order?.comments ?? ""} canEdit={canEdit} onSaved={fetchOrder} />

      {/* Parts */}
      <PartsSection orderId={id} parts={order?.parts ?? []} canEdit={canEdit} onSaved={fetchOrder} />

      {/* Helpers - VITAL section */}
      {isExecuting && (
        <HelpersSection orderId={id} helpers={order?.helpers ?? []} technicians={technicians} currentTechId={order?.technicianId ?? ""} onSaved={fetchOrder} />
      )}
      {!isExecuting && (order?.helpers?.length ?? 0) > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><UserPlus className="w-4 h-4 text-orange-500" /> Ajudantes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(order?.helpers ?? []).map((h: any) => (
                <div key={h?.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium">{h?.helper?.name ?? ""}</span>
                  <span className="text-xs text-muted-foreground">
                    {h?.startTime ? new Date(h.startTime).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : ""}
                    {h?.endTime ? ` – ${new Date(h.endTime).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : " (em andamento)"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photos */}
      <PhotosSection orderId={id} photos={order?.photos ?? []} canUpload={canTechClose || isExecuting} onSaved={fetchOrder} />
    </div>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">{icon} {title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

/* Admin Notes */
function AdminNotesSection({ orderId, currentNotes, onSaved }: { orderId: string; currentNotes: string; onSaved: () => void }) {
  const [notes, setNotes] = useState(currentNotes);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/os/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes: notes }),
      });
      if (res.ok) { toast.success("Instruções salvas!"); onSaved(); }
      else toast.error("Erro ao salvar");
    } catch { toast.error("Erro"); } finally { setSaving(false); }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Instruções Adicionais (Gestor)</CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea value={notes} onChange={(e: any) => setNotes(e?.target?.value ?? "")} placeholder="Ex: Conferir item X, Trocar item Y..." rows={3} />
        <Button onClick={save} disabled={saving} size="sm" className="mt-2 bg-orange-500 hover:bg-orange-600 text-white">
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />} Salvar
        </Button>
      </CardContent>
    </Card>
  );
}

/* Comments */
function CommentsSection({ orderId, currentComments, canEdit, onSaved }: { orderId: string; currentComments: string; canEdit: boolean; onSaved: () => void }) {
  const [comments, setComments] = useState(currentComments);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/os/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments }),
      });
      if (res.ok) { toast.success("Comentários salvos!"); onSaved(); }
      else toast.error("Erro ao salvar");
    } catch { toast.error("Erro"); } finally { setSaving(false); }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Wrench className="w-4 h-4" /> Comentários Técnicos</CardTitle>
      </CardHeader>
      <CardContent>
        {canEdit ? (
          <>
            <Textarea value={comments} onChange={(e: any) => setComments(e?.target?.value ?? "")} placeholder="Descreva os serviços realizados..." rows={3} />
            <Button onClick={save} disabled={saving} size="sm" className="mt-2 bg-orange-500 hover:bg-orange-600 text-white">
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />} Salvar
            </Button>
          </>
        ) : (
          <p className="text-sm whitespace-pre-wrap">{currentComments || "Nenhum comentário registrado."}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* Parts */
function PartsSection({ orderId, parts, canEdit, onSaved }: { orderId: string; parts: any[]; canEdit: boolean; onSaved: () => void }) {
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [adding, setAdding] = useState(false);

  const addPart = async () => {
    if (!desc.trim()) { toast.error("Descrição é obrigatória"); return; }
    setAdding(true);
    try {
      const res = await fetch(`/api/os/${orderId}/parts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc, quantity: parseInt(qty) || 1 }),
      });
      if (res.ok) { setDesc(""); setQty("1"); toast.success("Peça adicionada!"); onSaved(); }
    } catch { toast.error("Erro"); } finally { setAdding(false); }
  };

  const removePart = async (partId: string) => {
    try {
      await fetch(`/api/os/${orderId}/parts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partId }),
      });
      toast.success("Peça removida"); onSaved();
    } catch { toast.error("Erro"); }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4" /> Peças Utilizadas ({parts?.length ?? 0})</CardTitle>
      </CardHeader>
      <CardContent>
        {(parts?.length ?? 0) > 0 && (
          <div className="space-y-2 mb-4">
            {(parts ?? []).map((p: any) => (
              <div key={p?.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <span className="text-sm">{p?.description} <span className="text-muted-foreground">(x{p?.quantity ?? 1})</span></span>
                {canEdit && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removePart(p?.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="flex gap-2">
            <Input placeholder="Descrição da peça" value={desc} onChange={(e: any) => setDesc(e?.target?.value ?? "")} className="flex-1" />
            <Input type="number" min="1" value={qty} onChange={(e: any) => setQty(e?.target?.value ?? "1")} className="w-20" />
            <Button onClick={addPart} disabled={adding} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* Helpers - VITAL */
function HelpersSection({ orderId, helpers, technicians, currentTechId, onSaved }: {
  orderId: string; helpers: any[]; technicians: any[]; currentTechId: string; onSaved: () => void;
}) {
  const [helperId, setHelperId] = useState("");
  const [adding, setAdding] = useState(false);

  const availableTechs = (technicians ?? []).filter((t: any) => t?.id !== currentTechId);

  const addHelper = async () => {
    if (!helperId) { toast.error("Selecione um ajudante"); return; }
    setAdding(true);
    try {
      const res = await fetch(`/api/os/${orderId}/helpers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helperId, startTime: new Date().toISOString() }),
      });
      if (res.ok) { setHelperId(""); toast.success("Ajudante adicionado!"); onSaved(); }
    } catch { toast.error("Erro"); } finally { setAdding(false); }
  };

  const endHelper = async (recordId: string) => {
    try {
      await fetch(`/api/os/${orderId}/helpers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, endTime: new Date().toISOString() }),
      });
      toast.success("Período encerrado"); onSaved();
    } catch { toast.error("Erro"); }
  };

  const removeHelper = async (recordId: string) => {
    try {
      await fetch(`/api/os/${orderId}/helpers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helperId: recordId }),
      });
      toast.success("Ajudante removido"); onSaved();
    } catch { toast.error("Erro"); }
  };

  return (
    <Card className="border-2 border-orange-200 shadow-md bg-orange-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-orange-700">
          <UserPlus className="w-5 h-5" /> Inserir Ajudante
        </CardTitle>
        <p className="text-xs text-orange-600">Adicione técnicos que estão auxiliando nesta OS</p>
      </CardHeader>
      <CardContent>
        {(helpers?.length ?? 0) > 0 && (
          <div className="space-y-2 mb-4">
            {(helpers ?? []).map((h: any) => (
              <div key={h?.id} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
                <div>
                  <p className="text-sm font-medium">{h?.helper?.name ?? ""}</p>
                  <p className="text-xs text-muted-foreground">
                    Início: {h?.startTime ? new Date(h.startTime).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : ""}
                    {h?.endTime ? ` | Fim: ${new Date(h.endTime).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  {!h?.endTime && (
                    <Button variant="outline" size="sm" onClick={() => endHelper(h?.id)} className="text-xs">
                      <StopCircle className="w-3 h-3 mr-1" /> Encerrar
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeHelper(h?.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Select value={helperId} onValueChange={setHelperId}>
            <SelectTrigger className="flex-1 bg-white">
              <SelectValue placeholder="Selecione o ajudante" />
            </SelectTrigger>
            <SelectContent>
              {availableTechs.map((t: any) => (
                <SelectItem key={t?.id} value={t?.id ?? ""}>{t?.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addHelper} disabled={adding} className="bg-orange-500 hover:bg-orange-600 text-white">
            <UserPlus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* Photos */
function PhotosSection({ orderId, photos, canUpload, onSaved }: {
  orderId: string; photos: any[]; canUpload: boolean; onSaved: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    loadPhotoUrls();
  }, [photos]);

  const loadPhotoUrls = async () => {
    const urls: Record<string, string> = {};
    for (const photo of photos ?? []) {
      try {
        const res = await fetch("/api/upload/file-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cloudStoragePath: photo?.cloudStoragePath, contentType: photo?.contentType, isPublic: photo?.isPublic }),
        });
        if (res.ok) {
          const data = await res.json();
          urls[photo?.id] = data?.url ?? "";
        }
      } catch { /* ignore */ }
    }
    setPhotoUrls(urls);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e?.target?.files ?? [])[0];
    if (!file) return;
    setUploading(true);
    try {
      // Get presigned URL
      const presignRes = await fetch("/api/upload/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, isPublic: false }),
      });
      if (!presignRes.ok) throw new Error("Falha ao gerar URL");
      const { uploadUrl, cloud_storage_path } = await presignRes.json();

      // Upload to S3
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Falha no upload");

      // Register photo
      await fetch(`/api/os/${orderId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, cloudStoragePath: cloud_storage_path, contentType: file.type, isPublic: false }),
      });
      toast.success("Foto enviada!");
      onSaved();
    } catch {
      toast.error("Erro ao enviar foto");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Camera className="w-4 h-4" /> Fotos ({photos?.length ?? 0})</CardTitle>
      </CardHeader>
      <CardContent>
        {(photos?.length ?? 0) > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {(photos ?? []).map((p: any) => (
              <div key={p?.id} className="aspect-square bg-gray-100 rounded-lg overflow-hidden relative">
                {photoUrls[p?.id] ? (
                  <img src={photoUrls[p.id]} alt={p?.fileName ?? "Foto"} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                )}
              </div>
            ))}
          </div>
        )}
        {canUpload && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
            <Button variant="outline" size="sm" className="pointer-events-none">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Camera className="w-4 h-4 mr-1" />}
              {uploading ? "Enviando..." : "Enviar Foto (opcional)"}
            </Button>
          </label>
        )}
      </CardContent>
    </Card>
  );
}
