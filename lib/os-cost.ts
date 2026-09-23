// Cálculo do custo de uma OS (peças + revisão) — usado tanto na tela da OS
// (app/(authenticated)/os/[id]/_components/os-detail-client.tsx) quanto nas
// estatísticas agregadas (app/api/os/stats/route.ts). Fica num só lugar para
// as duas pontas nunca calcularem o custo de jeitos diferentes.

// Estado de um filtro na Revisão: se foi trocado e, se sim, qual item do
// Estoque foi usado e o preço "congelado" no momento em que a revisão foi salva.
export type RevisionFilterState = {
  status: "TROCADO" | "NAO";
  stockItemName?: string;
  unitPrice?: number;
};

// Lê o JSON salvo em WorkOrder.revisionFilters — aceita o formato antigo (só
// a string "TROCADO"/"NAO") e o novo (objeto com item do estoque e preço).
export function parseRevisionFilters(raw: string | null | undefined): Record<string, RevisionFilterState> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    const out: Record<string, RevisionFilterState> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string") {
        out[k] = { status: v === "TROCADO" ? "TROCADO" : "NAO" };
      } else if (v && typeof v === "object") {
        const o = v as any;
        out[k] = {
          status: o.status === "TROCADO" ? "TROCADO" : "NAO",
          stockItemName: typeof o.stockItemName === "string" ? o.stockItemName : undefined,
          unitPrice: typeof o.unitPrice === "number" ? o.unitPrice : undefined,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

// Custo das peças de uma OS (WorkOrderPart.unitPrice já vem "congelado" no
// momento em que a peça foi adicionada — ver app/api/os/[id]/parts/route.ts).
export function computePartsCost(parts: { unitPrice: number | null; quantity: number | null }[] | null | undefined): number {
  return (parts ?? []).reduce(
    (sum, p) => sum + (p?.unitPrice != null ? p.unitPrice * (p?.quantity ?? 1) : 0),
    0
  );
}

// Custo da revisão (filtros trocados + óleo) — só faz sentido para scope REVISAO.
export function computeRevisionCost(order: {
  revisionFilters?: string | null;
  oilCost?: number | null;
}): number {
  const filters = parseRevisionFilters(order?.revisionFilters);
  const filtersCost = Object.values(filters).reduce(
    (s, f) => s + (f.status === "TROCADO" && f.unitPrice != null ? f.unitPrice : 0),
    0
  );
  return filtersCost + (order?.oilCost ?? 0);
}

// Custo médio de combustível por km rodado no carro até o serviço (o técnico
// preenche KM inicial/final na OS; serviços no pátio ficam em branco).
export const KM_TRAVEL_COST_PER_KM = 2.5;

// Km percorridos no deslocamento — 0 quando falta KM inicial ou final (serviço
// no pátio, por exemplo), ou quando o final ficou menor que o inicial (erro
// de preenchimento não deve gerar custo negativo).
export function computeKmTraveled(order: { kmStart?: number | null; kmEnd?: number | null }): number {
  if (order?.kmStart == null || order?.kmEnd == null) return 0;
  return Math.max(0, order.kmEnd - order.kmStart);
}

export function computeTravelCost(order: { kmStart?: number | null; kmEnd?: number | null }): number {
  return computeKmTraveled(order) * KM_TRAVEL_COST_PER_KM;
}

// Custo total de uma OS: peças + revisão (quando for o caso) + deslocamento.
export function computeOrderCost(order: {
  scope?: string | null;
  parts?: { unitPrice: number | null; quantity: number | null }[] | null;
  revisionFilters?: string | null;
  oilCost?: number | null;
  kmStart?: number | null;
  kmEnd?: number | null;
}): number {
  const partsCost = computePartsCost(order?.parts);
  const revisionCost = order?.scope === "REVISAO" ? computeRevisionCost(order) : 0;
  const travelCost = computeTravelCost(order);
  return partsCost + revisionCost + travelCost;
}
