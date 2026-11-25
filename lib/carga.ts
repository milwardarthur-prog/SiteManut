// Montagem de carga de caminhão (vista de cima, tudo no chão — sem empilhar).
// Aqui fica só a lógica pura: leitura das medidas, validação de encaixe e o
// arranjo automático. A tela (app/(authenticated)/carga) só desenha e arrasta.

export type Vehicle = {
  id: string;
  name: string;
  lengthM: number; // comprimento da carroceria
  widthM: number; // largura
  heightM: number | null; // altura útil (opcional)
  capacityKg: number | null; // capacidade de carga (opcional)
};

/** Retângulo no chão da carroceria, em metros. x = ao longo do comprimento (a partir da cabine). */
export type Rect = { x: number; y: number; w: number; h: number };

/** Espaço mínimo que o arranjo automático deixa entre equipamentos (m). */
export const AUTO_GAP_M = 0.05;
const EPS = 1e-6;

/**
 * Lê uma medida em texto livre do cadastro ("1,50m ", "1,10", "2.25", "150cm")
 * e devolve metros. Valores acima de 20 são tratados como centímetros.
 */
export function parseMeters(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  const isCm = /cm\b/.test(s);
  const m = s.match(/\d+(?:[.,]\d+)?/);
  if (!m) return null;
  let n = Number(m[0].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (isCm || n > 20) n = n / 100;
  return Math.round(n * 1000) / 1000;
}

export function formatMeters(n: number): string {
  return `${n.toFixed(2).replace(".", ",")}m`;
}

export const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;

/**
 * Carroceria. `overhangM` (opcional) é quanto a carga pode passar pra fora, em
 * metros: pra trás (fundo) e pros lados. Pra frente (cabine) nunca passa.
 */
export type Bed = { lengthM: number; widthM: number; overhangM?: number };

export const insideBed = (r: Rect, bed: Bed) => {
  const o = bed.overhangM ?? 0;
  return r.x >= -EPS && r.y >= -o - EPS && r.x + r.w <= bed.lengthM + o + EPS && r.y + r.h <= bed.widthM + o + EPS;
};

/** Quanto do retângulo passa da carroceria (m): fundo e cada lado. */
export function overhangOf(r: Rect, bed: { lengthM: number; widthM: number }) {
  const rear = Math.max(0, r.x + r.w - bed.lengthM);
  const sideA = Math.max(0, -r.y);
  const sideB = Math.max(0, r.y + r.h - bed.widthM);
  return { rear, sideA, sideB, any: rear > EPS || sideA > EPS || sideB > EPS };
}

export function isValidPlacement(r: Rect, others: Rect[], bed: Bed): boolean {
  return insideBed(r, bed) && !others.some((o) => overlaps(r, o));
}

/**
 * Primeiro lugar livre pra um retângulo w×h, preenchendo a partir da cabine.
 * Testa as duas orientações (se `allowRotate`). Devolve a posição e se girou.
 */
export function findSpot(
  size: { w: number; h: number },
  placed: Rect[],
  bed: Bed,
  allowRotate = true
): { x: number; y: number; rotated: boolean } | null {
  const candidates: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  for (const p of placed) {
    candidates.push({ x: p.x + p.w + AUTO_GAP_M, y: p.y });
    candidates.push({ x: p.x, y: p.y + p.h + AUTO_GAP_M });
    candidates.push({ x: p.x + p.w + AUTO_GAP_M, y: 0 });
    candidates.push({ x: 0, y: p.y + p.h + AUTO_GAP_M });
  }
  // Da cabine pra trás, e dentro de cada faixa de x, da lateral pra outra.
  candidates.sort((a, b) => a.x - b.x || a.y - b.y);

  const orientations = allowRotate && Math.abs(size.w - size.h) > EPS ? [false, true] : [false];
  let best: { x: number; y: number; rotated: boolean } | null = null;
  for (const c of candidates) {
    for (const rotated of orientations) {
      const r: Rect = { x: c.x, y: c.y, w: rotated ? size.h : size.w, h: rotated ? size.w : size.h };
      if (isValidPlacement(r, placed, bed)) {
        if (!best || r.x < best.x - EPS || (Math.abs(r.x - best.x) < EPS && r.y < best.y)) {
          best = { x: r.x, y: r.y, rotated };
        }
      }
    }
    if (best && c.x > best.x + EPS) break; // candidatos seguintes só pioram
  }
  return best;
}

export type PackItem = { id: string; w: number; h: number; weightKg: number };
export type Placed = { id: string; x: number; y: number; rotated: boolean; w: number; h: number };

/** Uma tentativa de arranjo numa ordem dada (respeitando o limite de peso, se houver). */
function packInOrder(items: PackItem[], bed: Bed, maxWeightKg: number | null) {
  const placed: Placed[] = [];
  const notFit: PackItem[] = [];
  let weight = 0;
  for (const it of items) {
    if (maxWeightKg != null && weight + it.weightKg > maxWeightKg) {
      notFit.push(it);
      continue;
    }
    const spot = findSpot({ w: it.w, h: it.h }, placed, bed);
    if (!spot) {
      notFit.push(it);
      continue;
    }
    weight += it.weightKg;
    placed.push({
      id: it.id,
      x: spot.x,
      y: spot.y,
      rotated: spot.rotated,
      w: spot.rotated ? it.h : it.w,
      h: spot.rotated ? it.w : it.h,
    });
  }
  return { placed, notFit };
}

/**
 * Arranjo automático: tenta algumas ordens (maior área, maior comprimento, maior
 * largura, mais pesado) e fica com a que acomodou mais área. Não é ótimo —
 * encaixe de retângulos é um problema difícil — mas serve de ponto de partida.
 */
export function autoPack(items: PackItem[], bed: Bed, maxWeightKg: number | null = null) {
  // Primeiro tenta tudo dentro da carroceria; só o que sobrar usa a folga pra fora.
  const strict: Bed = { lengthM: bed.lengthM, widthM: bed.widthM };
  const orders: ((a: PackItem, b: PackItem) => number)[] = [
    (a, b) => b.w * b.h - a.w * a.h,
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h),
    (a, b) => b.weightKg - a.weightKg || b.w * b.h - a.w * a.h,
  ];
  let best: ReturnType<typeof packInOrder> | null = null;
  let bestArea = -1;
  for (const cmp of orders) {
    const result = packInOrder([...items].sort(cmp), strict, maxWeightKg);
    const area = result.placed.reduce((s, p) => s + p.w * p.h, 0);
    if (area > bestArea + EPS || (Math.abs(area - bestArea) < EPS && best && result.notFit.length < best.notFit.length)) {
      best = result;
      bestArea = area;
    }
  }
  if (!best) return { placed: [], notFit: items };

  if ((bed.overhangM ?? 0) > 0 && best.notFit.length > 0) {
    const weightOf = new Map(items.map((i) => [i.id, i.weightKg]));
    let weight = best.placed.reduce((s, p) => s + (weightOf.get(p.id) ?? 0), 0);
    const placed = [...best.placed];
    const notFit: PackItem[] = [];
    for (const it of [...best.notFit].sort((a, b) => b.w * b.h - a.w * a.h)) {
      if (maxWeightKg != null && weight + it.weightKg > maxWeightKg) {
        notFit.push(it);
        continue;
      }
      const spot = findSpot({ w: it.w, h: it.h }, placed, bed);
      if (!spot) {
        notFit.push(it);
        continue;
      }
      weight += it.weightKg;
      placed.push({
        id: it.id,
        x: spot.x,
        y: spot.y,
        rotated: spot.rotated,
        w: spot.rotated ? it.h : it.w,
        h: spot.rotated ? it.w : it.h,
      });
    }
    return { placed, notFit };
  }
  return best;
}

