"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Inbox, User, Clock, Loader2, Play, Pause, StopCircle, HandMetal, History, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import PushNotificationButton from "@/components/push-notification-button";
import InstallAppButton from "@/components/install-app-button";
import { toast } from "sonner";

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
  AGUARDANDO_ENCERRAMENTO: "Aguard. gestor",
  FINALIZADA: "Finalizada",
  REJEITADA: "Rejeitada",
};
const statusColors: Record<string, string> = {
  APROVADA: "bg-gray-100 text-gray-700",
  EM_EXECUCAO: "bg-green-100 text-green-800",
  PAUSADA: "bg-yellow-100 text-yellow-800",
  AGUARDANDO_ENCERRAMENTO: "bg-purple-100 text-purple-800",
  FINALIZADA: "bg-green-100 text-green-800",
  REJEITADA: "bg-red-100 text-red-800",
};
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

export default function OSTechBoard() {
  const { data: session } = useSession() || {};
  const router = useRouter();
  const userId = (session?.user as any)?.id;
  const userName = (session?.user as any)?.name ?? "Minhas OS";

  const [view, setView] = useState<"quadro" | "historico">("quadro");
  const [backlog, setBacklog] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const actionInFlight = useRef(false);

  const fetchBoard = useCallback(async (silent = false) => {
    if (actionInFlight.current) return;
    if (!silent) setLoading(true);
    try {
      const [backlogRes, mineRes] = await Promise.all([
        fetch("/api/os?tab=sem_tecnico"),
        fetch("/api/os?tab=meu_ativo"),
      ]);
      if (backlogRes.ok) setBacklog(await backlogRes.json());
      if (mineRes.ok) setMine(await mineRes.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoard();
    const interval = setInterval(() => fetchBoard(true), 30000);
    return () => clearInterval(interval);
  }, [fetchBoard]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const [finRes, rejRes] = await Promise.all([
        fetch("/api/os?tab=finalizadas"),
        fetch("/api/os?tab=rejeitadas"),
      ]);
      const fin = finRes.ok ? await finRes.json() : [];
      const rej = rejRes.ok ? await rejRes.json() : [];
      const merged = [...fin, ...rej].sort(
        (a, b) => new Date(b.closedAt ?? b.createdAt).getTime() - new Date(a.closedAt ?? a.createdAt).getTime()
      );
      setHistory(merged);
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "historico" && history.length === 0) fetchHistory();
  }, [view, history.length, fetchHistory]);

  const doAction = async (orderId: string, action: string, successMsg: string) => {
    setBusyId(orderId);
    actionInFlight.current = true;
    let ok = false;
    try {
      const res = await fetch(`/api/os/${orderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Erro ao atualizar");
        return;
      }
      toast.success(successMsg);
      ok = true;
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setBusyId(null);
      // Só solta a trava depois — senão o próprio guard de fetchBoard bloqueia
      // essa atualização imediata (feita abaixo) e o quadro só reflete a ação
      // no próximo poll automático (até 30s depois).
      actionInFlight.current = false;
    }
    if (ok) await fetchBoard(true);
  };

  const sortedMine = [...mine].sort((a, b) => (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9));
  const sortedBacklog = [...backlog].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Instalar app / ativar notificações — cada um some sozinho quando não se aplica */}
      <div className="flex flex-wrap gap-2">
        <InstallAppButton />
        <PushNotificationButton />
      </div>

      {/* Alternância Quadro / Histórico — botões largos, fáceis de tocar no celular */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:w-fit">
        <button
          onClick={() => setView("quadro")}
          className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
            view === "quadro" ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-700 border-gray-300 active:bg-gray-50"
          }`}
        >
          <LayoutGrid className="w-4 h-4" /> Quadro
        </button>
        <button
          onClick={() => setView("historico")}
          className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
            view === "historico" ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-700 border-gray-300 active:bg-gray-50"
          }`}
        >
          <History className="w-4 h-4" /> Histórico
        </button>
      </div>

      {view === "quadro" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Minhas OS — no celular aparece primeiro: é o que o técnico quer ver ao abrir o app */}
          <div className="order-1 lg:order-2">
            <h3 className="font-semibold text-gray-800 mb-2 text-[15px] flex items-center gap-2">
              <User className="w-4 h-4" /> {userName} ({sortedMine.length})
            </h3>
            <p className="text-xs text-muted-foreground mb-2">OS já designadas a você.</p>
            <div className="rounded-xl border-2 border-gray-200 bg-white p-3 space-y-3 min-h-[100px]">
              {sortedMine.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhuma OS ativa atribuída a você.</p>
              ) : (
                sortedMine.map((o) => (
                  <TechCard
                    key={o.id}
                    order={o}
                    busy={busyId === o.id}
                    onOpen={() => router.push(`/os/${o.id}`)}
                    actions={<MineActions order={o} busy={busyId === o.id} onAction={doAction} />}
                  />
                ))
              )}
            </div>
          </div>

          {/* Backlog geral */}
          <div className="order-2 lg:order-1">
            <h3 className="font-semibold text-gray-800 mb-2 text-[15px] flex items-center gap-2">
              <Inbox className="w-4 h-4" /> Backlog ({sortedBacklog.length})
            </h3>
            <p className="text-xs text-muted-foreground mb-2">OS disponíveis — de qualquer técnico, primeiro a pegar.</p>
            <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/60 p-3 space-y-3 min-h-[100px]">
              {sortedBacklog.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhuma OS disponível agora.</p>
              ) : (
                sortedBacklog.map((o) => (
                  <TechCard
                    key={o.id}
                    order={o}
                    waiting
                    busy={busyId === o.id}
                    onOpen={() => router.push(`/os/${o.id}`)}
                    actions={
                      <Button
                        className="w-full h-10 text-sm gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white"
                        disabled={busyId === o.id}
                        onClick={(e) => { e.stopPropagation(); doAction(o.id, "claim", `${`#${o.orderNumber}`} pegada e iniciada!`); }}
                      >
                        {busyId === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <HandMetal className="w-4 h-4" />} Pegar e Iniciar
                      </Button>
                    }
                  />
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {historyLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma OS finalizada ou rejeitada ainda.</p>
          ) : (
            history.map((o) => (
              <div
                key={o.id}
                onClick={() => router.push(`/os/${o.id}`)}
                className="flex items-center justify-between gap-3 p-3.5 rounded-xl border bg-white active:bg-gray-50 hover:shadow-sm cursor-pointer transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-[15px] font-semibold text-gray-900">#{o.orderNumber}</span>
                    {o.deletedAt ? (
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-800">Excluída</span>
                    ) : (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColors[o.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {statusLabels[o.status] ?? o.status}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {o.equipment ? `${o.equipment?.equipmentNumber} — ${o.equipment?.name}` : o.customEquipmentLabel ?? ""}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(o.closedAt ?? o.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function MineActions({ order, busy, onAction }: { order: any; busy: boolean; onAction: (id: string, action: string, msg: string) => void }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  if (order.status === "APROVADA") {
    return (
      <Button className="w-full h-11 text-sm gap-1.5 bg-orange-500 hover:bg-orange-600 text-white" disabled={busy}
        onClick={(e) => { stop(e); onAction(order.id, "start", `#${order.orderNumber} iniciada!`); }}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Iniciar
      </Button>
    );
  }
  if (order.status === "EM_EXECUCAO") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11 text-sm gap-1.5" disabled={busy}
          onClick={(e) => { stop(e); onAction(order.id, "pause", `#${order.orderNumber} pausada.`); }}>
          <Pause className="w-4 h-4" /> Pausar
        </Button>
        <Button className="h-11 text-sm gap-1.5 bg-purple-600 hover:bg-purple-700 text-white" disabled={busy}
          onClick={(e) => { stop(e); onAction(order.id, "tech_close", `#${order.orderNumber} encerrada — aguardando gestor.`); }}>
          <StopCircle className="w-4 h-4" /> Encerrar
        </Button>
      </div>
    );
  }
  if (order.status === "PAUSADA") {
    return (
      <Button className="w-full h-11 text-sm gap-1.5 bg-orange-500 hover:bg-orange-600 text-white" disabled={busy}
        onClick={(e) => { stop(e); onAction(order.id, "resume", `#${order.orderNumber} retomada!`); }}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Retomar
      </Button>
    );
  }
  return (
    <p className="text-xs text-purple-700 bg-purple-50 rounded-lg px-3 py-2.5 text-center font-medium">
      Aguardando o gestor encerrar
    </p>
  );
}

