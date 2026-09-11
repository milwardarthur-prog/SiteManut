// ────────────────────────────────────────────────────────────────────────────
// Módulo de controle de horímetro — lógica de cálculo compartilhada
// (frequência de leitura, previsão por média móvel, previsão de manutenção)
// ────────────────────────────────────────────────────────────────────────────

export type ReadingFrequency = "SEMANAL" | "QUINZENAL" | "MENSAL";

// Dias correspondentes a cada frequência de leitura.
export const FREQUENCY_DAYS: Record<ReadingFrequency, number> = {
  SEMANAL: 7,
  QUINZENAL: 15,
  MENSAL: 30,
};

export const FREQUENCY_LABELS: Record<ReadingFrequency, string> = {
  SEMANAL: "Semanal",
  QUINZENAL: "Quinzenal",
  MENSAL: "Mensal",
};

// Quantidade padrão de leituras consideradas na média móvel.
export const DEFAULT_MOVING_WINDOW = 5;

// Variação máxima considerada "normal" de horas por dia. Acima disso, alertar
// (possível erro de leitura). Um gerador rodando 24h/dia já é o teto físico.
export const MAX_HOURS_PER_DAY = 24;

/** Soma dias a uma data, retornando nova data (sem mutar a original). */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Calcula a próxima data de leitura = última leitura + dias da frequência. */
export function computeNextReadingDate(
  lastReadingDate: Date | null | undefined,
  frequency: ReadingFrequency
): Date | null {
  if (!lastReadingDate) return null;
  return addDays(new Date(lastReadingDate), FREQUENCY_DAYS[frequency]);
}

/** Diferença em dias (inteiro, arredondado) entre duas datas (a - b). */
export function diffDays(a: Date, b: Date): number {
  const ms = new Date(a).getTime() - new Date(b).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** Zera horas/min/seg para comparar apenas a data (início do dia). */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type PendingStatus = "EM_DIA" | "ATRASADO" | "SEM_LEITURA";

/**
 * Classifica a pendência de leitura de um equipamento com base na próxima
 * leitura prevista e na data de referência (hoje por padrão). Leituras que
 * vencem hoje já contam como atrasadas (daysLate = 0).
 */
export function classifyPending(
  nextReadingDate: Date | null | undefined,
  ref: Date = new Date()
): { status: PendingStatus; daysLate: number } {
  if (!nextReadingDate) return { status: "SEM_LEITURA", daysLate: 0 };
  const today = startOfDay(ref);
  const next = startOfDay(new Date(nextReadingDate));
  const late = diffDays(today, next); // positivo => atrasado
  if (late >= 0) return { status: "ATRASADO", daysLate: late };
  return { status: "EM_DIA", daysLate: 0 };
}

export type ReadingPoint = { readingDate: Date | string; value: number };

export type ConsumptionResult = {
  hoursPerDay: number | null; // média recente de utilização (h/dia)
  confidence: "ALTA" | "MEDIA" | "BAIXA" | "INDISPONIVEL";
  samplesUsed: number; // nº de intervalos usados
};

/**
 * Calcula a média móvel de consumo (h/dia) com base nas últimas `window`
 * leituras. As leituras devem vir em qualquer ordem — a função ordena por data.
 *
 * Confiança:
 *  - ALTA: >= 3 intervalos e baixa variação (coef. de variação <= 0,35)
 *  - MEDIA: >= 2 intervalos ou variação moderada
 *  - BAIXA: apenas 1 intervalo utilizável
 *  - INDISPONIVEL: dados insuficientes
 */
export function computeConsumption(
  readings: ReadingPoint[],
  window: number = DEFAULT_MOVING_WINDOW
): ConsumptionResult {
  if (!readings || readings.length < 2) {
    return { hoursPerDay: null, confidence: "INDISPONIVEL", samplesUsed: 0 };
  }
  // Ordena por data crescente
  const sorted = [...readings]
    .map((r) => ({ date: new Date(r.readingDate), value: Number(r.value) }))
    .filter((r) => !isNaN(r.date.getTime()) && !isNaN(r.value))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Usa apenas as últimas (window+1) leituras => até `window` intervalos
  const slice = sorted.slice(Math.max(0, sorted.length - (window + 1)));
  const rates: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const days = diffDays(slice[i].date, slice[i - 1].date);
    const deltaH = slice[i].value - slice[i - 1].value;
    if (days > 0 && deltaH >= 0) {
      rates.push(deltaH / days);
    }
  }
  if (rates.length === 0) {
    return { hoursPerDay: null, confidence: "INDISPONIVEL", samplesUsed: 0 };
  }
  const mean = rates.reduce((s, r) => s + r, 0) / rates.length;

  // Coeficiente de variação para estimar confiança
  let confidence: ConsumptionResult["confidence"] = "BAIXA";
  if (rates.length === 1) {
    confidence = "BAIXA";
  } else {
    const variance =
      rates.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / rates.length;
    const std = Math.sqrt(variance);
    const cv = mean > 0 ? std / mean : 1;
    if (rates.length >= 3 && cv <= 0.35) confidence = "ALTA";
    else confidence = "MEDIA";
  }

  return {
    hoursPerDay: Math.round(mean * 100) / 100,
    confidence,
    samplesUsed: rates.length,
  };
}