/** Centro de gravidade ao longo do comprimento (0 = cabine, 1 = fundo), ponderado pelo peso. */
export function centerOfGravity(
  items: { x: number; w: number; weightKg: number }[],
  bedLengthM: number
): number | null {
  const total = items.reduce((s, i) => s + i.weightKg, 0);
  if (total <= 0 || bedLengthM <= 0) return null;
  const moment = items.reduce((s, i) => s + i.weightKg * (i.x + i.w / 2), 0);
  return Math.min(1, Math.max(0, moment / total / bedLengthM));
}

// ═══ Vários veículos ═══════════════════════════════════════════════════════════

/** Um veículo da carga: carroceria (com a folga pra fora que o usuário liberou) e limite de peso. */
export type SlotBed = { key: string; bed: Bed; maxWeightKg: number | null };
export type Assigned = { slotKey: string; x: number; y: number; rotated: boolean; w: number; h: number };
/**
 * FILL: enche um veículo por vez (usa o mínimo de veículos).
 * BALANCE: reparte entre todos, buscando deixar o peso parecido em cada um.
 */
export type DistributeMode = "FILL" | "BALANCE";

type Acc = { slot: SlotBed; strict: Bed; placed: Placed[]; weight: number };

function findPlace(acc: Acc, it: PackItem, bed: Bed): Placed | null {
  const cap = acc.slot.maxWeightKg;
  if (cap != null && acc.weight + it.weightKg > cap + EPS) return null;
  const spot = findSpot({ w: it.w, h: it.h }, acc.placed, bed);
  if (!spot) return null;
  return {
    id: it.id,
    x: spot.x,
    y: spot.y,
    rotated: spot.rotated,
    w: spot.rotated ? it.h : it.w,
    h: spot.rotated ? it.w : it.h,
  };
}