function TechCard({
  order,
  waiting,
  busy,
  onOpen,
  actions,
}: {
  order: any;
  waiting?: boolean;
  busy?: boolean;
  onOpen: () => void;
  actions: React.ReactNode;
}) {
  const elapsed = order.status === "EM_EXECUCAO" ? fmtElapsed(order.startedAt) : null;
  const wait = waiting ? fmtWaiting(order.createdAt) : null;

  return (
    <div
      onClick={onOpen}
      className={`rounded-xl border bg-white p-3.5 shadow-sm active:bg-gray-50 hover:shadow-md transition-colors cursor-pointer space-y-2.5 ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold text-gray-900">#{order.orderNumber}</p>
          <p className="text-sm text-gray-500 truncate">
            {order.equipment
              ? `${order.equipment?.equipmentNumber}${order.equipment?.name ? ` — ${order.equipment.name}` : ""}`
              : order.customEquipmentLabel ?? ""}
          </p>
        </div>
        <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${statusColors[order.status] ?? "bg-gray-100 text-gray-700"}`}>
          {statusLabels[order.status] ?? order.status}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[order.maintenanceType] ?? "bg-gray-100 text-gray-700"}`}>
          {typeLabels[order.maintenanceType] ?? order.maintenanceType}
        </span>
        {order.scope !== "NORMAL" && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${scopeColors[order.scope] ?? "bg-gray-100 text-gray-700"}`}>
            {scopeLabels[order.scope] ?? order.scope}
          </span>
        )}
      </div>
      {elapsed && (
        <p className="text-xs text-green-700 flex items-center gap-1.5 font-medium"><Clock className="w-3.5 h-3.5" /> {elapsed}</p>
      )}
      {wait && (
        <p className={`text-xs flex items-center gap-1.5 ${wait.veryUrgent ? "text-red-600 font-semibold" : wait.urgent ? "text-amber-600 font-medium" : "text-gray-400"}`}>
          <Clock className="w-3.5 h-3.5" /> Esperando {wait.text}
        </p>
      )}
      <div onClick={(e) => e.stopPropagation()} className="pt-0.5">{actions}</div>
    </div>
  );
}
