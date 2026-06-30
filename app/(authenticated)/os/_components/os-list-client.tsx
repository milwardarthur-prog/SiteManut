"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Search, Filter, Loader2, ClipboardList, ArrowRight,
  CheckCircle2, Clock, AlertTriangle, XCircle, Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export default function OSListClient() {
  const { data: session } = useSession() || {};
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const isAdmin = (session?.user as any)?.role === "ADMIN";

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, typeFilter]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      const res = await fetch(`/api/os?${params.toString()}`);
      if (res.ok) setOrders(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={statusFilter} onValueChange={(v: string) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            {Object.entries(statusLabels).map(([k, v]: [string, string]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v: string) => setTypeFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filtrar por tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Tipos</SelectItem>
            {Object.entries(typeLabels).map(([k, v]: [string, string]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                      </div>
                      <p className="text-sm text-gray-900 font-medium mt-1">
                        {order?.equipment?.name ?? ""} ({order?.equipment?.equipmentNumber ?? ""})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Técnico: {order?.technician?.name ?? "-"}
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