const commit = (acc: Acc, p: Placed, it: PackItem) => {
  acc.placed.push(p);
  acc.weight += it.weightKg;
};

const accArea = (a: Acc) => a.slot.bed.lengthM * a.slot.bed.widthM;
const accLoad = (a: Acc) => {
  const cap = a.slot.maxWeightKg;
  // sem capacidade informada, compara por kg/m² (referência arbitrária só pra equilibrar)
  return cap ? a.weight / cap : a.weight / (accArea(a) * 300);
};
/** Quão cheio o veículo ficaria com o item (menor = mais folgado): peso primeiro, piso no desempate. */
function scoreWith(acc: Acc, it: PackItem): number {
  const cap = acc.slot.maxWeightKg;
  const w = acc.weight + it.weightKg;
  const wr = cap ? w / cap : w / (accArea(acc) * 300);
  const used = acc.placed.reduce((s, p) => s + p.w * p.h, 0) + it.w * it.h;
  return wr + 0.001 * (used / accArea(acc));
}

/** Coloca `it` no melhor veículo segundo o modo; `useOverhang` libera a folga pra fora da carroceria. */
function placeSomewhere(accs: Acc[], it: PackItem, mode: DistributeMode, useOverhang: boolean): boolean {
  let bestAcc: Acc | null = null;
  let bestP: Placed | null = null;
  let bestScore = Infinity;
  for (const acc of accs) {
    if (useOverhang && (acc.slot.bed.overhangM ?? 0) <= 0) continue;
    const p = findPlace(acc, it, useOverhang ? acc.slot.bed : acc.strict);
    if (!p) continue;
    if (mode === "FILL") {
      commit(acc, p, it);
      return true;
    }
    const sc = scoreWith(acc, it);
    if (sc < bestScore - 1e-9) {
      bestScore = sc;
      bestAcc = acc;
      bestP = p;
    }
  }
  if (bestAcc && bestP) {
    commit(bestAcc, bestP, it);
    return true;
  }
  return false;
}

