"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import dynamic from "next/dynamic";

const DashboardCharts = dynamic(() => import("./dashboard-charts"), { ssr: false, loading: () => <div className="h-64 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div> });

export default function DashboardClient() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "authenticated" && (session?.user as any)?.role !== "ADMIN") {
      router.replace("/os");
      return;
    }
    fetchStats();
  }, [status]);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/os/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  const finalizadas = stats?.statusCounts?.FINALIZADA ?? 0;
  const emExecucao = stats?.statusCounts?.EM_EXECUCAO ?? 0;
  const pendentes = stats?.statusCounts?.PENDENTE_APROVACAO ?? 0;
  const aguardando = stats?.statusCounts?.AGUARDANDO_ENCERRAMENTO ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral do sistema de manutenção</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total de OS" value={stats?.totalOrders ?? 0} icon={<ClipboardList className="w-5 h-5" />} color="bg-blue-500" />
        <StatCard title="Pendentes" value={pendentes + aguardando} icon={<AlertTriangle className="w-5 h-5" />} color="bg-amber-500" />
        <StatCard title="Em Execução" value={emExecucao} icon={<Clock className="w-5 h-5" />} color="bg-orange-500" />
        <StatCard title="Finalizadas" value={finalizadas} icon={<CheckCircle2 className="w-5 h-5" />} color="bg-green-500" />
      </div>
      {stats && <DashboardCharts stats={stats} />}
    </div>
  );
}

function StatCard({ title, value, icon, color }: { title: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <Card className="border-0 shadow-md">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
            <p className="text-3xl font-bold mt-1 font-mono">{value}</p>
          </div>
          <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center text-white`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