export type MaintenancePrediction = {
  currentHorimeter: number | null;
  nextMaintenanceHorimeter: number | null;
  hoursRemaining: number | null;
  hoursPerDay: number | null;
  estimatedDays: number | null;
  estimatedDate: Date | null;
  confidence: ConsumptionResult["confidence"];
};

/**
 * Previsão da próxima manutenção com base no consumo recente.
 *  próxima manutenção = últ. manutenção (horímetro) + intervalo
 *  horas restantes    = próxima manutenção - horímetro atual
 *  dias estimados     = horas restantes / média (h/dia)
 */
export function predictMaintenance(params: {
  currentHorimeter: number | null | undefined;
  lastMaintenanceHorimeter: number | null | undefined;
  maintenanceIntervalHours: number | null | undefined;
  consumption: ConsumptionResult;
  ref?: Date;
}): MaintenancePrediction {
  const {
    currentHorimeter,
    lastMaintenanceHorimeter,
    maintenanceIntervalHours,
    consumption,
    ref = new Date(),
  } = params;

  const cur = currentHorimeter ?? null;
  let nextMaint: number | null = null;
  if (
    lastMaintenanceHorimeter != null &&
    maintenanceIntervalHours != null &&
    maintenanceIntervalHours > 0
  ) {
    nextMaint = lastMaintenanceHorimeter + maintenanceIntervalHours;
  }

  let hoursRemaining: number | null = null;
  if (nextMaint != null && cur != null) {
    hoursRemaining = Math.round((nextMaint - cur) * 100) / 100;
  }

  let estimatedDays: number | null = null;
  let estimatedDate: Date | null = null;
  const hpd = consumption.hoursPerDay;
  if (hoursRemaining != null && hpd != null && hpd > 0) {
    estimatedDays = Math.max(0, Math.round(hoursRemaining / hpd));
    estimatedDate = addDays(startOfDay(ref), estimatedDays);
  }

  return {
    currentHorimeter: cur,
    nextMaintenanceHorimeter: nextMaint,
    hoursRemaining,
    hoursPerDay: hpd,
    estimatedDays,
    estimatedDate,
    confidence: consumption.confidence,
  };
}

/**
 * Indica se a manutenção precisa ser agendada: faltam menos de 50 horas
 * (incluindo valores negativos, já vencidos) ou a última manutenção foi
 * realizada há mais de um ano.
 */
export function needsMaintenanceScheduling(params: {
  hoursRemaining: number | null | undefined;
  lastMaintenanceDate: Date | string | null | undefined;
  ref?: Date;
}): boolean {
  const { hoursRemaining, lastMaintenanceDate, ref = new Date() } = params;
  if (hoursRemaining != null && hoursRemaining < 50) return true;
  if (lastMaintenanceDate) {
    const days = diffDays(ref, new Date(lastMaintenanceDate));
    if (days >= 365) return true;
  }
  return false;
}

/** Normaliza texto para comparação (trim + maiúsculas + colapsa espaços). */
export function normalizeCode(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}