function runOrder(order: PackItem[], slots: SlotBed[], mode: DistributeMode) {
  const accs: Acc[] = slots.map((slot) => ({
    slot,
    strict: { lengthM: slot.bed.lengthM, widthM: slot.bed.widthM },
    placed: [],
    weight: 0,
  }));
  // 1ª passada: tudo dentro das carrocerias. 2ª: o que sobrou usa a folga pra fora, nos veículos que liberaram.
  let rest = order.filter((it) => !placeSomewhere(accs, it, mode, false));
  if (rest.length > 0) {
    rest = [...rest].sort((a, b) => b.w * b.h - a.w * a.h).filter((it) => !placeSomewhere(accs, it, mode, true));
  }
  const notFitArea = rest.reduce((s, it) => s + it.w * it.h, 0);
  const used = accs.filter((a) => a.placed.length > 0).length;
  const peak = accs.reduce((m, a) => Math.max(m, accLoad(a)), 0);
  return { accs, notFit: rest, notFitArea, used, peak };
}

type RunResult = ReturnType<typeof runOrder>;
/** menor = melhor: o que sobrou, depois (conforme o modo) menos veículos ou menor pico de peso. */
function compareRuns(a: RunResult, b: RunResult, mode: DistributeMode): number {
  if (a.notFit.length !== b.notFit.length) return a.notFit.length - b.notFit.length;
  if (Math.abs(a.notFitArea - b.notFitArea) > 1e-6) return a.notFitArea - b.notFitArea;
  if (mode === "FILL") return a.used - b.used;
  return a.peak - b.peak;
}

/** Gerador pseudo-aleatório simples (determinístico por semente), pra "outra sugestão" ser reproduzível. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Reparte os itens entre vários veículos. `variant` 0 = melhor das ordens clássicas
 * (maior área, maior comprimento, maior largura, mais pesado); `variant` > 0 testa
 * ordens embaralhadas e sorteia, entre as melhores, uma diferente — "outra sugestão".
 */
export function distributePack(
  items: PackItem[],
  slots: SlotBed[],
  mode: DistributeMode,
  variant = 0
): { assigned: Map<string, Assigned>; notFit: PackItem[] } {
  if (slots.length === 0) return { assigned: new Map(), notFit: items };

  const byArea = (a: PackItem, b: PackItem) => b.w * b.h - a.w * a.h;
  const orders: PackItem[][] = [
    [...items].sort(byArea),
    [...items].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h)),
    [...items].sort((a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h)),
    [...items].sort((a, b) => b.weightKg - a.weightKg || byArea(a, b)),
  ];
  if (variant > 0) {
    const rnd = mulberry32(variant * 7919 + (mode === "FILL" ? 11 : 23));
    for (let n = 0; n < 40; n++) {
      // maior primeiro, mas com a ordem "sacudida" — muda o arranjo sem virar bagunça
      const noise = new Map(items.map((i) => [i.id, i.w * i.h * (0.5 + rnd())]));
      orders.push([...items].sort((a, b) => (noise.get(b.id) ?? 0) - (noise.get(a.id) ?? 0)));
    }
  }

  const runs = orders.map((o) => runOrder(o, slots, mode));
  let pool = runs;
  if (variant > 0) {
    // entre as melhores (empate), escolhe uma ao acaso
    const best = runs.reduce((b, r) => (compareRuns(r, b, mode) < 0 ? r : b), runs[0]);
    pool = runs.filter((r) => compareRuns(r, best, mode) === 0);
    const rnd = mulberry32(variant * 104729 + 5);
    pool = [pool[Math.floor(rnd() * pool.length)]];
  } else {
    pool = [runs.reduce((b, r) => (compareRuns(r, b, mode) < 0 ? r : b), runs[0])];
  }

  const chosen = pool[0];
  const assigned = new Map<string, Assigned>();
  for (const acc of chosen.accs) {
    for (const p of acc.placed) {
      assigned.set(p.id, { slotKey: acc.slot.key, x: p.x, y: p.y, rotated: p.rotated, w: p.w, h: p.h });
    }
  }
  return { assigned, notFit: chosen.notFit };
}
