"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Gauge,
  Loader2,
  Printer,
  Upload,
  AlertTriangle,
  Clock,
  CalendarClock,
  CircleSlash,
  Save,
  MapPin,
  Settings2,
  CheckCircle2,
  FileWarning,
  ClipboardList,
  Trash2,
  MapPinPlus,
  X as XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { FREQUENCY_LABELS } from "@/lib/horimetro";

// ─── Tipos ──────────────────────────────────────────────────────────────────
type Consumption = {
  hoursPerDay: number | null;
  confidence: "ALTA" | "MEDIA" | "BAIXA" | "INDISPONIVEL";
  samplesUsed: number;
};
type Prediction = {
  currentHorimeter: number | null;
  nextMaintenanceHorimeter: number | null;
  hoursRemaining: number | null;
  hoursPerDay: number | null;
  estimatedDays: number | null;
  estimatedDate: string | null;
  confidence: Consumption["confidence"];
};
type Row = {
  id: string;
  equipmentNumber: string;
  name: string | null;
  currentHorimeter: number;
  readingFrequency: "SEMANAL" | "QUINZENAL" | "MENSAL";
  lastReadingDate: string | null;
  nextReadingDate: string | null;
  leaseStatus: "DISPONIVEL" | "LOCADO";
  currentClient: string | null;
  lastLocationUpdate: string | null;
  locationSource: "MANUAL" | "CSV" | null;
  lastMaintenanceHorimeter: number | null;
  maintenanceIntervalHours: number | null;
  pendingStatus: "EM_DIA" | "VENCE_HOJE" | "ATRASADO" | "SEM_LEITURA";
  daysLate: number;
  consumption: Consumption;
  prediction: Prediction;
};
type Summary = {
  total: number;
  atrasados: number;
  venceHoje: number;
  semLeitura: number;
  locados: number;
  disponiveis: number;
};

