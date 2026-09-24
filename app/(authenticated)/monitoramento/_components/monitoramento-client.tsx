"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Kanban, Clock, Loader2, Inbox, CircleSlash, MessageSquare, Wrench, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const typeLabels: Record<string, string> = { PREVENTIVA: "Preventiva", CORRETIVA: "Corretiva", RETRABALHO: "Retrabalho" };
const typeColors: Record<string, string> = {
  PREVENTIVA: "bg-green-100 text-green-800",
  CORRETIVA: "bg-red-100 text-red-800",
  RETRABALHO: "bg-purple-100 text-purple-800",
};
const scopeLabels: Record<string, string> = { CHECKLIST: "Checklist", TESTE_CARGA: "Teste de Carga", REVISAO: "Revisão" };
const scopeColors: Record<string, string> = {
  CHECKLIST: "bg-teal-100 text-teal-800",
  TESTE_CARGA: "bg-indigo-100 text-indigo-800",
  REVISAO: "bg-amber-100 text-amber-800",
};
const statusLabels: Record<string, string> = {
  APROVADA: "Na fila",
  EM_EXECUCAO: "Em execução",
  PAUSADA: "Pausada",
  AGUARDANDO_ENCERRAMENTO: "Aguard. encerramento",
};
const statusColors: Record<string, string> = {
  APROVADA: "bg-gray-100 text-gray-700",
  EM_EXECUCAO: "bg-green-100 text-green-800",
  PAUSADA: "bg-yellow-100 text-yellow-800",
  AGUARDANDO_ENCERRAMENTO: "bg-purple-100 text-purple-800",
};
// Ordem de prioridade visual dentro da coluna do técnico — o que está
// acontecendo agora aparece primeiro.
const STATUS_PRIORITY: Record<string, number> = { EM_EXECUCAO: 0, PAUSADA: 1, AGUARDANDO_ENCERRAMENTO: 2, APROVADA: 3 };

