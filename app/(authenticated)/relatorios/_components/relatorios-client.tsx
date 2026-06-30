"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Calendar, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import dynamic from "next/dynamic";

const DashboardCharts = dynamic(
  () => import("../../dashboard/_components/dashboard-charts"),
  { ssr: false, loading: () => <div className="h-64 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div> }
);

export default function RelatoriosClient() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (status === "authenticated" && (session?.user as any)?.role !== "ADMIN") {
      router.replace("/os");
    }
  }, [status]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/os/stats?${params.toString()}`);
      if (res.ok) setStats(await res.json());
    } catch {} finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900">Relatórios</h1>
        <p className="text-sm text-muted-foreground mt-1">Análise detalhada com filtros por período</p>
      </div>
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Calendar className="w-4 h-4" /> Filtrar por Período</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Data Inicial</Label>
              <Input type="date" value={startDate} onChange={(e: any) => setStartDate(e?.target?.value ?? "")} />
            </div>
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Data Final</Label>
              <Input type="date" value={endDate} onChange={(e: any) => setEndDate(e?.target?.value ?? "")} />
            </div>
            <Button onClick={fetchStats} disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-white">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <BarChart3 className="w-4 h-4 mr-1" />}
              Gerar Relatório
            </Button>
          </div>
        </CardContent>
      </Card>
      {stats ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MiniStat label="Total OS" value={stats?.totalOrders ?? 0} />
            <MiniStat label="Finalizadas" value={stats?.statusCounts?.FINALIZADA ?? 0} />
            <MiniStat label="Em Execução" value={stats?.statusCounts?.EM_EXECUCAO ?? 0} />
            <MiniStat label="Pendentes" value={stats?.statusCounts?.PENDENTE_APROVACAO ?? 0} />
          </div>
          <DashboardCharts stats={stats} />
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>Selecione um período e clique em &quot;Gerar Relatório&quot;</p>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-0 shadow-sm"><CardContent className="p-4 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold font-mono mt-1">{value}</p>
    </CardContent></Card>
  );
}