// ─── Helpers de formatação ───────────────────────────────────────────────────
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";
const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function PendBadge({ status, daysLate }: { status: Row["pendingStatus"]; daysLate: number }) {
  const map: Record<Row["pendingStatus"], { c: string; t: string }> = {
    EM_DIA: { c: "bg-green-100 text-green-800", t: "Em dia" },
    VENCE_HOJE: { c: "bg-amber-100 text-amber-800", t: "Vence hoje" },
    ATRASADO: { c: "bg-red-100 text-red-800", t: `Atrasado ${daysLate}d` },
    SEM_LEITURA: { c: "bg-gray-200 text-gray-600", t: "Sem leitura" },
  };
  const { c, t } = map[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${c}`}>{t}</span>;
}

function ConfBadge({ c }: { c: Consumption["confidence"] }) {
  const map: Record<Consumption["confidence"], { c: string; t: string }> = {
    ALTA: { c: "bg-green-100 text-green-800", t: "Alta" },
    MEDIA: { c: "bg-amber-100 text-amber-800", t: "Média" },
    BAIXA: { c: "bg-red-100 text-red-800", t: "Baixa" },
    INDISPONIVEL: { c: "bg-gray-200 text-gray-600", t: "N/D" },
  };
  const { c: cls, t } = map[c];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{t}</span>;
}

function LeaseBadge({
  status,
  client,
  manual,
}: {
  status: Row["leaseStatus"];
  client: string | null;
  manual?: boolean;
}) {
  if (status === "LOCADO")
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800 whitespace-nowrap">
        {client || "Locado"}
        {manual && <span className="ml-1 text-purple-700" title="Marcado manualmente (sem contrato ativo)">•manual</span>}
      </span>
    );
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Disponível</span>;
}

// ══════════════════════════════════════════════════════════════════════════════
export default function HorimetrosClient() {
  const { data: session, status } = useSession() || {};
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const [fCliente, setFCliente] = useState("");
  const [fFreq, setFFreq] = useState("");
  const [fSituacao, setFSituacao] = useState("todos");
  const [search, setSearch] = useState("");

  const [lancarOpen, setLancarOpen] = useState(false);
  const [localizacaoOpen, setLocalizacaoOpen] = useState(false);
  const [locacaoManualOpen, setLocacaoManualOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/horimetros");
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows ?? []);
        setSummary(data.summary ?? null);
      } else if (res.status === 403) {
        setRows([]);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status]);

  const clientes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.currentClient).filter(Boolean))).sort() as string[],
    [rows]
  );

  const filtered = useMemo(() => {
    const t = search.toLowerCase();
    return rows.filter((r) => {
      if (t && !r.equipmentNumber.toLowerCase().includes(t) && !(r.currentClient ?? "").toLowerCase().includes(t)) return false;
      if (fCliente && r.currentClient !== fCliente) return false;
      if (fFreq && r.readingFrequency !== fFreq) return false;
      if (fSituacao === "pendentes" && !["ATRASADO", "VENCE_HOJE", "SEM_LEITURA"].includes(r.pendingStatus)) return false;
      if (fSituacao === "atrasados" && r.pendingStatus !== "ATRASADO") return false;
      if (fSituacao === "vence_hoje" && r.pendingStatus !== "VENCE_HOJE") return false;
      if (fSituacao === "sem_leitura" && r.pendingStatus !== "SEM_LEITURA") return false;
      if (fSituacao === "locados" && r.leaseStatus !== "LOCADO") return false;
      if (fSituacao === "disponiveis" && r.leaseStatus !== "DISPONIVEL") return false;
      return true;
    });
  }, [rows, search, fCliente, fFreq, fSituacao]);

  const imprimir = () => {
    const p = new URLSearchParams();
    if (fCliente) p.set("cliente", fCliente);
    if (fFreq) p.set("freq", fFreq);
    if (fSituacao) p.set("situacao", fSituacao);
    window.open(`/horimetros/imprimir?${p.toString()}`, "_blank");
  };

  if (status === "loading" || (loading && rows.length === 0)) {
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
        <p className="text-sm text-gray-500">O módulo de horímetros é exclusivo para administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Gauge className="w-6 h-6 text-orange-500" /> Controle de Horímetros
          </h1>
          <p className="text-sm text-gray-500">
            Leituras, pendências, localização e previsão de manutenção — tudo em um só lugar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setLancarOpen(true)} className="gap-2 bg-orange-500 hover:bg-orange-600">
            <Save className="w-4 h-4" /> Lançar Leituras
          </Button>
          <Button onClick={() => setLocalizacaoOpen(true)} variant="outline" className="gap-2">
            <MapPin className="w-4 h-4" /> Localização (CSV)
          </Button>
          <Button onClick={() => setLocacaoManualOpen(true)} variant="outline" className="gap-2">
            <MapPinPlus className="w-4 h-4" /> Locação Manual
          </Button>
          <Button onClick={imprimir} variant="outline" className="gap-2">
            <Printer className="w-4 h-4" /> Imprimir lista
          </Button>
        </div>
      </div>

      {/* Resumo — clique num cartão para filtrar a tabela por ele */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard
            label="Total" value={summary.total} icon={<Gauge className="w-4 h-4" />} color="text-gray-700"
            active={fSituacao === "todos"}
            onClick={() => { setFSituacao("todos"); setFCliente(""); setFFreq(""); setSearch(""); }}
          />
          <SummaryCard
            label="Atrasados" value={summary.atrasados} icon={<AlertTriangle className="w-4 h-4" />} color="text-red-600"
            active={fSituacao === "atrasados"}
            onClick={() => setFSituacao("atrasados")}
          />
          <SummaryCard
            label="Vence hoje" value={summary.venceHoje} icon={<CalendarClock className="w-4 h-4" />} color="text-amber-600"
            active={fSituacao === "vence_hoje"}
            onClick={() => setFSituacao("vence_hoje")}
          />
          <SummaryCard
            label="Sem leitura" value={summary.semLeitura} icon={<Clock className="w-4 h-4" />} color="text-gray-500"
            active={fSituacao === "sem_leitura"}
            onClick={() => setFSituacao("sem_leitura")}
          />
          <SummaryCard
            label="Locados" value={summary.locados} icon={<MapPin className="w-4 h-4" />} color="text-blue-600"
            active={fSituacao === "locados"}
            onClick={() => setFSituacao("locados")}
          />
          <SummaryCard
            label="Disponíveis" value={summary.disponiveis} icon={<CheckCircle2 className="w-4 h-4" />} color="text-green-600"
            active={fSituacao === "disponiveis"}
            onClick={() => setFSituacao("disponiveis")}
          />
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Buscar</label>
          <Input placeholder="GE-... ou cliente" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <FilterSelect label="Situação" value={fSituacao} onChange={setFSituacao} options={[
          { v: "todos", t: "Todos os equipamentos" },
          { v: "pendentes", t: "Todas pendentes" },
          { v: "atrasados", t: "Atrasados" },
          { v: "vence_hoje", t: "Vence hoje" },
          { v: "sem_leitura", t: "Sem leitura" },
          { v: "locados", t: "Locados" },
          { v: "disponiveis", t: "Disponíveis" },
        ]} />
        <FilterSelect label="Cliente/Local" value={fCliente} onChange={setFCliente} options={[
          { v: "", t: "Todos" },
          ...clientes.map((c) => ({ v: c, t: c })),
        ]} />
        <FilterSelect label="Frequência" value={fFreq} onChange={setFFreq} options={[
          { v: "", t: "Todas" },
          { v: "SEMANAL", t: "Semanal" },
          { v: "QUINZENAL", t: "Quinzenal" },
          { v: "MENSAL", t: "Mensal" },
        ]} />
        <div className="text-sm text-gray-500 pb-2">{filtered.length} equipamento(s)</div>
      </div>

      {/* Tabela mestre — clique num equipamento para ver todos os detalhes */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <Th>Equipamento</Th>
              <Th>Cliente</Th>
              <Th>Última leitura</Th>
              <Th className="text-right">Horímetro atual</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => (
              <tr
                key={r.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelected(r)}
              >
                <Td className="font-medium text-gray-900 whitespace-nowrap">{r.equipmentNumber}</Td>
                <Td><LeaseBadge status={r.leaseStatus} client={r.currentClient} manual={r.locationSource === "MANUAL"} /></Td>
                <Td className="whitespace-nowrap">{fmtDate(r.lastReadingDate)}</Td>
                <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                  <QuickReading row={r} onSaved={load} />
                </Td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="text-center text-gray-400 py-8">Nenhum equipamento para os filtros selecionados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Painel: Lançar Leituras */}
      <Sheet open={lancarOpen} onOpenChange={setLancarOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Save className="w-5 h-5 text-orange-500" /> Lançar Leituras
            </SheetTitle>
            <SheetDescription>Registre a leitura de horímetro de um ou mais equipamentos.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <LancarPanel rows={rows} onDone={() => { load(); }} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Painel: Localização (CSV) */}
      <Sheet open={localizacaoOpen} onOpenChange={setLocalizacaoOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-orange-500" /> Localização (CSV)
            </SheetTitle>
            <SheetDescription>Atualize em lote qual cliente está com cada equipamento locado.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <LocalizacaoPanel onDone={() => { load(); }} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Painel: Locação Manual (sem contrato ativo no relatório) */}
      <Sheet open={locacaoManualOpen} onOpenChange={setLocacaoManualOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MapPinPlus className="w-5 h-5 text-orange-500" /> Locação Manual
            </SheetTitle>
            <SheetDescription>
              Marque equipamentos locados sem contrato ativo — eles não aparecem no relatório de
              localização e não são alterados pela importação de CSV enquanto estiverem aqui.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <LocacaoManualPanel rows={rows} onDone={() => { load(); }} />
          </div>
        </SheetContent>
      </Sheet>

      {selected && (
        <DetailDialog
          row={rows.find((r) => r.id === selected.id) ?? selected}
          onClose={() => setSelected(null)}
          onAjustar={(r) => setEditing(r)}
          onDeleted={() => { setSelected(null); load(); }}
        />
      )}

      {editing && (
        <AjustarDialog row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

// ═══ DIÁLOGO: DETALHES DO EQUIPAMENTO ═════════════════════════════════════════
function DetailDialog({
  row,
  onClose,
  onAjustar,
  onDeleted,
}: {
  row: Row;
  onClose: () => void;
  onAjustar: (row: Row) => void;
  onDeleted: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-orange-500" /> {row.equipmentNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <LeaseBadge status={row.leaseStatus} client={row.currentClient} manual={row.locationSource === "MANUAL"} />
            <PendBadge status={row.pendingStatus} daysLate={row.daysLate} />
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <DetailField label="Frequência de leitura" value={FREQUENCY_LABELS[row.readingFrequency]} />
            <DetailField label="Última leitura" value={fmtDate(row.lastReadingDate)} />
            <DetailField label="Horímetro atual" value={fmtNum(row.currentHorimeter)} />
            <DetailField label="Próxima leitura" value={fmtDate(row.nextReadingDate)} />
            <DetailField label="Média de consumo" value={`${fmtNum(row.consumption.hoursPerDay)} h/dia`} />
            <DetailField label="Confiança" value={<ConfBadge c={row.consumption.confidence} />} />
            <DetailField label="Próx. revisão (horímetro)" value={fmtNum(row.prediction.nextMaintenanceHorimeter)} />
            <DetailField label="Horas restantes p/ revisão" value={fmtNum(row.prediction.hoursRemaining)} />
            <DetailField
              label="Previsão da próxima revisão"
              value={
                row.prediction.estimatedDate
                  ? <>{fmtDate(row.prediction.estimatedDate)} <span className="text-gray-400">({row.prediction.estimatedDays}d)</span></>
                  : "—"
              }
            />
          </dl>
        </div>
        <DialogFooter className="sm:justify-between">
          <DeleteEquipmentButton row={row} onDeleted={onDeleted} />
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
            <Button className="bg-orange-500 hover:bg-orange-600 gap-2" onClick={() => onAjustar(row)}>
              <Settings2 className="w-4 h-4" /> Ajustar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══ AÇÃO: EXCLUIR EQUIPAMENTO ═════════════════════════════════════════════════
function DeleteEquipmentButton({ row, onDeleted }: { row: Row; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); // mantém o diálogo aberto até a exclusão terminar
    setDeleting(true);
    try {
      const res = await fetch(`/api/equipamentos/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Erro ao excluir equipamento.");
        return;
      }
      toast.success(`${row.equipmentNumber} excluído.`);
      setOpen(false);
      onDeleted();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-2">
          <Trash2 className="w-4 h-4" /> Excluir
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {row.equipmentNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            Essa ação remove o equipamento e todo o histórico de leituras de horímetro dele — não pode ser desfeita.
            Se houver ordens de serviço vinculadas a ele, a exclusão será bloqueada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            onClick={confirmDelete}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}

// ═══ ATALHO: LANÇAR LEITURA DIRETO NA TABELA ═════════════════════════════════
function QuickReading({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setValue("");
    setWarning(null);
  };

  const submit = async (confirmed: boolean) => {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) {
      toast.error("Informe um valor válido.");
      return;
    }
    setSaving(true);
    try {
      const readingDate = new Date().toISOString().slice(0, 10);
      const res = await fetch("/api/horimetros/leituras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          readings: [{ equipmentId: row.id, readingDate, value: parsed, note: "", confirmed }],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao lançar leitura.");
        return;
      }
      if (data.needsConfirmation) {
        setWarning(data.warnings?.[0]?.message ?? "Confirme para prosseguir.");
        return;
      }
      toast.success(`Horímetro de ${row.equipmentNumber} atualizado.`);
      setOpen(false);
      reset();
      onSaved();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-gray-900 hover:text-orange-600 hover:underline underline-offset-2"
        >
          {fmtNum(row.currentHorimeter)}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Novo horímetro</label>
            <Input
              type="number"
              step="0.1"
              inputMode="decimal"
              autoFocus
              value={value}
              onChange={(e) => { setValue(e.target.value); setWarning(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" && value !== "") submit(!!warning); }}
              placeholder={fmtNum(row.currentHorimeter)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Data da leitura: hoje ({fmtDate(new Date().toISOString())})
            </p>
          </div>
          {warning && (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {warning}
            </div>
          )}
          <div className="flex justify-end gap-2">
            {warning ? (
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600" disabled={saving} onClick={() => submit(true)}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar mesmo assim"}
              </Button>
            ) : (
              <Button size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={saving || value === ""} onClick={() => submit(false)}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={onClick ? `cursor-pointer transition-colors hover:border-orange-300 hover:bg-orange-50/40 ${active ? "border-orange-400 ring-1 ring-orange-300 bg-orange-50/60" : ""}` : ""}
    >
      <CardContent className="p-3">
        <div className={`flex items-center gap-1.5 text-xs font-medium ${color}`}>
          {icon} {label}
        </div>
        <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

// ═══ PAINEL: LANÇAR LEITURAS ══════════════════════════════════════════════════
function LancarPanel({ rows, onDone }: { rows: Row[]; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [readingDate, setReadingDate] = useState(today);
  const [search, setSearch] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [warnDialog, setWarnDialog] = useState<{ warnings: any[]; payload: any[] } | null>(null);

  const filtered = useMemo(() => {
    const t = search.toLowerCase();
    return rows.filter((r) => r.equipmentNumber.toLowerCase().includes(t) || (r.currentClient ?? "").toLowerCase().includes(t));
  }, [rows, search]);

  const buildPayload = (confirmed: boolean) =>
    Object.entries(values)
      .filter(([, v]) => v !== "" && v != null)
      .map(([equipmentId, v]) => ({
        equipmentId,
        readingDate,
        value: parseFloat(v),
        note: notes[equipmentId] || "",
        confirmed,
      }));

  const submit = async (confirmed: boolean, payloadOverride?: any[]) => {
    const readings = payloadOverride ?? buildPayload(confirmed);
    if (readings.length === 0) {
      toast.error("Informe ao menos uma leitura.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/horimetros/leituras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readings }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao lançar leituras.");
        return;
      }
      if (data.needsConfirmation) {
        setWarnDialog({ warnings: data.warnings ?? [], payload: readings });
        return;
      }
      toast.success(`${data.appliedCount} leitura(s) lançada(s).`);
      if (data.errors?.length) toast.warning(`${data.errors.length} com erro (ignoradas).`);
      setValues({});
      setNotes({});
      setWarnDialog(null);
      onDone();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setSaving(false);
    }
  };

  const confirmWithWarnings = () => {
    const confirmedPayload = (warnDialog?.payload ?? []).map((p) => ({ ...p, confirmed: true }));
    submit(true, confirmedPayload);
  };

  const eqById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const countFilled = Object.values(values).filter((v) => v !== "").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Data da leitura</label>
          <Input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} className="w-40" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Buscar equipamento</label>
          <Input placeholder="GE-... ou cliente" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => submit(false)} disabled={saving || countFilled === 0} className="gap-2 bg-orange-500 hover:bg-orange-600">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Lançar {countFilled > 0 ? `(${countFilled})` : ""}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border max-h-[60vh]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 sticky top-0">
            <tr>
              <Th>Equipamento</Th>
              <Th>Cliente/Local</Th>
              <Th>Última leitura</Th>
              <Th className="text-right">Horímetro anterior</Th>
              <Th>Novo horímetro</Th>
              <Th>Observação</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <Td className="font-medium text-gray-900 whitespace-nowrap">{r.equipmentNumber}</Td>
                <Td><LeaseBadge status={r.leaseStatus} client={r.currentClient} /></Td>
                <Td className="whitespace-nowrap">{fmtDate(r.lastReadingDate)}</Td>
                <Td className="text-right text-gray-500">{fmtNum(r.currentHorimeter)}</Td>
                <Td>
                  <Input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    className="w-28"
                    value={values[r.id] ?? ""}
                    onChange={(e) => setValues((s) => ({ ...s, [r.id]: e.target.value }))}
                  />
                </Td>
                <Td>
                  <Input
                    className="w-48"
                    placeholder="opcional"
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((s) => ({ ...s, [r.id]: e.target.value }))}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Diálogo de confirmação de avisos */}
      <Dialog open={!!warnDialog} onOpenChange={(o) => !o && setWarnDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" /> Confirmação necessária
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto text-sm">
            <p className="text-gray-600">As leituras abaixo geraram alertas. Revise antes de confirmar:</p>
            {(warnDialog?.warnings ?? []).map((w, i) => (
              <div key={i} className="rounded border border-amber-200 bg-amber-50 p-2">
                <span className="font-medium">{eqById.get(w.equipmentId)?.equipmentNumber ?? w.equipmentId}:</span>{" "}
                {w.message}
              </div>
            ))}
            <p className="text-xs text-gray-500 pt-1">
              Recomenda-se registrar uma observação explicando o motivo antes de confirmar.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWarnDialog(null)}>Revisar</Button>
            <Button className="bg-amber-500 hover:bg-amber-600" onClick={confirmWithWarnings} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar mesmo assim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══ DIÁLOGO: AJUSTAR FREQUÊNCIA / MANUTENÇÃO ═════════════════════════════════
function AjustarDialog({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const [freq, setFreq] = useState(row.readingFrequency);
  const [reason, setReason] = useState("");
  const [lastMaint, setLastMaint] = useState(row.lastMaintenanceHorimeter?.toString() ?? "");
  const [interval, setInterval] = useState(row.maintenanceIntervalHours?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const freqChanged = freq !== row.readingFrequency;

  const save = async () => {
    if (freqChanged && !reason.trim()) {
      toast.error("Informe o motivo da alteração de frequência.");
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        readingFrequency: freq,
        reason,
        lastMaintenanceHorimeter: lastMaint,
        maintenanceIntervalHours: interval,
      };
      const res = await fetch(`/api/horimetros/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao salvar.");
        return;
      }
      toast.success("Alterações salvas.");
      onSaved();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-orange-500" /> Ajustar {row.equipmentNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Frequência de leitura</label>
            <select
              className="w-full border rounded-md h-9 px-2 text-sm"
              value={freq}
              onChange={(e) => setFreq(e.target.value as Row["readingFrequency"])}
            >
              <option value="SEMANAL">Semanal (7 dias)</option>
              <option value="QUINZENAL">Quinzenal (15 dias)</option>
              <option value="MENSAL">Mensal (30 dias)</option>
            </select>
          </div>
          {freqChanged && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo da alteração *</label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: equipamento passou a operar mais horas" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Últ. manut. (horímetro)</label>
              <Input type="number" step="0.1" value={lastMaint} onChange={(e) => setLastMaint(e.target.value)} placeholder="ex.: 1200" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Intervalo (horas)</label>
              <Input type="number" step="0.1" value={interval} onChange={(e) => setInterval(e.target.value)} placeholder="ex.: 250" />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            A próxima revisão = últ. manutenção + intervalo. A previsão de data usa a média de consumo recente.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-orange-500 hover:bg-orange-600" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Detecta a codificação do arquivo (BOM ou UTF-16 "cru", comum em exportações do
// Windows/Excel) para não corromper acentos ao ler o CSV.
function decodeCsvBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.slice(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.slice(2));
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.slice(3));
  }
  const sampleLen = Math.min(bytes.length, 2000);
  let zeroCount = 0;
  for (let i = 0; i < sampleLen; i++) if (bytes[i] === 0) zeroCount++;
  if (sampleLen > 0 && zeroCount / sampleLen > 0.25) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

// ═══ PAINEL: LOCAÇÃO MANUAL (sem contrato ativo no relatório) ═════════════════
function LocacaoManualPanel({ rows, onDone }: { rows: Row[]; onDone: () => void }) {
  const [search, setSearch] = useState("");
  const [clientDrafts, setClientDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const manualLocked = useMemo(
    () => rows.filter((r) => r.leaseStatus === "LOCADO" && r.locationSource === "MANUAL"),
    [rows]
  );

  const filtered = useMemo(() => {
    const t = search.toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (r) => r.equipmentNumber.toLowerCase().includes(t) || (r.currentClient ?? "").toLowerCase().includes(t)
    );
  }, [rows, search]);

  const save = async (row: Row, client: string) => {
    setSavingId(row.id);
    try {
      const res = await fetch(`/api/horimetros/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualClient: client }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao salvar.");
        return;
      }
      toast.success(client ? `${row.equipmentNumber} marcado como locado.` : `${row.equipmentNumber} liberado.`);
      setClientDrafts((s) => ({ ...s, [row.id]: "" }));
      onDone();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {manualLocked.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-2 text-sm">Locados manualmente</h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <Th>Equipamento</Th>
                  <Th>Cliente</Th>
                  <Th>Desde</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {manualLocked.map((r) => (
                  <tr key={r.id}>
                    <Td className="font-medium text-gray-900 whitespace-nowrap">{r.equipmentNumber}</Td>
                    <Td>{r.currentClient}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(r.lastLocationUpdate)}</Td>
                    <Td>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-gray-500 hover:text-red-600"
                        disabled={savingId === r.id}
                        onClick={() => save(r, "")}
                      >
                        {savingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XIcon className="w-3.5 h-3.5" />}
                        Liberar
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-gray-800 mb-2 text-sm">Marcar equipamento como locado</h3>
        <div className="max-w-xs mb-3">
          <Input placeholder="Buscar equipamento" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="overflow-x-auto rounded-lg border max-h-[50vh]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 sticky top-0">
              <tr>
                <Th>Equipamento</Th>
                <Th>Status atual</Th>
                <Th>Cliente</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <Td className="font-medium text-gray-900 whitespace-nowrap">{r.equipmentNumber}</Td>
                  <Td><LeaseBadge status={r.leaseStatus} client={r.currentClient} /></Td>
                  <Td>
                    <Input
                      className="w-48"
                      placeholder="Nome do cliente"
                      value={clientDrafts[r.id] ?? ""}
                      onChange={(e) => setClientDrafts((s) => ({ ...s, [r.id]: e.target.value }))}
                    />
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      className="bg-orange-500 hover:bg-orange-600 gap-1"
                      disabled={savingId === r.id || !(clientDrafts[r.id] ?? "").trim()}
                      onClick={() => save(r, clientDrafts[r.id] ?? "")}
                    >
                      {savingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Marcar locado"}
                    </Button>
                  </Td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="text-center text-gray-400 py-6">Nenhum equipamento encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══ PAINEL: LOCALIZAÇÃO (CSV) ═════════════════════════════════════════════════
function LocalizacaoPanel({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<any>(null);
  const [blocking, setBlocking] = useState<string[]>([]);
  const [canConfirm, setCanConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const loadHistory = async () => {
    try {
      const res = await fetch("/api/horimetros/localizacao");
      if (res.ok) setHistory((await res.json()).history ?? []);
    } catch { /* ignore */ }
  };
  useEffect(() => { loadHistory(); }, []);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = (e.target.files ?? [])[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = decodeCsvBuffer(reader.result as ArrayBuffer);
      setCsv(text);
      doPreview(text, f.name);
    };
    reader.readAsArrayBuffer(f);
  };

  const doPreview = async (text: string, name: string) => {
    setLoading(true);
    setPreview(null);
    try {
      const res = await fetch("/api/horimetros/localizacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text, mode: "preview", fileName: name }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao processar arquivo.");
        return;
      }
      setPreview(data.preview);
      setBlocking(data.blocking ?? []);
      setCanConfirm(!!data.canConfirm);
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/horimetros/localizacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, mode: "confirm", fileName }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Importação bloqueada.");
        return;
      }
      toast.success("Localização atualizada com sucesso.");
      setPreview(null);
      setCsv("");
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
      loadHistory();
      onDone();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <FileWarning className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-600">
              O arquivo representa a <strong>posição completa atual</strong> das locações. Equipamentos presentes no
              arquivo ficam <strong>LOCADOS</strong> (com o cliente informado); todos os demais são marcados como
              <strong> DISPONÍVEIS</strong>. A importação não cria equipamentos novos.
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()} disabled={loading}>
            <Upload className="w-4 h-4" /> Selecionar CSV
          </Button>
          {fileName && <span className="text-sm text-gray-500 ml-2">{fileName}</span>}
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Processando...
        </div>
      )}

      {preview && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-gray-800">Prévia da importação</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MiniStat label="No arquivo" value={preview.foundInFile} />
              <MiniStat label="Ficarão locados" value={preview.willLease} color="text-blue-600" />
              <MiniStat label="Ficarão disponíveis" value={preview.willAvailable} color="text-green-600" />
              <MiniStat label="Mantidos (locação manual)" value={preview.manualPreserved ?? 0} color="text-purple-600" />
              <MiniStat label="Linhas com erro" value={preview.errorRows?.length ?? 0} color="text-red-600" />
            </div>

            {blocking.length > 0 && (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-sm space-y-1">
                <div className="font-medium text-red-700 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Corrija antes de confirmar:</div>
                {blocking.map((b, i) => <div key={i} className="text-red-700">• {b}</div>)}
              </div>
            )}

            {(preview.duplicates?.length > 0) && (
              <p className="text-xs text-red-600">Duplicados: {preview.duplicates.join(", ")}</p>
            )}
            {(preview.notInBase?.length > 0) && (
              <p className="text-xs text-red-600">Fora da base: {preview.notInBase.join(", ")}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => { setPreview(null); setCsv(""); setFileName(""); if (fileRef.current) fileRef.current.value = ""; }}>
                Cancelar
              </Button>
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={confirm} disabled={!canConfirm || loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar atualização"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="font-semibold text-gray-800 mb-2 text-sm flex items-center gap-2">
          <ClipboardList className="w-4 h-4" /> Histórico de importações
        </h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <Th>Data</Th>
                <Th>Arquivo</Th>
                <Th className="text-right">Locados</Th>
                <Th className="text-right">Disponíveis</Th>
                <Th className="text-right">Erros</Th>
                <Th>Por</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.map((h) => (
                <tr key={h.id}>
                  <Td>{new Date(h.createdAt).toLocaleString("pt-BR")}</Td>
                  <Td>{h.fileName}</Td>
                  <Td className="text-right">{h.leasedCount}</Td>
                  <Td className="text-right">{h.availableCount}</Td>
                  <Td className="text-right">{h.errorCount}</Td>
                  <Td>{h.createdBy?.name ?? "—"}</Td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={6} className="text-center text-gray-400 py-6">Nenhuma importação ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color = "text-gray-800" }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

// ─── Átomos de tabela / filtro ────────────────────────────────────────────────
function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium px-3 py-2 ${className}`}>{children}</th>;
}
function Td({
  children,
  className = "",
  onClick,
}: {
  children?: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
}) {
  return (
    <td className={`px-3 py-2 ${className}`} onClick={onClick}>
      {children}
    </td>
  );
}
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; t: string }[] }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select className="border rounded-md h-9 px-2 text-sm min-w-[140px]" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </div>
  );
}
