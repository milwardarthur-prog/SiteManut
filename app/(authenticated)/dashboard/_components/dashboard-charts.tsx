"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = ["#60B5FF", "#FF9149", "#FF9898", "#FF90BB", "#80D8C3", "#A19AD3", "#72BF78", "#FF6363"];
const statusLabels: Record<string, string> = { PENDENTE_APROVACAO: "Pendente", APROVADA: "Aprovada", EM_EXECUCAO: "Em Exec.", AGUARDANDO_ENCERRAMENTO: "Aguard. Enc.", FINALIZADA: "Finalizada", REJEITADA: "Rejeitada" };
const typeLabels: Record<string, string> = { PREVENTIVA: "Preventiva", CORRETIVA: "Corretiva", RETRABALHO: "Retrabalho" };

const fmtPrice = (n: number) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function DashboardCharts({ stats }: { stats: any }) {
  const statusData = Object.entries(stats?.statusCounts ?? {}).map(([k, v]: [string, any]) => ({ name: statusLabels[k] ?? k, value: v ?? 0 }));
  const typeData = Object.entries(stats?.typeCounts ?? {}).map(([k, v]: [string, any]) => ({ name: typeLabels[k] ?? k, value: v ?? 0 }));
  const avgTimeData = (stats?.avgTimeByType ?? []).map((t: any) => ({ name: typeLabels[t?.type] ?? t?.type ?? "", min: t?.avgMinutes ?? 0 }));
  const techData = (stats?.techProductivity ?? []).map((t: any) => ({ name: t?.name ?? "", os: t?.count ?? 0, min: t?.avgMinutes ?? 0 }));
  const helperData = (stats?.topHelpers ?? []).map((h: any) => ({ name: h?.name ?? "", qty: h?.count ?? 0 }));
  const partsData = (stats?.topParts ?? []).map((p: any) => ({ name: p?.description ?? "", qty: p?.total ?? 0 }));

  const costs = stats?.costs ?? {};
  const avgCostData = (costs?.avgCostByType ?? []).map((t: any) => ({ name: typeLabels[t?.type] ?? t?.type ?? "", cost: t?.avgCost ?? 0 }));
  const costByMonthData = (costs?.costByMonth ?? []).map((m: any) => ({ name: m?.label ?? "", cost: m?.cost ?? 0 }));
  const equipmentCostData = (costs?.topEquipmentCost ?? []).map((e: any) => ({ name: e?.equipmentNumber ?? "", cost: e?.cost ?? 0 }));

  return (
    <div className="space-y-6">
      {/* Custos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <CostStat label="Custo Total" value={fmtPrice(costs?.totalCost)} />
        <CostStat label="Peças" value={fmtPrice(costs?.totalPartsCost)} />
        <CostStat label="Revisão (óleo+filtros)" value={fmtPrice(costs?.totalRevisionCost)} />
        <CostStat
          label="Retrabalho"
          value={fmtPrice(costs?.reworkCost)}
          hint={costs?.totalCost > 0 ? `${(costs?.reworkPercent ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total` : undefined}
          color="text-red-600"
        />
        <CostStat
          label="Óleo 15W40"
          value={`${(costs?.oil?.liters ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`}
          hint={fmtPrice(costs?.oil?.cost)}
        />
        <CostStat
          label="Combustível (Deslocamento)"
          value={fmtPrice(costs?.travel?.cost)}
          hint={`${(costs?.travel?.km ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Custo Total por Mês">
          {costByMonthData?.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costByMonthData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                <XAxis dataKey="name" tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => fmtPrice(v)} />
                <Bar dataKey="cost" name="Custo" fill="#FF6363" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyMsg />}
        </ChartCard>

        <ChartCard title="Custo Médio por OS (por Tipo)">
          {avgCostData?.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={avgCostData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                <XAxis dataKey="name" tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => fmtPrice(v)} />
                <Bar dataKey="cost" name="Custo médio" fill="#FF9149" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyMsg />}
        </ChartCard>

        <ChartCard title="Equipamentos com Maior Custo">
          {equipmentCostData?.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={equipmentCostData} layout="vertical" margin={{ top: 10, right: 10, bottom: 10, left: 80 }}>
                <XAxis type="number" tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tickLine={false} tick={{ fontSize: 10 }} width={70} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => fmtPrice(v)} />
                <Bar dataKey="cost" name="Custo" fill="#60B5FF" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyMsg />}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartCard title="Distribuição por Status">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
              {statusData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Distribuição por Tipo">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={typeData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
              {typeData.map((_: any, i: number) => <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Tempo Médio por Tipo (min)">
        {avgTimeData?.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={avgTimeData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
              <XAxis dataKey="name" tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis tickLine={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="min" fill="#FF9149" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyMsg />}
      </ChartCard>

      <ChartCard title="Produtividade por Técnico">
        {techData?.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={techData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
              <XAxis dataKey="name" tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis tickLine={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="os" name="OS Finalizadas" fill="#60B5FF" radius={[4, 4, 0, 0]} />
              <Bar dataKey="min" name="Tempo Méd. (min)" fill="#80D8C3" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyMsg />}
      </ChartCard>

      <ChartCard title="Ajudantes Mais Utilizados">
        {helperData?.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={helperData} layout="vertical" margin={{ top: 10, right: 10, bottom: 10, left: 80 }}>
              <XAxis type="number" tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tickLine={false} tick={{ fontSize: 10 }} width={70} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="qty" name="Participações" fill="#A19AD3" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyMsg />}
      </ChartCard>

      <ChartCard title="Peças Mais Utilizadas">
        {partsData?.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={partsData} layout="vertical" margin={{ top: 10, right: 10, bottom: 10, left: 100 }}>
              <XAxis type="number" tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tickLine={false} tick={{ fontSize: 10 }} width={90} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="qty" name="Quantidade" fill="#72BF78" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyMsg />}
      </ChartCard>
      </div>
    </div>
  );
}

function CostStat({ label, value, hint, color = "text-gray-900" }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold font-mono mt-1 ${color}`}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent><div className="h-64">{children}</div></CardContent>
    </Card>
  );
}

function EmptyMsg() {
  return <p className="text-sm text-muted-foreground text-center pt-20">Sem dados disponíveis</p>;
}
