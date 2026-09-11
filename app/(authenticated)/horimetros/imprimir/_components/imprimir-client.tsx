"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Printer, CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FREQUENCY_LABELS } from "@/lib/horimetro";

type Row = {
  id: string;
  equipmentNumber: string;
  currentHorimeter: number;
  readingFrequency: "SEMANAL" | "QUINZENAL" | "MENSAL";
  lastReadingDate: string | null;
  nextReadingDate: string | null;
  leaseStatus: "DISPONIVEL" | "LOCADO" | "MANUTENCAO";
  currentClient: string | null;
  pendingStatus: "EM_DIA" | "ATRASADO" | "SEM_LEITURA";
  daysLate: number;
  needsSchedule: boolean;
};

const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function PrintSection({
  title,
  rows,
  showClient = false,
  pageBreak = false,
}: {
  title: string;
  rows: Row[];
  showClient?: boolean;
  pageBreak?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className={pageBreak ? "print:break-before-page" : ""}>
      <h2 className="text-base font-bold text-gray-900 mt-6 mb-2 first:mt-0">
        {title} <span className="font-normal text-gray-500">({rows.length})</span>
      </h2>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="border-b-2 border-gray-800 text-left">
            <th className="py-2 pr-2">#</th>
            <th className="py-2 pr-2">Equipamento</th>
            {showClient && <th className="py-2 pr-2">Cliente</th>}
            <th className="py-2 pr-2">Última leitura</th>
            <th className="py-2 pr-2 text-right">Horímetro anterior</th>
            <th className="py-2 pr-2">Horímetro atual (coletar)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-b border-gray-300">
              <td className="py-2.5 pr-2 text-gray-500">{i + 1}</td>
              <td className="py-2.5 pr-2 font-medium">{r.equipmentNumber}</td>
              {showClient && <td className="py-2.5 pr-2">{r.currentClient || "—"}</td>}
              <td className="py-2.5 pr-2">{fmtDate(r.lastReadingDate)}</td>
              <td className="py-2.5 pr-2 text-right">{fmtNum(r.currentHorimeter)}</td>
              <td className="py-2.5 pr-2 text-gray-400">______________</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ImprimirClient() {
  const sp = useSearchParams();
  const { data: session, status } = useSession() || {};
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const cliente = sp?.get("cliente") ?? "";
  const freq = sp?.get("freq") ?? "";
  const situacao = sp?.get("situacao") ?? "pendentes";

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "authenticated") return;
    (async () => {
      try {
        const res = await fetch("/api/horimetros");
        if (res.ok) setRows((await res.json()).rows ?? []);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, [status]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (cliente && r.currentClient !== cliente) return false;
      if (freq && r.readingFrequency !== freq) return false;
      if (situacao === "pendentes" && !["ATRASADO", "SEM_LEITURA"].includes(r.pendingStatus)) return false;
      if (situacao === "atrasados" && r.pendingStatus !== "ATRASADO") return false;
      if (situacao === "agendar_manutencao" && !r.needsSchedule) return false;
      if (situacao === "locados" && r.leaseStatus !== "LOCADO") return false;
      if (situacao === "disponiveis" && r.leaseStatus !== "DISPONIVEL") return false;
      if (situacao === "manutencao" && r.leaseStatus !== "MANUTENCAO") return false;
      return true;
    });
  }, [rows, cliente, freq, situacao]);

  const locados = useMemo(() => filtered.filter((r) => r.leaseStatus === "LOCADO"), [filtered]);
  const disponiveis = useMemo(() => filtered.filter((r) => r.leaseStatus === "DISPONIVEL"), [filtered]);
  const emManutencao = useMemo(() => filtered.filter((r) => r.leaseStatus === "MANUTENCAO"), [filtered]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (status === "authenticated" && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <CircleSlash className="w-10 h-10 text-gray-400 mb-3" />
        <h2 className="text-lg font-semibold text-gray-800">Acesso restrito</h2>
      </div>
    );
  }

  const situacaoLabel: Record<string, string> = {
    pendentes: "Pendentes",
    atrasados: "Atrasados",
    agendar_manutencao: "Agendar manutenção",
    locados: "Locados",
    disponiveis: "Disponíveis",
    manutencao: "Em manutenção",
    todos: "Todos",
  };

  return (
    <div className="p-4 print:p-0">
      {/* Botão fica oculto na impressão */}
      <div className="flex justify-end mb-4 print:hidden">
        <Button onClick={() => window.print()} className="gap-2 bg-orange-500 hover:bg-orange-600">
          <Printer className="w-4 h-4" /> Imprimir
        </Button>
      </div>

      <div className="print-area">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900">Lista de Coleta de Horímetros</h1>
          <div className="text-sm text-gray-600 mt-1 flex flex-wrap gap-x-6 gap-y-1">
            <span>Emitido em: {new Date().toLocaleDateString("pt-BR")}</span>
            <span>Situação: {situacaoLabel[situacao] ?? situacao}</span>
            {cliente && <span>Cliente/Local: {cliente}</span>}
            {freq && <span>Frequência: {FREQUENCY_LABELS[freq as keyof typeof FREQUENCY_LABELS]}</span>}
            <span>Total: {filtered.length}</span>
          </div>
          <div className="text-sm text-gray-700 mt-3 flex gap-8">
            <span>Operador: ______________________________</span>
            <span>Assinatura: ______________________________</span>
          </div>
        </div>

        <PrintSection title="Locados" rows={locados} showClient />
        <PrintSection title="Disponíveis" rows={disponiveis} pageBreak={locados.length > 0} />
        <PrintSection title="Em Manutenção" rows={emManutencao} pageBreak={locados.length > 0 || disponiveis.length > 0} />

        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-8">Nenhum equipamento para os filtros selecionados.</p>
        )}
      </div>

      <style jsx global>{`
        @media print {
          nav, aside, header, .print\\:hidden { display: none !important; }
          body { background: #fff !important; }
          .print-area { width: 100%; }
          @page { margin: 12mm; }
        }
      `}</style>
    </div>
  );
}
