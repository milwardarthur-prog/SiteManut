"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Loader2, ClipboardList, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

// Tabs seguem o fluxo de status atual
const TABS: { key: string; label: string }[] = [
  { key: "sem_tecnico", label: "Abertas sem técnico" },
  { key: "com_tecnico", label: "Abertas com técnico" },
  { key: "pendente", label: "Pendente de Aprovação" },
  { key: "aprovada", label: "Aprovada" },
  { key: "em_execucao", label: "Em Execução" },
  { key: "aguardando", label: "Aguardando Encerramento" },
  { key: "finalizadas", label: "Finalizadas" },
  { key: "rejeitadas", label: "Rejeitadas/Excluídas" },
];

export default function OSListClient() {
  const { data: session } = useSession() || {};
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("sem_tecnico");
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [equipmentFilter, setEquipmentFilter] = useState("");
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [equipments, setEquipments] = useState<any[]>([]);

  const isAdmin = (session?.user as any)?.role === "ADMIN";

  useEffect(() => {
    // Carrega listas de filtro uma vez
    (async () => {
      try {
        const [tRes, eRes] = await Promise.all([
          fetch("/api/users/technicians"),
          fetch("/api/equipamentos"),
        ]);
        if (tRes.ok) setTechnicians(await tRes.json());
        if (eRes.ok) setEquipments(await eRes.json());
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [activeTab, technicianFilter, equipmentFilter]);

  useEffect(() => {
    fetchCounts();
  }, [technicianFilter, equipmentFilter]);

  const buildParams = (tab: string) => {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (technicianFilter) params.set("technicianId", technicianFilter);
    if (equipmentFilter) params.set("equipmentId", equipmentFilter);
    return params;
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/os?${buildParams(activeTab).toString()}`);
      if (res.ok) setOrders(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  const fetchCounts = async () => {
    try {
      const results = await Promise.all(
        TABS.map(async (t) => {
          const res = await fetch(`/api/os?${buildParams(t.key).toString()}`);
          const data = res.ok ? await res.json() : [];
          return [t.key, Array.isArray(data) ? data.length : 0] as [string, number];
        })
      );
      setCounts(Object.fromEntries(results));
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900">
            Ordens de Serviço
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin ? "Gerencie todas as OS do sistema" : "Suas ordens de serviço atribuídas"}
          </p>
        </div>
        <Link href="/os/nova">
          <Button className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4 mr-2" /> Nova OS
          </Button>
        </Link>
      </div>

      {/* Filters: técnico e equipamento */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={technicianFilter || "all"} onValueChange={(v: string) => setTechnicianFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Filtrar por técnico" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Técnicos</SelectItem>
            {(technicians ?? []).map((t: any) => (
              <SelectItem key={t?.id} value={t?.id}>{t?.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={equipmentFilter || "all"} onValueChange={(v: string) => setEquipmentFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Filtrar por equipamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Equipamentos</SelectItem>
            {(equipments ?? []).map((e: any) => (
              <SelectItem key={e?.id} value={e?.id}>
                {e?.name} ({e?.equipmentNumber})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs por status */}
      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-md transition-colors border-b-2 ${
              activeTab === t.key
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-muted-foreground hover:text-gray-900"
            }`}
          >
            {t.label}
            {counts[t.key] != null && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === t.key ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"
              }`}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : (orders?.length ?? 0) === 0 ? (
        <Card className="border-0 shadow-md">
          <CardContent className="py-12 text-center">
            <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma ordem de serviço encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(orders ?? []).map((order: any) => (
            <Card
              key={order?.id}
              className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push(`/os/${order?.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="font-mono text-sm font-bold text-orange-600">#{order?.orderNumber ?? 0}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[order?.status] ?? "bg-gray-100 text-gray-800"}`}>
                          {statusLabels[order?.status] ?? order?.status}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                          {typeLabels[order?.maintenanceType] ?? order?.maintenanceType}
                        </span>
                        {order?.scope && order.scope !== "NORMAL" && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${scopeColors[order?.scope] ?? "bg-gray-100 text-gray-700"}`}>
                            {scopeLabels[order?.scope] ?? order?.scope}
                          </span>
                        )}
                        {order?.deletedAt && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">
                            Excluída
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-900 font-medium mt-1">
                        {order?.equipment?.name ?? ""} ({order?.equipment?.equipmentNumber ?? ""})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Técnico: {order?.technician?.name ?? "Sem técnico"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {order?.createdAt ? new Date(order.createdAt).toLocaleDateString("pt-BR") : "-"}
                      </p>
                      {order?.totalTimeMinutes != null && (
                        <p className="text-xs text-muted-foreground">
                          {Math.floor((order.totalTimeMinutes ?? 0) / 60)}h{String((order.totalTimeMinutes ?? 0) % 60).padStart(2, "0")}m
                        </p>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
