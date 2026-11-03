"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, CircleSlash, Loader2, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AUDIT_TYPE_LABELS, type AuditType } from "@/lib/horimetro-audit";
import { COLLECTION_FAIL_LABELS, type CollectionFailReason } from "@/lib/horimetro-coleta";

type Alert = {
  equipmentId: string;
  equipmentNumber: string;
  type: AuditType;
  severity: "ALTA" | "MEDIA";
  date: string;
  message: string;
  userIds: string[];
  userNames: string[];
};
type UserStats = {
  userId: string;
  name: string;
  readings: number;
  equalOnLeased: number;
  tinyOnLeased: number;
  lower: number;
  late: number;
  attempts: number;
  highAlerts: number;
};
type TimelineRow = {
  id: string;
  readingDate: string;
  value: number;
  delta: number | null;
  days: number | null;
  by: string;
  enteredAt: string;
  lagDays: number;
  source: string;
  note: string | null;
};
type Attempt = { id: string; at: string; reason: CollectionFailReason; note: string | null; by: string };

const fmtDay = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default function AuditoriaClient() {
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [users, setUsers] = useState<UserStats[]>([]);
  const [fType, setFType] = useState("");
  const [fSeverity, setFSeverity] = useState("");
  const [fUser, setFUser] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/horimetros/auditoria?days=${days}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 403 || res.status === 401) {
          setForbidden(true);
          return;
        }
        const d = await res.json();
        setAlerts(d.alerts ?? []);
        setUsers(d.users ?? []);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return alerts.filter(
      (a) =>
        (!fType || a.type === fType) &&
        (!fSeverity || a.severity === fSeverity) &&
        (!fUser || a.userIds.includes(fUser)) &&
        (!t || a.equipmentNumber.toLowerCase().includes(t))
    );
  }, [alerts, fType, fSeverity, fUser, search]);

  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <CircleSlash className="w-10 h-10 text-gray-400 mb-3" />
        <h2 className="text-lg font-semibold text-gray-800">Acesso restrito</h2>
        <p className="text-sm text-gray-500">A auditoria dos horímetros não está liberada para esta conta.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/horimetros" className="text-sm text-gray-500 hover:text-green-600 inline-flex items-center gap-1 mb-1">
            <ArrowLeft className="w-4 h-4" /> Horímetros
          </Link>
          <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-green-500" /> Auditoria de lançamentos
          </h1>
          <p className="text-sm text-gray-500 max-w-3xl">
            Procura sinais de leitura que não veio do campo: valor repetido, número parecido só pra atualizar, salto
            depois de semanas sem uso e valores impossíveis.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Período analisado</label>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-white"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[30, 60, 90, 180, 365].map((d) => (
              <option key={d} value={d}>
                Últimos {d} dias
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-green-500" />
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-sm font-semibold text-gray-800 mb-2">Por quem lançou</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {users.map((u) => {
                const pct = (n: number) => (u.readings ? Math.round((100 * n) / u.readings) : 0);
                return (
                  <Card key={u.userId} className={fUser === u.userId ? "ring-2 ring-green-400" : ""}>
                    <CardContent className="p-4 space-y-2">
                      <button
                        type="button"
                        className="font-semibold text-gray-900 hover:text-green-600 text-left"
                        onClick={() => setFUser(fUser === u.userId ? "" : u.userId)}
                        title="Filtrar alertas por este usuário"
                      >
                        {u.name}
                      </button>
                      <div className="text-xs text-gray-500">{u.readings} leitura(s) no período</div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <dt className="text-gray-500">Iguais à anterior (máquina locada)</dt>
                        <dd className="text-right font-medium">{u.equalOnLeased} ({pct(u.equalOnLeased)}%)</dd>
                        <dt className="text-gray-500">Aumento irrisório (&lt; 0,3 h/dia, locada)</dt>
                        <dd className="text-right font-medium">{u.tinyOnLeased} ({pct(u.tinyOnLeased)}%)</dd>
                        <dt className="text-gray-500">Menores que a anterior</dt>
                        <dd className="text-right font-medium">{u.lower}</dd>
                        <dt className="text-gray-500">Lançadas com mais de 3 dias de atraso</dt>
                        <dd className="text-right font-medium">{u.late}</dd>
                        <dt className="text-gray-500">“Não consegui coletar”</dt>
                        <dd className="text-right font-medium">{u.attempts}</dd>
                        <dt className="text-gray-500">Alertas de gravidade alta</dt>
                        <dd className="text-right font-semibold text-red-600">{u.highAlerts}</dd>
                      </dl>
                    </CardContent>
                  </Card>
                );
              })}
              {users.length === 0 && <p className="text-sm text-gray-400">Nenhuma leitura no período.</p>}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <h2 className="text-sm font-semibold text-gray-800 mr-2 pb-2">Alertas ({filtered.length})</h2>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                <select className="border rounded-md px-3 py-2 text-sm bg-white" value={fType} onChange={(e) => setFType(e.target.value)}>
                  <option value="">Todos</option>
                  {Object.entries(AUDIT_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Gravidade</label>
                <select className="border rounded-md px-3 py-2 text-sm bg-white" value={fSeverity} onChange={(e) => setFSeverity(e.target.value)}>
                  <option value="">Todas</option>
                  <option value="ALTA">Alta</option>
                  <option value="MEDIA">Média</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quem lançou</label>
                <select className="border rounded-md px-3 py-2 text-sm bg-white" value={fUser} onChange={(e) => setFUser(e.target.value)}>
                  <option value="">Todos</option>
                  {users.map((u) => (
                    <option key={u.userId} value={u.userId}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div className="w-48">
                <label className="block text-xs font-medium text-gray-600 mb-1">Equipamento</label>
                <Input placeholder="GE-..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2 text-left font-medium">Equipamento</th>
                    <th className="px-3 py-2 text-left font-medium">Gravidade</th>
                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium">O que foi detectado</th>
                    <th className="px-3 py-2 text-left font-medium">Quem lançou</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((a, i) => {
                    const key = `${a.equipmentId}-${a.type}-${a.date}-${i}`;
                    const isOpen = open === key;
                    return (
                      <Fragment key={key}>
                        <tr className="hover:bg-gray-50 cursor-pointer align-top" onClick={() => setOpen(isOpen ? null : key)}>
                          <td className="px-3 py-2 text-gray-400">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{a.equipmentNumber}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                a.severity === "ALTA" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {a.severity === "ALTA" ? "Alta" : "Média"}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{AUDIT_TYPE_LABELS[a.type]}</td>
                          <td className="px-3 py-2 text-gray-700 min-w-[280px]">{a.message}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{a.userNames.join(", ")}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{fmtDay(a.date)}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-gray-50/60">
                            <td colSpan={7} className="px-4 py-3">
                              <Timeline equipmentId={a.equipmentId} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-gray-400 py-8">
                        Nenhum alerta para os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-gray-500 flex items-start gap-1.5 max-w-3xl">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Alerta não é prova: é um ponto pra conferir. Máquina parada no pátio ou em locação manual repete valor
                normalmente e não gera alerta de repetição. A locação por contrato é reconstruída pelas importações do
                CSV de localização.
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Timeline({ equipmentId }: { equipmentId: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TimelineRow[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/horimetros/auditoria/${equipmentId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setRows(d.timeline ?? []);
        setAttempts(d.attempts ?? []);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [equipmentId]);

  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-green-500" />;

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="text-xs font-semibold text-gray-700">Histórico de leituras (mais recentes primeiro)</div>
      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">Data da leitura</th>
              <th className="px-2 py-1.5 text-right font-medium">Horímetro</th>
              <th className="px-2 py-1.5 text-right font-medium">Variação</th>
              <th className="px-2 py-1.5 text-left font-medium">Quem lançou</th>
              <th className="px-2 py-1.5 text-left font-medium">Lançado em</th>
              <th className="px-2 py-1.5 text-left font-medium">Origem</th>
              <th className="px-2 py-1.5 text-left font-medium">Obs.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-2 py-1.5 whitespace-nowrap">{fmtDay(r.readingDate)}</td>
                <td className="px-2 py-1.5 text-right font-medium">{r.value.toLocaleString("pt-BR")}</td>
                <td className={`px-2 py-1.5 text-right whitespace-nowrap ${r.delta === 0 ? "text-amber-600 font-medium" : r.delta !== null && r.delta < 0 ? "text-red-600 font-medium" : ""}`}>
                  {r.delta === null
                    ? "—"
                    : `${r.delta > 0 ? "+" : ""}${r.delta.toLocaleString("pt-BR")} h${r.days ? ` em ${r.days}d` : ""}`}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.by}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {fmtDateTime(r.enteredAt)}
                  {r.lagDays > 3 && <span className="ml-1 text-red-600">({r.lagDays}d depois)</span>}
                </td>
                <td className="px-2 py-1.5">{r.source === "OS" ? "OS" : r.source === "CSV" ? "CSV" : "Manual"}</td>
                <td className="px-2 py-1.5 text-gray-500">{r.note ?? ""}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-gray-400 py-4">Sem leituras.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {attempts.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-700 mb-1">Tentativas de coleta sem sucesso</div>
          <ul className="text-xs text-gray-600 space-y-0.5">
            {attempts.map((a) => (
              <li key={a.id}>
                {fmtDateTime(a.at)} — {a.by}: {COLLECTION_FAIL_LABELS[a.reason]}
                {a.note ? ` (${a.note})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
