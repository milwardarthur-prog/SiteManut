// Auditoria dos lançamentos de horímetro: procura sinais de que a leitura não
// veio do campo (valor repetido, número "maquiado" perto do atual, salto de
// recuperação depois de semanas sem uso, valores impossíveis). Funções puras.
import { MAX_HOURS_PER_DAY, normalizeCode } from "@/lib/horimetro";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AuditSeverity = "ALTA" | "MEDIA";
export type AuditType =
  | "REPETIDA"
  | "QUASE_PARADA_SALTO"
  | "SALTO_IMPOSSIVEL"
  | "VALOR_MENOR"
  | "PARADA_COM_HORAS"
  | "SEM_COLETA"
  | "DATA_FUTURA";

export const AUDIT_TYPE_LABELS: Record<AuditType, string> = {
  REPETIDA: "Valor repetido",
  QUASE_PARADA_SALTO: "Quase parada e depois salto",
  SALTO_IMPOSSIVEL: "Salto impossível",
  VALOR_MENOR: "Valor menor que o anterior",
  PARADA_COM_HORAS: "Máquina parada ganhou horas",
  SEM_COLETA: "Tentativas sem coleta",
  DATA_FUTURA: "Data de leitura no futuro",
};

export type AuditReading = {
  equipmentId: string;
  readingDate: Date;
  value: number;
  createdAt: Date;
  createdById: string;
};

export type AuditEquipment = {
  id: string;
  equipmentNumber: string;
  leaseStatus: "DISPONIVEL" | "LOCADO" | "MANUTENCAO";
  locationSource: string | null;
};

export type AuditAttempt = { equipmentId: string; createdAt: Date; createdById: string };

/** Histórico de quem estava locado (por contrato) em cada importação do CSV. */
export type LeaseSnapshot = { at: Date; codes: Set<string> };

export type AuditAlert = {
  equipmentId: string;
  equipmentNumber: string;
  type: AuditType;
  severity: AuditSeverity;
  date: string; // yyyy-mm-dd — data mais recente envolvida
  message: string;
  userIds: string[];
};

