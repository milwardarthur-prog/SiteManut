"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, Play, StopCircle,
  Plus, Trash2, UserPlus, Camera, MessageSquare, Wrench, Clock,
  FileText, Users, Package, Save, Settings, Gauge, ClipboardCheck,
  Zap, Send,
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

const scopeLabels: Record<string, string> = {
  NORMAL: "Normal",
  CHECKLIST: "Checklist",
  TESTE_CARGA: "Teste de Carga",
};

const scopeColors: Record<string, string> = {
  NORMAL: "bg-gray-100 text-gray-700",
  CHECKLIST: "bg-teal-100 text-teal-800",
  TESTE_CARGA: "bg-indigo-100 text-indigo-800",
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

  const deleteOrder = async () => {
    if (!confirm("Tem certeza que deseja excluir esta OS? Ela será arquivada e removida das listas ativas.")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/os/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("OS excluída!");
        router.push("/os");
      } else {
        const data = await res.json();
        toast.error(data?.error ?? "Erro ao excluir");
      }
    } catch {
      toast.error("Erro ao excluir OS");
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
              {order?.scope && order.scope !== "NORMAL" && (
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${scopeColors[order?.scope] ?? "bg-gray-100"}`}>
                  {scopeLabels[order?.scope] ?? order?.scope}
                </span>
              )}
              {order?.deletedAt && (
                <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-red-100 text-red-800">
                  Excluída
                </span>
              )}
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
          {isAdmin && !order?.deletedAt && (
            <Button onClick={deleteOrder} disabled={actionLoading} variant="destructive">
              <Trash2 className="w-4 h-4 mr-1" /> Excluir OS
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
          <InfoRow label="Nome" value={order?.technician?.name ?? "Sem técnico"} />
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

      {/* Admin controls: alterar técnico, tipo, horímetro */}
      {isAdmin && (
        <AdminControlsSection order={order} technicians={technicians} onSaved={fetchOrder} />
      )}

      {/* Checklist */}
      {order?.scope === "CHECKLIST" && (
        <ChecklistSection order={order} canEdit={canEdit || isAdmin} onSaved={fetchOrder} />
      )}

      {/* Teste de Carga */}
      {order?.scope === "TESTE_CARGA" && (
        <LoadTestSection order={order} canEdit={canEdit || isAdmin} onSaved={fetchOrder} />
      )}

      {/* Comments (histórico) */}
      <CommentsSection orderId={id} comments={order?.technicalComments ?? []} legacyComments={order?.comments ?? ""} canEdit={canEdit || isAdmin} onSaved={fetchOrder} />

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

/* Admin controls: alterar técnico responsável, tipo de manutenção e horímetro */
function AdminControlsSection({ order, technicians, onSaved }: { order: any; technicians: any[]; onSaved: () => void }) {
  const [techId, setTechId] = useState<string>(order?.technicianId ?? "NONE");
  const [type, setType] = useState<string>(order?.maintenanceType ?? "PREVENTIVA");
  const [horimeter, setHorimeter] = useState<string>(order?.horimeter != null ? String(order.horimeter) : "");
  const [saving, setSaving] = useState(false);

  const isScoped = order?.scope === "CHECKLIST" || order?.scope === "TESTE_CARGA";

  const save = async () => {
    setSaving(true);
    try {
      const body: any = {
        technicianId: techId === "NONE" ? "" : techId,
        horimeter: horimeter === "" ? null : parseFloat(horimeter),
      };
      // Checklist/Teste de Carga são sempre PREVENTIVA — não permitir alterar tipo
      if (!isScoped) body.maintenanceType = type;
      const res = await fetch(`/api/os/${order?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { toast.success("Alterações salvas!"); onSaved(); }
      else { const d = await res.json(); toast.error(d?.error ?? "Erro ao salvar"); }
    } catch { toast.error("Erro"); } finally { setSaving(false); }
  };

  return (
    <Card className="border-2 border-blue-200 shadow-sm bg-blue-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-blue-700"><Settings className="w-4 h-4" /> Controles do Gestor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Técnico Responsável</Label>
            <Select value={techId} onValueChange={setTechId}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Sem técnico</SelectItem>
                {(technicians ?? []).map((t: any) => (
                  <SelectItem key={t?.id} value={t?.id}>{t?.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo de Manutenção</Label>
            <Select value={type} onValueChange={setType} disabled={isScoped}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(typeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isScoped && <p className="text-[10px] text-muted-foreground mt-1">Checklist/Teste de Carga sempre preventiva</p>}
          </div>
          <div>
            <Label className="text-xs">Horímetro</Label>
            <Input type="number" step="0.1" value={horimeter} onChange={(e: any) => setHorimeter(e?.target?.value ?? "")} className="bg-white" placeholder="Ex: 1250.5" />
          </div>
        </div>
        <Button onClick={save} disabled={saving} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />} Salvar Alterações
        </Button>
      </CardContent>
    </Card>
  );
}

/* Checklist */
function ChecklistSection({ order, canEdit, onSaved }: { order: any; canEdit: boolean; onSaved: () => void }) {
  const toDateInput = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : "");
  const [checklistDate, setChecklistDate] = useState<string>(toDateInput(order?.checklistDate));
  const [horimeter, setHorimeter] = useState<string>(order?.horimeter != null ? String(order.horimeter) : "");
  const [tankSample, setTankSample] = useState<string>(order?.tankSample ?? "");
  const [f1, setF1] = useState<string>(order?.checkFuelFilter1 ?? "");
  const [f2, setF2] = useState<string>(order?.checkFuelFilter2 ?? "");
  const [f3, setF3] = useState<string>(order?.checkFuelFilter3 ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/os/${order?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklistDate: checklistDate || null,
          horimeter: horimeter === "" ? null : parseFloat(horimeter),
          tankSample: tankSample || null,
          checkFuelFilter1: f1 || null,
          checkFuelFilter2: f2 || null,
          checkFuelFilter3: f3 || null,
        }),
      });
      if (res.ok) { toast.success("Checklist salvo!"); onSaved(); }
      else toast.error("Erro ao salvar");
    } catch { toast.error("Erro"); } finally { setSaving(false); }
  };

  return (
    <Card className="border-2 border-teal-200 shadow-sm bg-teal-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-teal-700"><ClipboardCheck className="w-4 h-4" /> Checklist</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Data</Label>
            <Input type="date" value={checklistDate} onChange={(e: any) => setChecklistDate(e?.target?.value ?? "")} disabled={!canEdit} className="bg-white" />
          </div>
          <div>
            <Label className="text-xs">Horímetro</Label>
            <Input type="number" step="0.1" value={horimeter} onChange={(e: any) => setHorimeter(e?.target?.value ?? "")} disabled={!canEdit} className="bg-white" />
          </div>
        </div>
        <OptionGroup label="Amostra do Tanque" value={tankSample} onChange={setTankSample} disabled={!canEdit}
          options={[{ v: "BOA", l: "Boa" }, { v: "RUIM", l: "Ruim" }]} />
        <OptionGroup label="Filtro Combustível 1" value={f1} onChange={setF1} disabled={!canEdit}
          options={[{ v: "BOM", l: "Bom" }, { v: "TROCADO", l: "Trocado" }]} />
        <OptionGroup label="Filtro Combustível 2" value={f2} onChange={setF2} disabled={!canEdit}
          options={[{ v: "BOM", l: "Bom" }, { v: "TROCADO", l: "Trocado" }, { v: "NAO_APLICA", l: "Não se aplica" }]} />
        <OptionGroup label="Filtro Combustível 3" value={f3} onChange={setF3} disabled={!canEdit}
          options={[{ v: "BOM", l: "Bom" }, { v: "TROCADO", l: "Trocado" }, { v: "NAO_APLICA", l: "Não se aplica" }]} />
        {canEdit && (
          <Button onClick={save} disabled={saving} size="sm" className="bg-teal-600 hover:bg-teal-700 text-white">
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />} Salvar Checklist
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* Teste de Carga */
function LoadTestSection({ order, canEdit, onSaved }: { order: any; canEdit: boolean; onSaved: () => void }) {
  const toDateInput = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : "");
  const [loadTestDate, setLoadTestDate] = useState<string>(toDateInput(order?.loadTestDate));
  const [horimeter, setHorimeter] = useState<string>(order?.horimeter != null ? String(order.horimeter) : "");
  const [voltageEmpty, setVoltageEmpty] = useState<string>(order?.voltageEmpty ?? "");
  const [frequencyEmpty, setFrequencyEmpty] = useState<string>(order?.frequencyEmpty ?? "");
  const [load, setLoad] = useState<string>(order?.load ?? "");
  const [frequencyLoad, setFrequencyLoad] = useState<string>(order?.frequencyLoad ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/os/${order?.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loadTestDate: loadTestDate || null,
          horimeter: horimeter === "" ? null : parseFloat(horimeter),
          voltageEmpty: voltageEmpty || null,
          frequencyEmpty: frequencyEmpty || null,
          load: load || null,
          frequencyLoad: frequencyLoad || null,
        }),
      });
      if (res.ok) { toast.success("Teste de Carga salvo!"); onSaved(); }
      else toast.error("Erro ao salvar");
    } catch { toast.error("Erro"); } finally { setSaving(false); }
  };

  return (
    <Card className="border-2 border-indigo-200 shadow-sm bg-indigo-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-indigo-700"><Zap className="w-4 h-4" /> Teste de Carga</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Data</Label>
            <Input type="date" value={loadTestDate} onChange={(e: any) => setLoadTestDate(e?.target?.value ?? "")} disabled={!canEdit} className="bg-white" />
          </div>
          <div>
            <Label className="text-xs">Horímetro</Label>
            <Input type="number" step="0.1" value={horimeter} onChange={(e: any) => setHorimeter(e?.target?.value ?? "")} disabled={!canEdit} className="bg-white" />
          </div>
          <div>
            <Label className="text-xs">Tensão Vazio</Label>
            <Input value={voltageEmpty} onChange={(e: any) => setVoltageEmpty(e?.target?.value ?? "")} disabled={!canEdit} className="bg-white" placeholder="Ex: 220V" />
          </div>
          <div>
            <Label className="text-xs">Frequência Vazio</Label>
            <Input value={frequencyEmpty} onChange={(e: any) => setFrequencyEmpty(e?.target?.value ?? "")} disabled={!canEdit} className="bg-white" placeholder="Ex: 60Hz" />
          </div>
          <div>
            <Label className="text-xs">Carga</Label>
            <Input value={load} onChange={(e: any) => setLoad(e?.target?.value ?? "")} disabled={!canEdit} className="bg-white" placeholder="Ex: 100kVA" />
          </div>
          <div>
            <Label className="text-xs">Frequência com Carga</Label>
            <Input value={frequencyLoad} onChange={(e: any) => setFrequencyLoad(e?.target?.value ?? "")} disabled={!canEdit} className="bg-white" placeholder="Ex: 59.8Hz" />
          </div>
        </div>
        {canEdit && (
          <Button onClick={save} disabled={saving} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />} Salvar Teste de Carga
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* Botão de opção estilo radio */
function OptionGroup({ label, value, onChange, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { v: string; l: string }[]; disabled?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-2 mt-1">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              value === o.v
                ? "bg-orange-500 border-orange-500 text-white"
                : "bg-white border-gray-300 text-gray-700 hover:border-orange-400"
            } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

/* Comments — histórico de comentários técnicos */
function CommentsSection({ orderId, comments, legacyComments, canEdit, onSaved }: {
  orderId: string; comments: any[]; legacyComments: string; canEdit: boolean; onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!text.trim()) { toast.error("Digite um comentário"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/os/${orderId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        setText(""); // limpa a caixa após enviar
        toast.success("Comentário adicionado!");
        onSaved();
      } else {
        const d = await res.json();
        toast.error(d?.error ?? "Erro ao adicionar");
      }
    } catch { toast.error("Erro"); } finally { setSaving(false); }
  };

  const remove = async (commentId: string) => {
    try {
      const res = await fetch(`/api/os/${orderId}/comments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      });
      if (res.ok) { toast.success("Comentário removido"); onSaved(); }
      else toast.error("Erro ao remover");
    } catch { toast.error("Erro"); }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Wrench className="w-4 h-4" /> Comentários Técnicos ({comments?.length ?? 0})</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Histórico */}
        {(comments?.length ?? 0) > 0 ? (
          <div className="space-y-3 mb-4">
            {(comments ?? []).map((c: any) => (
              <div key={c?.id} className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="min-w-0">
                  <p className="text-sm whitespace-pre-wrap break-words">{c?.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c?.author?.name ?? "Usuário"} • {c?.createdAt ? new Date(c.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 flex-shrink-0" onClick={() => remove(c?.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mb-4">Nenhum comentário registrado ainda.</p>
        )}

        {/* Comentário legado (texto antigo salvo no campo comments) */}
        {legacyComments && (
          <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
            <p className="text-xs font-medium text-amber-700 mb-1">Comentário anterior (registro antigo):</p>
            <p className="text-sm whitespace-pre-wrap">{legacyComments}</p>
          </div>
        )}

        {/* Nova entrada */}
        {canEdit && (
          <div className="space-y-2">
            <Textarea value={text} onChange={(e: any) => setText(e?.target?.value ?? "")} placeholder="Adicione um novo comentário..." rows={3} />
            <Button onClick={add} disabled={saving} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white">
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />} Adicionar Comentário
            </Button>
          </div>
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