function fmtElapsed(startedAt: string | null): string | null {
  if (!startedAt) return null;
  const ms = Date.now() - new Date(startedAt).getTime();
  if (ms < 0) return null;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}min` : `${m}min`;
}

function fmtWaiting(createdAt: string): { text: string; urgent: boolean; veryUrgent: boolean } {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  return {
    text: days <= 0 ? "hoje" : days === 1 ? "há 1 dia" : `há ${days} dias`,
    urgent: days >= 2,
    veryUrgent: days >= 5,
  };
}

export default function MonitoramentoClient() {
  const { data: session, status: sessionStatus } = useSession() || {};
  const router = useRouter();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const [orders, setOrders] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const draggingRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    if (sessionStatus === "authenticated" && !isAdmin) {
      router.replace("/os");
    }
  }, [sessionStatus, isAdmin, router]);

  const fetchData = useCallback(async (silent = false) => {
    // Não atropela um drag em andamento com um refresh automático.
    if (draggingRef.current) return;
    if (!silent) setLoading(true);
    try {
      const [ordersRes, techRes] = await Promise.all([
        fetch("/api/os?tab=monitor"),
        fetch("/api/users/technicians"),
      ]);
      if (ordersRes.ok) setOrders(await ordersRes.json());
      if (techRes.ok) setTechnicians(await techRes.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const assign = async (orderId: string, technicianId: string | null) => {
    try {
      const res = await fetch(`/api/os/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianId: technicianId ?? "" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Erro ao atribuir");
        return;
      }
      toast.success(technicianId ? "Técnico atribuído." : "Voltou pro Backlog.");
      fetchData(true);
    } catch {
      toast.error("Falha de conexão.");
    }
  };

  const onCardDragStart = (e: React.DragEvent, orderId: string) => {
    draggingRef.current = true;
    e.dataTransfer.setData("text/plain", orderId);
    e.dataTransfer.effectAllowed = "move";
  };
  const onCardDragEnd = () => {
    draggingRef.current = false;
    setDragOverKey(null);
  };
  const openSummary = async (orderId: string) => {
    setSelectedId(orderId);
    setSummary(null);
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/os/${orderId}`);
      if (res.ok) setSummary(await res.json());
    } catch {
      /* ignore */
    } finally {
      setSummaryLoading(false);
    }
  };

  const onColumnDrop = (e: React.DragEvent, technicianId: string | null) => {
    e.preventDefault();
    const orderId = e.dataTransfer.getData("text/plain");
    setDragOverKey(null);
    draggingRef.current = false;
    if (!orderId) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order || (order.technicianId ?? null) === technicianId) return; // já está aí
    assign(orderId, technicianId);
  };

  if (sessionStatus === "loading" || (loading && orders.length === 0 && technicians.length === 0)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (sessionStatus === "authenticated" && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <CircleSlash className="w-10 h-10 text-gray-400 mb-3" />
        <h2 className="text-lg font-semibold text-gray-800">Acesso restrito</h2>
      </div>
    );
  }

  const backlog = orders
    .filter((o) => !o.technicianId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Kanban className="w-6 h-6 text-orange-500" /> Monitoramento
          </h1>
          <p className="text-sm text-muted-foreground">
            Arraste um card do Backlog para a coluna de um técnico para atribuir a atividade a ele. Atualiza a cada 30s.
          </p>
        </div>
        {isAdmin && (
          <Link href="/os/nova">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="w-4 h-4 mr-2" /> Nova OS
            </Button>
          </Link>
        )}
      </div>

      {/* Backlog — OS sem técnico designado */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-2 text-sm flex items-center gap-2">
          <Inbox className="w-4 h-4" /> Backlog ({backlog.length})
        </h3>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOverKey("backlog"); }}
          onDragLeave={() => setDragOverKey((k) => (k === "backlog" ? null : k))}
          onDrop={(e) => onColumnDrop(e, null)}
          className={`rounded-xl border-2 p-3 min-h-[92px] transition-colors ${
            dragOverKey === "backlog" ? "border-orange-400 bg-orange-50" : "border-dashed border-gray-300 bg-gray-50/60"
          }`}
        >
          {backlog.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhuma OS esperando técnico.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {backlog.map((o) => (
                <OrderCard key={o.id} order={o} onDragStart={onCardDragStart} onDragEnd={onCardDragEnd} onClick={openSummary} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Colunas — uma por técnico cadastrado */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-2 text-sm">Técnicos</h3>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {technicians.map((t) => {
            const techOrders = orders
              .filter((o) => o.technicianId === t.id)
              .sort((a, b) => (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9));
            const key = `tech-${t.id}`;
            return (
              <div
                key={t.id}
                onDragOver={(e) => { e.preventDefault(); setDragOverKey(key); }}
                onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                onDrop={(e) => onColumnDrop(e, t.id)}
                className={`shrink-0 w-64 rounded-xl border-2 p-3 space-y-2 min-h-[160px] transition-colors ${
                  dragOverKey === key ? "border-orange-400 bg-orange-50" : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800 truncate">{t.name}</p>
                  <span className="text-xs text-gray-400 shrink-0">{techOrders.length}</span>
                </div>
                {techOrders.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">Ocioso — sem OS ativa</p>
                ) : (
                  <div className="space-y-2">
                    {techOrders.map((o) => (
                      <OrderCard key={o.id} order={o} onDragStart={onCardDragStart} onDragEnd={onCardDragEnd} onClick={openSummary} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {technicians.length === 0 && (
            <p className="text-sm text-gray-400 py-6">Nenhum técnico cadastrado.</p>
          )}
        </div>
      </div>

      {/* Resumo da OS — aberto ao clicar num card */}
      <Dialog open={!!selectedId} onOpenChange={(o: boolean) => !o && setSelectedId(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {summary ? `OS #${summary.orderNumber} — ${summary.equipment?.equipmentNumber ?? ""}` : "Resumo da OS"}
            </DialogTitle>
          </DialogHeader>
          {summaryLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : summary ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Início da atividade
                </p>
                <p className="text-sm text-gray-900">
                  {summary.startedAt ? new Date(summary.startedAt).toLocaleString("pt-BR") : "Ainda não iniciada"}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Instruções do Gestor
                </p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">
                  {summary.adminNotes || "Nenhuma instrução registrada."}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5" /> Comentários Técnicos
                </p>
                {(summary.technicalComments?.length ?? 0) > 0 ? (
                  <div className="space-y-2">
                    {summary.technicalComments.map((c: any) => (
                      <div key={c.id} className="text-sm bg-gray-50 rounded-md p-2">
                        <p className="text-gray-900 whitespace-pre-wrap">{c.content}</p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          {c.author?.name ?? ""} · {new Date(c.createdAt).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : summary.comments ? (
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{summary.comments}</p>
                ) : (
                  <p className="text-sm text-gray-400">Nenhum comentário registrado.</p>
                )}
              </div>

              <Link
                href={`/os/${summary.id}`}
                className="text-sm text-orange-600 hover:underline inline-block pt-1"
              >
                Ver OS completa →
              </Link>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderCard({
  order,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  order: any;
  onDragStart: (e: React.DragEvent, orderId: string) => void;
  onDragEnd: () => void;
  onClick: (orderId: string) => void;
}) {
  const elapsed = order.status === "EM_EXECUCAO" ? fmtElapsed(order.startedAt) : null;
  const waiting = !order.technicianId ? fmtWaiting(order.createdAt) : null;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, order.id)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(order.id)}
      className="shrink-0 w-56 rounded-lg border bg-white p-2.5 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing space-y-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-900">#{order.orderNumber}</span>
        <span className="text-xs text-gray-500 truncate">{order.equipment?.equipmentNumber}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeColors[order.maintenanceType] ?? "bg-gray-100 text-gray-700"}`}>
          {typeLabels[order.maintenanceType] ?? order.maintenanceType}
        </span>
        {order.scope !== "NORMAL" && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${scopeColors[order.scope] ?? "bg-gray-100 text-gray-700"}`}>
            {scopeLabels[order.scope] ?? order.scope}
          </span>
        )}
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[order.status] ?? "bg-gray-100 text-gray-700"}`}>
          {statusLabels[order.status] ?? order.status}
        </span>
      </div>
      {elapsed && (
        <p className="text-[11px] text-green-700 flex items-center gap-1">
          <Clock className="w-3 h-3" /> {elapsed}
        </p>
      )}
      {waiting && (
        <p className={`text-[11px] flex items-center gap-1 ${waiting.veryUrgent ? "text-red-600 font-medium" : waiting.urgent ? "text-amber-600" : "text-gray-400"}`}>
          <Clock className="w-3 h-3" /> Esperando {waiting.text}
        </p>
      )}
    </div>
  );
}