export type AuditUserStats = {
  userId: string;
  readings: number;
  equalOnLeased: number; // iguais à anterior com a máquina locada
  tinyOnLeased: number; // aumento < 0,3 h/dia com a máquina locada
  lower: number;
  late: number; // lançadas com mais de 3 dias de atraso
  attempts: number; // "não consegui coletar"
  highAlerts: number;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const fmtBR = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().slice(0, 2).join("/");

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function buildLeaseHistory(imports: { createdAt: Date; summary: string | null }[]): LeaseSnapshot[] {
  const out: LeaseSnapshot[] = [];
  for (const imp of imports) {
    try {
      const leased: { equipmentNumber: string }[] = JSON.parse(imp.summary ?? "{}")?.leased ?? [];
      out.push({ at: imp.createdAt, codes: new Set(leased.map((l) => normalizeCode(l.equipmentNumber))) });
    } catch {
      /* resumo antigo/ilegível: ignora */
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function analyzeReadings(args: {
  equipments: AuditEquipment[];
  readings: AuditReading[];
  attempts: AuditAttempt[];
  leaseHistory: LeaseSnapshot[];
  windowDays: number;
  now?: Date;
}): { alerts: AuditAlert[]; users: AuditUserStats[] } {
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - args.windowDays * DAY_MS);

  const readingsByEq = new Map<string, AuditReading[]>();
  for (const r of args.readings) {
    if (!readingsByEq.has(r.equipmentId)) readingsByEq.set(r.equipmentId, []);
    readingsByEq.get(r.equipmentId)!.push(r);
  }
  const attemptsByEq = new Map<string, AuditAttempt[]>();
  for (const a of args.attempts) {
    if (!attemptsByEq.has(a.equipmentId)) attemptsByEq.set(a.equipmentId, []);
    attemptsByEq.get(a.equipmentId)!.push(a);
  }

  // A máquina estava locada por contrato na data? Usa a importação mais recente
  // até aquela data; antes da primeira importação cai no status atual.
  const leasedOn = (eq: AuditEquipment, date: Date): boolean => {
    const limit = date.getTime() + DAY_MS;
    let snap: LeaseSnapshot | null = null;
    for (const s of args.leaseHistory) {
      if (s.at.getTime() <= limit) snap = s;
      else break;
    }
    if (snap) return snap.codes.has(normalizeCode(eq.equipmentNumber));
    return eq.leaseStatus === "LOCADO" && eq.locationSource !== "MANUAL";
  };

  const alerts: AuditAlert[] = [];
  const stats = new Map<string, AuditUserStats>();
  const stat = (id: string) => {
    if (!stats.has(id)) stats.set(id, { userId: id, readings: 0, equalOnLeased: 0, tinyOnLeased: 0, lower: 0, late: 0, attempts: 0, highAlerts: 0 });
    return stats.get(id)!;
  };

  for (const eq of args.equipments) {
    const rs = (readingsByEq.get(eq.id) ?? []).sort(
      (a, b) => a.readingDate.getTime() - b.readingDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime()
    );
    const manual = eq.leaseStatus === "LOCADO" && eq.locationSource === "MANUAL"; // fica parada no cliente entre eventos

    type D = { dv: number; dd: number; rate: number; by: string; date: Date; leased: boolean; leasedPrev: boolean; prev: number; val: number; inWindow: boolean };
    const ds: D[] = [];
    for (let i = 1; i < rs.length; i++) {
      const dd = Math.max(1, Math.round((rs[i].readingDate.getTime() - rs[i - 1].readingDate.getTime()) / DAY_MS));
      const dv = rs[i].value - rs[i - 1].value;
      ds.push({
        dv,
        dd,
        rate: dv / dd,
        by: rs[i].createdById,
        date: rs[i].readingDate,
        leased: !manual && leasedOn(eq, rs[i].readingDate),
        leasedPrev: !manual && leasedOn(eq, rs[i - 1].readingDate),
        prev: rs[i - 1].value,
        val: rs[i].value,
        inWindow: rs[i].readingDate >= since,
      });
    }

    // estatística por quem lançou (só leituras dentro da janela)
    for (let i = 1; i < rs.length; i++) {
      if (rs[i].readingDate < since) continue;
      const d = ds[i - 1];
      const s = stat(rs[i].createdById);
      s.readings++;
      if (d.leased && d.dv === 0) s.equalOnLeased++;
      if (d.leased && d.dv > 0 && d.rate < 0.3) s.tinyOnLeased++;
      if (d.dv <= -1) s.lower++;
      if ((rs[i].createdAt.getTime() - rs[i].readingDate.getTime()) / DAY_MS > 3) s.late++;
    }

    const names = (ids: string[]) => Array.from(new Set(ids));

    // 1) valor repetido em máquina locada (>= 2 iguais seguidas)
    let i = 0;
    while (i < ds.length) {
      if (ds[i].dv === 0 && ds[i].leased) {
        let j = i;
        while (j + 1 < ds.length && ds[j + 1].dv === 0 && ds[j + 1].leased) j++;
        const run = j - i + 1;
        if (run >= 2 && ds[j].date >= since) {
          alerts.push({
            equipmentId: eq.id,
            equipmentNumber: eq.equipmentNumber,
            type: "REPETIDA",
            severity: "ALTA",
            date: isoDay(ds[j].date),
            message: `${run + 1} leituras iguais seguidas (${ds[j].val} h) com a máquina locada, de ${fmtBR(rs[i].readingDate)} a ${fmtBR(ds[j].date)}.`,
            userIds: names(ds.slice(i, j + 1).map((d) => d.by)),
          });
        }
        i = j + 1;
      } else i++;
    }

    // 2) quase parada (2 leituras com < 0,3 h/dia) e depois um salto grande
    for (let k = 2; k < ds.length; k++) {
      if (ds[k].date < since) continue;
      const a = ds[k - 2];
      const b = ds[k - 1];
      const lowUse = [a, b].every((d) => d.dv >= 0 && d.rate < 0.3 && d.leased);
      if (!lowUse) continue;
      const med = median(ds.slice(0, k).filter((d) => d.dv > 0).map((d) => d.rate));
      const jump = ds[k].dv >= 24 && (ds[k].dv >= 40 || ds[k].rate > Math.max(6, med * 4));
      if (!jump) continue;
      alerts.push({
        equipmentId: eq.id,
        equipmentNumber: eq.equipmentNumber,
        type: "QUASE_PARADA_SALTO",
        severity: "ALTA",
        date: isoDay(ds[k].date),
        message: `Quase sem uso em ${fmtBR(a.date)} e ${fmtBR(b.date)}, depois +${Math.round(ds[k].dv)} h em ${ds[k].dd} dia(s) (${fmtBR(ds[k].date)}). As leituras anteriores podem não ser reais.`,
        userIds: names([a.by, b.by, ds[k].by]),
      });
      break;
    }

    // 3) salto impossível e 4) valor menor
    for (const d of ds) {
      if (d.date < since) continue;
      if (d.dv > MAX_HOURS_PER_DAY * d.dd) {
        alerts.push({
          equipmentId: eq.id,
          equipmentNumber: eq.equipmentNumber,
          type: "SALTO_IMPOSSIVEL",
          severity: "ALTA",
          date: isoDay(d.date),
          message: `+${Math.round(d.dv)} h em ${d.dd} dia(s) em ${fmtBR(d.date)}: mais de ${MAX_HOURS_PER_DAY} h por dia, impossível.`,
          userIds: [d.by],
        });
      }
      if (d.dv <= -1) {
        let hint = "";
        if (d.val > 0 && Math.abs(d.val * 1000 - d.prev) <= d.prev * 0.01) hint = " Parece ponto de milhar digitado (ex.: 2.598 em vez de 2598).";
        else if (d.val < d.prev / 10) hint = " Parece dígito faltando ou troca de horímetro.";
        alerts.push({
          equipmentId: eq.id,
          equipmentNumber: eq.equipmentNumber,
          type: "VALOR_MENOR",
          severity: "ALTA",
          date: isoDay(d.date),
          message: `${d.prev} h → ${d.val} h em ${fmtBR(d.date)}.${hint}`,
          userIds: [d.by],
        });
      }
    }

    // 5) máquina parada (no pátio, fora de locação) ganhando horas
    if (!manual && eq.leaseStatus !== "MANUTENCAO") {
      for (const d of ds) {
        if (d.date < since || d.leased || d.leasedPrev || d.dv < 10 || d.dv > MAX_HOURS_PER_DAY * d.dd) continue;
        alerts.push({
          equipmentId: eq.id,
          equipmentNumber: eq.equipmentNumber,
          type: "PARADA_COM_HORAS",
          severity: "MEDIA",
          date: isoDay(d.date),
          message: `Sem contrato em ${fmtBR(d.date)}, mas ganhou ${Math.round(d.dv)} h. Confira se esteve em uso ou em teste.`,
          userIds: [d.by],
        });
      }
    }

    // data da leitura no futuro (erro de digitação de data)
    for (const r of rs) {
      if (r.readingDate.getTime() > now.getTime() + DAY_MS && r.readingDate >= since) {
        alerts.push({
          equipmentId: eq.id,
          equipmentNumber: eq.equipmentNumber,
          type: "DATA_FUTURA",
          severity: "ALTA",
          date: isoDay(r.readingDate),
          message: `Leitura de ${r.value} h com data ${fmtBR(r.readingDate)}/${r.readingDate.getUTCFullYear()}, que ainda não chegou. Confira a data.`,
          userIds: [r.createdById],
        });
      }
    }

    // 6) tentativas de coleta sem sucesso desde a última leitura real
    const lastRead = rs.length ? rs[rs.length - 1].readingDate : new Date(0);
    const lastEntered = rs.reduce((m, r) => Math.max(m, r.createdAt.getTime()), 0);
    const failed = (attemptsByEq.get(eq.id) ?? []).filter((a) => a.createdAt.getTime() > lastEntered && a.createdAt >= since);
    for (const a of failed) stat(a.createdById).attempts++;
    if (failed.length >= 2) {
      alerts.push({
        equipmentId: eq.id,
        equipmentNumber: eq.equipmentNumber,
        type: "SEM_COLETA",
        severity: "MEDIA",
        date: isoDay(failed[failed.length - 1].createdAt),
        message: `${failed.length} tentativas de coleta sem sucesso desde a última leitura real (${rs.length ? fmtBR(lastRead) : "nunca lido"}).`,
        userIds: names(failed.map((a) => a.createdById)),
      });
    }
  }

  for (const al of alerts) if (al.severity === "ALTA") for (const u of al.userIds) stat(u).highAlerts++;

  const order = { ALTA: 0, MEDIA: 1 } as const;
  alerts.sort((a, b) => order[a.severity] - order[b.severity] || b.date.localeCompare(a.date));
  return { alerts, users: Array.from(stats.values()).sort((a, b) => b.readings - a.readings) };
}
