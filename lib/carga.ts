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
