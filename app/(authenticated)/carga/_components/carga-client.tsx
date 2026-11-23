"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowUpFromLine, ClipboardCopy, Loader2, Pencil, Plus, RotateCw, Search, Trash2, Truck, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  autoPack,
  centerOfGravity,
  findSpot,
  isValidPlacement,
  overhangOf,
  type Bed,
  type Rect,
  type Vehicle,
} from "@/lib/carga";

type Eq = {
  id: string;
  equipmentNumber: string;
  name: string;
  model: string | null;
  leaseStatus: "DISPONIVEL" | "LOCADO" | "MANUTENCAO" | null; // null: item extra (ex.: bacia)
  client: string | null;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  weightKg: number | null;
};
// x/y = null: escolhido pra carga mas ainda sem lugar na carroceria.
// inBasin: o gerador está dentro de uma bacia (uid do item-bacia); ele anda, gira e
// pesa junto com ela, e não ocupa piso próprio. inRot: gerador girado dentro da bacia.
type Item = { uid: string; eqId: string; x: number | null; y: number | null; rotated: boolean; inBasin?: string; inRot?: boolean };

const fmt = (n: number, d = 2) => n.toFixed(d).replace(".", ",");
const fmtKg = (n: number) => `${Math.round(n).toLocaleString("pt-BR")} kg`;
const SNAP_M = 0.1;
const STATUS_LABEL = { DISPONIVEL: "Disponível", LOCADO: "Locado", MANUTENCAO: "Manutenção" } as const;
const STATUS_DOT = { DISPONIVEL: "bg-green-500", LOCADO: "bg-blue-500", MANUTENCAO: "bg-amber-500" } as const;

const hasDims = (e: Eq) => e.lengthM != null && e.widthM != null;
const isBasinEq = (e: Eq | undefined) => !!e && e.equipmentNumber.startsWith("BC");
const FIT_EPS = 1e-6;
/** Orientação do gerador dentro da bacia: false = alinhado, true = girado 90°, null = não cabe. */
function basinFit(g: Eq, b: Eq): boolean | null {
  if (!hasDims(g) || !hasDims(b)) return null;
  if (g.lengthM! <= b.lengthM! + FIT_EPS && g.widthM! <= b.widthM! + FIT_EPS) return false;
  if (g.widthM! <= b.lengthM! + FIT_EPS && g.lengthM! <= b.widthM! + FIT_EPS) return true;
  return null;
}
const itemSize = (e: Eq, rotated: boolean) =>
  rotated ? { w: e.widthM as number, h: e.lengthM as number } : { w: e.lengthM as number, h: e.widthM as number };

function itemColor(code: string): string {
  if (code.startsWith("BC")) return "#0d9488";
  if (code.startsWith("MTS")) return "#ea580c";
  if (code.startsWith("TL")) return "#7c3aed";
  return "#2563eb";
}

export default function CargaClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [equipments, setEquipments] = useState<Eq[]>([]);
  const [vehicleId, setVehicleId] = useState<string>("");
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyWithDims, setOnlyWithDims] = useState(false);
  // Carga pode passar pra fora da carroceria (não é o ideal, mas às vezes acontece).
  const [overhangOn, setOverhangOn] = useState(false);
  const [overhangStr, setOverhangStr] = useState("1,00");
  const [vehicleDialog, setVehicleDialog] = useState(false);
  const [editEqId, setEditEqId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/carga");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao carregar");
        return;
      }
      setVehicles(data.vehicles);
      setEquipments(data.equipments);
      setVehicleId((cur) => (data.vehicles.some((v: Vehicle) => v.id === cur) ? cur : data.vehicles[0]?.id ?? ""));
      setError(null);
    } catch {
      setError("Falha de conexão.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const eqById = useMemo(() => new Map(equipments.map((e) => [e.id, e])), [equipments]);
  const overhangM = useMemo(() => {
    if (!overhangOn) return 0;
    const n = Number(overhangStr.replace(",", "."));
    return Number.isFinite(n) ? Math.min(3, Math.max(0, n)) : 0;
  }, [overhangOn, overhangStr]);
  const bed: Bed | null = useMemo(
    () => (vehicle ? { lengthM: vehicle.lengthM, widthM: vehicle.widthM, overhangM } : null),
    [vehicle, overhangM]
  );

  // ── retângulos dos itens já posicionados ──
  const rectOf = useCallback(
    (it: Item): Rect | null => {
      const e = eqById.get(it.eqId);
      if (!e || !hasDims(e) || it.x == null || it.y == null) return null;
      const { w, h } = itemSize(e, it.rotated);
      return { x: it.x, y: it.y, w, h };
    },
    [eqById]
  );
  const placedRects = useCallback(
    (exceptUid?: string) =>
      items.filter((i) => i.uid !== exceptUid).map(rectOf).filter((r): r is Rect => r !== null),
    [items, rectOf]
  );

  // ── largura disponível → escala (px por metro) ──
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(800);
  useEffect(() => {
    if (!boxRef.current) return;
    const ro = new ResizeObserver((entries) => setBoxW(entries[0].contentRect.width));
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [vehicle]);
  const scale = bed ? Math.max(14, Math.min(160, (boxW - 40) / (bed.lengthM + overhangM))) : 40;

  // ── arrastar ──
  const dragRef = useRef<{ uid: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const [drag, setDrag] = useState<{ uid: string; x: number; y: number } | null>(null);

  const snapped = useCallback(
    (uid: string, x: number, y: number, w: number, h: number) => {
      if (!bed) return { x, y };
      const others = placedRects(uid);
      const near = (value: number, targets: number[]) => {
        let best = value;
        let bestD = SNAP_M;
        for (const t of targets) {
          const d = Math.abs(t - value);
          if (d < bestD) {
            bestD = d;
            best = t;
          }
        }
        return best;
      };
      const xs = [0, bed.lengthM - w, ...others.flatMap((o) => [o.x + o.w, o.x - w, o.x, o.x + o.w - w])];
      const ys = [0, bed.widthM - h, ...others.flatMap((o) => [o.y + o.h, o.y - h, o.y, o.y + o.h - h])];
      return { x: near(x, xs), y: near(y, ys) };
    },
    [bed, placedRects]
  );

  const onPointerDown = (e: React.PointerEvent, it: Item) => {
    if (it.x == null || it.y == null) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { uid: it.uid, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, moved: false };
    setSelected(it.uid);
  };
  const onPointerMove = (e: React.PointerEvent, it: Item) => {
    const d = dragRef.current;
    const eq = eqById.get(it.eqId);
    if (!d || d.uid !== it.uid || !eq || !hasDims(eq)) return;
    const dx = (e.clientX - d.sx) / scale;
    const dy = (e.clientY - d.sy) / scale;
    if (!d.moved && Math.hypot(dx, dy) * scale < 3) return;
    d.moved = true;
    const { w, h } = itemSize(eq, it.rotated);
    setDrag({ uid: it.uid, ...snapped(it.uid, d.ox + dx, d.oy + dy, w, h) });
  };
  const onPointerUp = (it: Item) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.uid !== it.uid || !drag || drag.uid !== it.uid || !bed) {
      setDrag(null);
      return;
    }
    const eq = eqById.get(it.eqId);
    if (eq && hasDims(eq)) {
      const { w, h } = itemSize(eq, it.rotated);
      const r = { x: drag.x, y: drag.y, w, h };
      // soltou o gerador com o centro em cima de uma bacia: entra na bacia
      if (!isBasinEq(eq)) {
        const cx = r.x + w / 2;
        const cy = r.y + h / 2;
        const target = items.find((b) => {
          const be = eqById.get(b.eqId);
          const br = rectOf(b);
          return b.uid !== it.uid && isBasinEq(be) && br && cx >= br.x && cx <= br.x + br.w && cy >= br.y && cy <= br.y + br.h;
        });
        if (target) {
          nestInto(it, eq, target.uid);
          setDrag(null);
          return;
        }
      }
      if (isValidPlacement(r, placedRects(it.uid), bed)) {
        setItems((all) => all.map((i) => (i.uid === it.uid ? { ...i, x: drag.x, y: drag.y } : i)));
      } else {
        toast.error("Aí não dá: bate em outro equipamento ou passa da carroceria.");
      }
    }
    setDrag(null);
  };

  // ── ações ──
  const rotate = useCallback(
    (rawUid: string) => {
      // gerador dentro da bacia: quem gira é a bacia (levando o gerador junto)
      const uid = items.find((i) => i.uid === rawUid)?.inBasin ?? rawUid;
      const it = items.find((i) => i.uid === uid);
      const eq = it && eqById.get(it.eqId);
      if (!it || !eq || !hasDims(eq) || !bed) return;
      if (it.x == null || it.y == null) {
        setItems((all) => all.map((i) => (i.uid === uid ? { ...i, rotated: !i.rotated } : i)));
        return;
      }
      const cur = itemSize(eq, it.rotated);
      const next = itemSize(eq, !it.rotated);
      // gira em torno do centro e encosta de volta dentro da carroceria
      const x = Math.min(Math.max(0, it.x + (cur.w - next.w) / 2), Math.max(0, bed.lengthM - next.w));
      const y = Math.min(Math.max(0, it.y + (cur.h - next.h) / 2), Math.max(0, bed.widthM - next.h));
      if (isValidPlacement({ x, y, ...next }, placedRects(uid), bed)) {
        setItems((all) => all.map((i) => (i.uid === uid ? { ...i, x, y, rotated: !i.rotated } : i)));
      } else {
        toast.error("Não cabe girado nesse lugar. Mova ou tire o vizinho antes.");
      }
    },
    [items, eqById, bed, placedRects]
  );

  const removeItem = useCallback((uid: string) => {
    // se tirou uma bacia, o gerador que estava nela vira "ficou de fora" (não some sem avisar)
    setItems((all) =>
      all.filter((i) => i.uid !== uid).map((i) => (i.inBasin === uid ? { ...i, inBasin: undefined, inRot: undefined } : i))
    );
    setSelected((s) => (s === uid ? null : s));
  }, []);

  // ── gerador sobre a bacia ──
  const nestInto = (genItem: Item | null, genEq: Eq, basinUid: string): boolean => {
    const basin = items.find((i) => i.uid === basinUid);
    const be = basin && eqById.get(basin.eqId);
    if (!basin || !be || !isBasinEq(be)) return false;
    if (isBasinEq(genEq)) {
      toast.error("Só gerador vai em cima de bacia.");
      return false;
    }
    if (items.some((i) => i.inBasin === basinUid && i.uid !== genItem?.uid)) {
      toast.error(`A bacia ${be.equipmentNumber} já está com um gerador.`);
      return false;
    }
    if (!hasDims(be) || !hasDims(genEq)) {
      toast.error("Faltam as medidas da bacia ou do gerador.");
      return false;
    }
    const fit = basinFit(genEq, be);
    if (fit === null) {
      toast.error(
        `${genEq.equipmentNumber} (${fmt(genEq.lengthM!)} × ${fmt(genEq.widthM!)} m) não cabe dentro da bacia ${be.equipmentNumber} (${fmt(be.lengthM!)} × ${fmt(be.widthM!)} m).`
      );
      return false;
    }
    if (genItem) {
      setItems((all) => all.map((i) => (i.uid === genItem.uid ? { ...i, x: null, y: null, rotated: false, inBasin: basinUid, inRot: fit } : i)));
    } else {
      setItems((all) => [...all, { uid: `${genEq.id}-${Date.now()}`, eqId: genEq.id, x: null, y: null, rotated: false, inBasin: basinUid, inRot: fit }]);
    }
    setSelected(basinUid);
    return true;
  };

  // tira o gerador de cima da bacia e procura outro lugar pra ele na carroceria
  const unnest = (uid: string) => {
    const it = items.find((i) => i.uid === uid);
    const eq = it && eqById.get(it.eqId);
    if (!it || !eq || !hasDims(eq) || !bed) return;
    const size = { w: eq.lengthM as number, h: eq.widthM as number };
    const spot =
      findSpot(size, placedRects(), { lengthM: bed.lengthM, widthM: bed.widthM }) ??
      (overhangM > 0 ? findSpot(size, placedRects(), bed) : null);
    setItems((all) =>
      all.map((i) =>
        i.uid === uid
          ? { ...i, inBasin: undefined, inRot: undefined, x: spot?.x ?? null, y: spot?.y ?? null, rotated: spot?.rotated ?? false }
          : i
      )
    );
    if (!spot) toast.error(`${eq.equipmentNumber} não coube na carroceria sozinho. Ficou em "Ficaram de fora".`);
    setSelected(uid);
  };

  // atalhos: R gira, Delete tira o equipamento selecionado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (!selected || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "r" || e.key === "R") rotate(selected);
      if (e.key === "Delete" || e.key === "Backspace") removeItem(selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, rotate, removeItem]);

  // Ao desligar, o que estava passando pra fora perde o lugar (volta pra "ficaram de fora").
  const toggleOverhang = (on: boolean) => {
    setOverhangOn(on);
    if (on || !vehicle) return;
    const strict: Bed = { lengthM: vehicle.lengthM, widthM: vehicle.widthM };
    // calculado fora do setItems pra não contar duas vezes (o React pode repetir a atualização)
    let lost = 0;
    const next = items.map((i) => {
      const r = rectOf(i);
      if (r && !isValidPlacement(r, [], strict)) {
        lost++;
        return { ...i, x: null, y: null };
      }
      return i;
    });
    setItems(next);
    if (lost > 0) toast.info(`${lost} equipamento(s) estavam fora da carroceria e saíram da carga. Use "Organizar".`);
  };

  const addEquipment = (eq: Eq) => {
    if (!bed) {
      toast.error("Cadastre um veículo primeiro.");
      return;
    }
    if (!hasDims(eq)) {
      setEditEqId(eq.id);
      toast.info("Informe as medidas deste equipamento para colocá-lo na carga.");
      return;
    }
    const uid = `${eq.id}-${Date.now()}`;
    const size = { w: eq.lengthM as number, h: eq.widthM as number };
    const spot =
      findSpot(size, placedRects(), { lengthM: bed.lengthM, widthM: bed.widthM }) ??
      (overhangM > 0 ? findSpot(size, placedRects(), bed) : null);
    if (!spot) {
      setItems((all) => [...all, { uid, eqId: eq.id, x: null, y: null, rotated: false }]);
      toast.error(`${eq.equipmentNumber} não coube. Ficou em "Sem espaço". Tente "Organizar" ou outro veículo.`);
      return;
    }
    setItems((all) => [...all, { uid, eqId: eq.id, x: spot.x, y: spot.y, rotated: spot.rotated }]);
    setSelected(uid);
  };

  const organize = () => {
    if (!bed) return;
    // bacia com gerador dentro = uma unidade só (ocupa a bacia; o peso é a soma)
    const nestedWeight = new Map<string, number>();
    for (const i of items) {
      if (i.inBasin) nestedWeight.set(i.inBasin, (nestedWeight.get(i.inBasin) ?? 0) + (eqById.get(i.eqId)?.weightKg ?? 0));
    }
    const pack = items
      .filter((i) => !i.inBasin)
      .map((i) => ({ i, e: eqById.get(i.eqId) }))
      .filter((p): p is { i: Item; e: Eq } => !!p.e && hasDims(p.e))
      .map(({ i, e }) => ({
        id: i.uid,
        w: e.lengthM as number,
        h: e.widthM as number,
        weightKg: (e.weightKg ?? 0) + (nestedWeight.get(i.uid) ?? 0),
      }));
    const result = autoPack(pack, bed, vehicle?.capacityKg ?? null);
    const byId = new Map(result.placed.map((p) => [p.id, p]));
    setItems((all) =>
      all.map((i) => {
        if (i.inBasin) return i;
        const p = byId.get(i.uid);
        return p ? { ...i, x: p.x, y: p.y, rotated: p.rotated } : { ...i, x: null, y: null, rotated: false };
      })
    );
    if (result.notFit.length > 0) {
      toast.error(`${result.notFit.length} equipamento(s) ficaram de fora: sem espaço ou acima da capacidade do veículo.`);
    }
    else toast.success("Carga organizada.");
  };

  // trocar de veículo: o que deixou de caber vai pra "Sem espaço"
  const changeVehicle = (id: string) => {
    setVehicleId(id);
    const v = vehicles.find((x) => x.id === id);
    if (!v) return;
    const nb: Bed = { lengthM: v.lengthM, widthM: v.widthM, overhangM };
    let lost = 0;
    const kept: Rect[] = [];
    const next = items.map((i) => {
      const r = rectOf(i);
      if (r && isValidPlacement(r, kept, nb)) {
        kept.push(r);
        return i;
      }
      if (r) lost++;
      return { ...i, x: null, y: null };
    });
    setItems(next);
    if (lost > 0) toast.info(`${lost} equipamento(s) não cabem na posição atual no novo veículo. Use "Organizar".`);
  };

  // ── resumo ──
  const summary = useMemo(() => {
    if (!bed || !vehicle) return null;
    const placed = items
      .map((i) => ({ i, e: eqById.get(i.eqId), r: rectOf(i) }))
      .filter((p): p is { i: Item; e: Eq; r: Rect } => !!p.e && !!p.r);
    // gerador dentro de bacia: conta peso, centro de gravidade e altura, mas usa o piso da bacia
    const nestedPlaced = items
      .filter((i) => i.inBasin)
      .map((i) => {
        const parent = items.find((p) => p.uid === i.inBasin);
        const pr = parent ? rectOf(parent) : null;
        return { i, e: eqById.get(i.eqId), r: pr, basinEq: parent ? eqById.get(parent.eqId) : undefined };
      })
      .filter((p): p is { i: Item; e: Eq; r: Rect; basinEq: Eq | undefined } => !!p.e && !!p.r);
    const pending = items.filter((i) => i.x == null && !i.inBasin);
    const area = placed.reduce((s, p) => s + p.r.w * p.r.h, 0);
    const weighed = [...placed, ...nestedPlaced];
    const weight = weighed.reduce((s, p) => s + (p.e.weightKg ?? 0), 0);
    const noWeight = weighed.filter((p) => p.e.weightKg == null).length;
    const tooTall = vehicle.heightM
      ? [
          ...placed.filter((p) => p.e.heightM != null && p.e.heightM > vehicle.heightM!),
          // gerador sobre bacia: soma a altura da bacia (se conhecida)
          ...nestedPlaced.filter((p) => p.e.heightM != null && p.e.heightM + (p.basinEq?.heightM ?? 0) > vehicle.heightM!),
        ]
      : [];
    const cg = centerOfGravity(
      weighed.map((p) => ({ x: p.r.x, w: p.r.w, weightKg: p.e.weightKg ?? 0 })),
      bed.lengthM
    );
    const overhanging = placed
      .map((p) => ({ p, oh: overhangOf(p.r, bed) }))
      .filter((x) => x.oh.any)
      .map(({ p, oh }) => ({
        code: p.e.equipmentNumber + nestedPlaced.filter((n) => n.i.inBasin === p.i.uid).map((n) => ` + ${n.e.equipmentNumber}`).join(""),
        text: [
          oh.rear > 0.004 ? `${fmt(oh.rear)} m atrás` : "",
          oh.sideA > 0.004 ? `${fmt(oh.sideA)} m pra um lado` : "",
          oh.sideB > 0.004 ? `${fmt(oh.sideB)} m pro outro lado` : "",
        ]
          .filter(Boolean)
          .join(" e "),
      }));
    return { placed, nestedPlaced, pending, area, areaPct: area / (bed.lengthM * bed.widthM), weight, noWeight, tooTall, cg, overhanging };
  }, [items, bed, vehicle, eqById, rectOf]);

  const copySummary = async () => {
    if (!summary || !vehicle) return;
    const lines = [
      `Carga — ${vehicle.name} (${fmt(vehicle.lengthM)} × ${fmt(vehicle.widthM)} m)`,
      ...summary.placed.map(
        (p) =>
          `• ${p.e.equipmentNumber}${p.e.weightKg != null ? ` — ${fmtKg(p.e.weightKg)}` : ""} (${fmt(p.r.w)} × ${fmt(p.r.h)} m)`
      ),
      ...summary.nestedPlaced.map(
        (p) =>
          `• ${p.e.equipmentNumber}${p.e.weightKg != null ? ` — ${fmtKg(p.e.weightKg)}` : ""} (sobre a bacia ${p.basinEq?.equipmentNumber ?? ""})`
      ),
      `Peso total: ${fmtKg(summary.weight)}${vehicle.capacityKg ? ` de ${fmtKg(vehicle.capacityKg)}` : ""}`,
      `Ocupação do piso: ${Math.round(summary.areaPct * 100)}%`,
      ...(summary.overhanging.length > 0
        ? [`ATENÇÃO — fora da carroceria: ${summary.overhanging.map((o) => `${o.code} (${o.text})`).join("; ")}`]
        : []),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Resumo da carga copiado.");
    } catch {
      toast.error("Não consegui copiar.");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return equipments.filter(
      (e) =>
        (!onlyWithDims || hasDims(e)) &&
        (!q || e.equipmentNumber.toLowerCase().includes(q) || (e.model ?? "").toLowerCase().includes(q) || (e.client ?? "").toLowerCase().includes(q))
    );
  }, [equipments, search, onlyWithDims]);
  const inLoad = useMemo(() => new Set(items.map((i) => i.eqId)), [items]);
  const withDimsCount = equipments.filter(hasDims).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 p-4 text-sm">{error}</div>;

  const overCapacity = !!(summary && vehicle?.capacityKg && summary.weight > vehicle.capacityKg);

  // bacia relacionada ao item selecionado (a própria bacia, ou a bacia que leva o gerador selecionado)
  const selItem = items.find((i) => i.uid === selected) ?? null;
  const selEq = selItem ? eqById.get(selItem.eqId) : undefined;
  const basinItem = selItem ? (selItem.inBasin ? items.find((i) => i.uid === selItem.inBasin) : isBasinEq(selEq) ? selItem : null) ?? null : null;
  const basinEq = basinItem ? eqById.get(basinItem.eqId) : undefined;
  const nestedItem = basinItem ? items.find((i) => i.inBasin === basinItem.uid) ?? null : null;
  const nestCandidates =
    basinEq && isBasinEq(basinEq) && !nestedItem
      ? equipments.filter((g) => !isBasinEq(g) && hasDims(g) && basinFit(g, basinEq) !== null)
      : [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-green-500" /> Montar carga
          </h1>
          <p className="text-sm text-gray-500">
            Escolha o veículo, adicione os equipamentos e arraste para encaixar. Vista de cima, tudo no chão.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Veículo</label>
            <select
              className="border rounded-md px-3 py-2 text-sm bg-white h-10 min-w-[200px]"
              value={vehicleId}
              onChange={(e) => changeVehicle(e.target.value)}
              disabled={vehicles.length === 0}
            >
              {vehicles.length === 0 && <option value="">Nenhum veículo cadastrado</option>}
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({fmt(v.lengthM)} × {fmt(v.widthM)} m)
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" className="gap-1" onClick={() => setVehicleDialog(true)}>
            <Pencil className="w-4 h-4" /> Veículos
          </Button>
        </div>
      </div>

      {!vehicle ? (
        <div className="rounded-lg border bg-white p-10 text-center">
          <Truck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-600 mb-3">Cadastre o primeiro veículo, com as medidas da carroceria, para começar.</p>
          <Button className="bg-green-500 hover:bg-green-600" onClick={() => setVehicleDialog(true)}>
            Cadastrar veículo
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* ── lista de equipamentos ── */}
          <div className="rounded-lg border bg-white flex flex-col lg:h-[78vh] h-[50vh]">
            <div className="p-3 border-b space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input className="pl-9" placeholder="Buscar equipamento ou cliente" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={onlyWithDims} onChange={(e) => setOnlyWithDims(e.target.checked)} />
                Só com medidas ({withDimsCount} de {equipments.length})
              </label>
            </div>
            <div className="overflow-y-auto divide-y flex-1">
              {filtered.map((e) => {
                const used = inLoad.has(e.id);
                return (
                  <div key={e.id} className="px-3 py-2 flex items-center gap-2 hover:bg-gray-50">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${e.leaseStatus ? STATUS_DOT[e.leaseStatus] : "bg-teal-500"}`}
                      title={e.leaseStatus ? STATUS_LABEL[e.leaseStatus] : "Bacia / item extra"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 font-mono truncate">{e.equipmentNumber}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {hasDims(e) ? `${fmt(e.lengthM!)} × ${fmt(e.widthM!)} m` : <span className="text-amber-600">sem medidas</span>}
                        {" · "}
                        {e.weightKg != null ? fmtKg(e.weightKg) : <span className="text-amber-600">sem peso</span>}
                        {e.client ? ` · ${e.client}` : ""}
                      </div>
                    </div>
                    <button className="p-1.5 rounded text-gray-400 hover:bg-gray-200" title="Medidas e peso" onClick={() => setEditEqId(e.id)}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    {used ? (
                      <span className="text-xs text-green-600 font-medium px-1">na carga</span>
                    ) : (
                      <button className="p-1.5 rounded bg-green-500 text-white hover:bg-green-600" title="Adicionar à carga" onClick={() => addEquipment(e)}>
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && <div className="p-6 text-center text-sm text-gray-400">Nenhum equipamento encontrado.</div>}
            </div>
          </div>

          {/* ── carroceria ── */}
          <div className="space-y-3 min-w-0">
            <div className="rounded-lg border bg-white p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <div className="text-sm text-gray-600">
                  <b>{vehicle.name}</b> · carroceria {fmt(vehicle.lengthM)} × {fmt(vehicle.widthM)} m
                  {vehicle.heightM ? ` · altura ${fmt(vehicle.heightM)} m` : ""}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="gap-1" disabled={!selected} onClick={() => selected && rotate(selected)}>
                    <RotateCw className="w-4 h-4" /> Girar 90°
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" disabled={!selected} onClick={() => selected && removeItem(selected)}>
                    <Trash2 className="w-4 h-4" /> Tirar
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1" disabled={!nestedItem} onClick={() => nestedItem && unnest(nestedItem.uid)}>
                    <ArrowUpFromLine className="w-4 h-4" /> Tirar da bacia
                  </Button>
                  <Button size="sm" className="bg-green-500 hover:bg-green-600 gap-1" disabled={items.length === 0} onClick={organize}>
                    <Wand2 className="w-4 h-4" /> Organizar
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1 text-gray-500" disabled={items.length === 0} onClick={() => { setItems([]); setSelected(null); }}>
                    <X className="w-4 h-4" /> Limpar
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap mb-2 text-sm">
                <label className="inline-flex items-center gap-2 text-gray-700">
                  <input type="checkbox" checked={overhangOn} onChange={(e) => toggleOverhang(e.target.checked)} />
                  Permitir sair da carroceria
                </label>
                {overhangOn && (
                  <label className="inline-flex items-center gap-1 text-gray-600">
                    até
                    <Input className="w-20 h-8" inputMode="decimal" value={overhangStr} onChange={(e) => setOverhangStr(e.target.value)} />
                    m (atrás e nas laterais)
                  </label>
                )}
              </div>

              {basinEq && basinItem && isBasinEq(basinEq) && (
                <div className="flex items-center gap-2 flex-wrap mb-2 text-sm bg-teal-50 border border-teal-200 rounded px-2 py-1.5">
                  <span className="text-teal-900">
                    Bacia <b>{basinEq.equipmentNumber}</b> ({fmt(basinEq.lengthM ?? 0)} × {fmt(basinEq.widthM ?? 0)} m)
                  </span>
                  {nestedItem ? (
                    <span className="text-teal-900">
                      · gerador em cima: <b>{eqById.get(nestedItem.eqId)?.equipmentNumber}</b>
                    </span>
                  ) : nestCandidates.length > 0 ? (
                    <select
                      className="border rounded-md px-2 py-1 text-sm bg-white"
                      value=""
                      onChange={(e) => {
                        const g = eqById.get(e.target.value);
                        if (g) nestInto(items.find((i) => i.eqId === g.id) ?? null, g, basinItem.uid);
                      }}
                    >
                      <option value="">Colocar gerador nesta bacia…</option>
                      {nestCandidates.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.equipmentNumber} ({fmt(g.lengthM!)} × {fmt(g.widthM!)} m)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-teal-800">Nenhum gerador cadastrado cabe nesta bacia (ou faltam medidas).</span>
                  )}
                </div>
              )}

              <div ref={boxRef} className="w-full overflow-x-auto">
                <div
                  className="flex items-stretch"
                  style={{ padding: `${overhangM * scale}px ${overhangM * scale}px ${overhangM * scale}px 0` }}
                >
                  <div className="flex items-center justify-center text-[10px] font-semibold text-gray-400 tracking-widest [writing-mode:vertical-rl] rotate-180 pr-1">
                    CABINE
                  </div>
                  <div
                    className="relative border-2 border-gray-700 bg-gray-50 shrink-0"
                    style={{
                      width: vehicle.lengthM * scale,
                      height: vehicle.widthM * scale,
                      backgroundImage:
                        "linear-gradient(to right, rgba(0,0,0,.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.07) 1px, transparent 1px)",
                      backgroundSize: `${scale}px ${scale}px`,
                    }}
                    onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}
                  >
                    {overhangM > 0 && (
                      <div
                        className="absolute border-2 border-dashed border-amber-400 bg-amber-50/40 pointer-events-none"
                        style={{
                          left: -2,
                          top: -overhangM * scale - 2,
                          right: -overhangM * scale - 2,
                          bottom: -overhangM * scale - 2,
                        }}
                        title={`Folga permitida pra fora: ${fmt(overhangM)} m`}
                      />
                    )}
                    {summary?.cg != null && (
                      <div
                        className="absolute top-0 bottom-0 border-l-2 border-dashed border-rose-500 pointer-events-none"
                        style={{ left: summary.cg * vehicle.lengthM * scale }}
                        title="Centro de gravidade (pelo peso informado)"
                      />
                    )}
                    {items.map((it) => {
                      const e = eqById.get(it.eqId);
                      const base = rectOf(it);
                      if (!e || !base || !bed) return null;
                      const dragging = drag?.uid === it.uid;
                      const r = dragging ? { ...base, x: drag!.x, y: drag!.y } : base;
                      const valid = isValidPlacement(r, placedRects(it.uid), bed);
                      const tall = !!(vehicle.heightM && e.heightM != null && e.heightM > vehicle.heightM);
                      const out = overhangOf(r, bed).any;
                      const nestedHere = items.find((x) => x.inBasin === it.uid);
                      const ne = nestedHere ? eqById.get(nestedHere.eqId) : undefined;
                      return (
                        <div
                          key={it.uid}
                          onPointerDown={(ev) => onPointerDown(ev, it)}
                          onPointerMove={(ev) => onPointerMove(ev, it)}
                          onPointerUp={() => onPointerUp(it)}
                          onDoubleClick={() => rotate(it.uid)}
                          className={`absolute rounded-sm text-white select-none overflow-hidden flex flex-col items-center ${
                            ne ? "justify-start" : "justify-center"
                          } text-center leading-tight ${
                            dragging ? "cursor-grabbing z-20 opacity-90" : "cursor-grab"
                          } ${selected === it.uid ? "ring-2 ring-offset-1 ring-gray-900 z-10" : ""}`}
                          style={{
                            left: r.x * scale,
                            top: r.y * scale,
                            width: r.w * scale,
                            height: r.h * scale,
                            background: valid ? itemColor(e.equipmentNumber) : "#dc2626",
                            border: tall ? "2px dashed #fbbf24" : "1px solid rgba(255,255,255,.7)",
                            boxShadow: out ? "0 0 0 2px #f59e0b" : undefined,
                            touchAction: "none",
                          }}
                          title={`${e.equipmentNumber} · ${fmt(r.w)} × ${fmt(r.h)} m${e.weightKg != null ? ` · ${fmtKg(e.weightKg)}` : ""}${tall ? " · mais alto que a carroceria" : ""}`}
                        >
                          <span className="text-[11px] font-bold px-0.5">{e.equipmentNumber}</span>
                          {r.w * scale > 70 && r.h * scale > 34 && !ne && (
                            <span className="text-[10px] opacity-90">
                              {fmt(r.w)}×{fmt(r.h)}{e.weightKg != null ? ` · ${Math.round(e.weightKg)}kg` : ""}
                            </span>
                          )}
                          {nestedHere && ne && hasDims(ne) && (() => {
                            // gerador dentro da bacia, centralizado; acompanha o giro da bacia
                            const w0 = nestedHere.inRot ? ne.widthM! : ne.lengthM!;
                            const h0 = nestedHere.inRot ? ne.lengthM! : ne.widthM!;
                            const gw = it.rotated ? h0 : w0;
                            const gh = it.rotated ? w0 : h0;
                            return (
                              <div
                                onPointerDown={(ev) => {
                                  ev.stopPropagation();
                                  setSelected(nestedHere.uid);
                                }}
                                className={`absolute rounded-sm flex flex-col items-center justify-center text-center leading-tight cursor-pointer ${
                                  selected === nestedHere.uid ? "ring-2 ring-gray-900" : ""
                                }`}
                                style={{
                                  left: ((r.w - gw) / 2) * scale,
                                  top: ((r.h - gh) / 2) * scale + 6,
                                  width: gw * scale,
                                  height: gh * scale,
                                  background: itemColor(ne.equipmentNumber),
                                  border: "1px solid rgba(255,255,255,.85)",
                                }}
                                title={`${ne.equipmentNumber} sobre a bacia ${e.equipmentNumber}${ne.weightKg != null ? ` · ${fmtKg(ne.weightKg)}` : ""}`}
                              >
                                <span className="text-[11px] font-bold px-0.5">{ne.equipmentNumber}</span>
                                {gw * scale > 70 && gh * scale > 30 && (
                                  <span className="text-[10px] opacity-90">{fmt(gw)}×{fmt(gh)}</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                    {items.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 pointer-events-none">
                        Adicione equipamentos pela lista à esquerda
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 mt-1 pl-4">Cada quadradinho = 1 m · duplo clique gira 90° (a bacia leva o gerador junto) · tecla R gira · Delete tira · solte o gerador em cima da bacia para colocá-lo dentro</div>
              </div>
            </div>

            {summary && summary.pending.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="text-sm font-medium text-red-700 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> Ficaram de fora: sem espaço ou acima da capacidade ({summary.pending.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {summary.pending.map((p) => {
                    const e = eqById.get(p.eqId);
                    return (
                      <span key={p.uid} className="inline-flex items-center gap-1 text-xs bg-white border border-red-200 rounded px-2 py-1 font-mono">
                        {e?.equipmentNumber}
                        <button onClick={() => removeItem(p.uid)} className="text-gray-400 hover:text-red-600" title="Tirar da carga">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {summary && (
              <div className="rounded-lg border bg-white p-3 grid gap-4 sm:grid-cols-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Piso ocupado</div>
                  <div className="font-semibold text-gray-900">{Math.round(summary.areaPct * 100)}%</div>
                  <div className="h-2 bg-gray-100 rounded mt-1 overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${Math.min(100, summary.areaPct * 100)}%` }} />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{summary.placed.length + summary.nestedPlaced.length} item(ns) na carga</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Peso</div>
                  <div className={`font-semibold ${overCapacity ? "text-red-600" : "text-gray-900"}`}>
                    {fmtKg(summary.weight)}
                    {vehicle.capacityKg ? ` de ${fmtKg(vehicle.capacityKg)}` : ""}
                  </div>
                  {vehicle.capacityKg ? (
                    <div className="h-2 bg-gray-100 rounded mt-1 overflow-hidden">
                      <div className={`h-full ${overCapacity ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${Math.min(100, (summary.weight / vehicle.capacityKg) * 100)}%` }} />
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 mt-1">Veículo sem capacidade informada.</div>
                  )}
                  {overCapacity && <div className="text-xs text-red-600 mt-1 font-medium">Acima da capacidade do veículo.</div>}
                  {summary.noWeight > 0 && (
                    <div className="text-xs text-amber-600 mt-1">{summary.noWeight} equipamento(s) sem peso informado (contam como 0).</div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Distribuição do peso</div>
                  {summary.cg != null ? (
                    <>
                      <div className="relative h-2 bg-gray-100 rounded mt-2">
                        <div className="absolute -top-1 w-1 h-4 bg-rose-500 rounded" style={{ left: `${summary.cg * 100}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                        <span>cabine</span>
                        <span>fundo</span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">Centro de gravidade a {Math.round(summary.cg * 100)}% do comprimento, contado da cabine.</div>
                    </>
                  ) : (
                    <div className="text-xs text-gray-500">Informe o peso dos equipamentos para ver.</div>
                  )}
                </div>
                {summary.overhanging.length > 0 && (
                  <div className="sm:col-span-3 text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded px-2 py-1.5">
                    <b>Carga fora da carroceria:</b> {summary.overhanging.map((o) => `${o.code} (${o.text})`).join("; ")}. Exige
                    atenção à sinalização e à legislação de trânsito — confirme com o motorista antes de sair.
                  </div>
                )}
                {summary.tooTall.length > 0 && (
                  <div className="sm:col-span-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    Mais altos que a altura útil informada ({fmt(vehicle.heightM!)} m): {summary.tooTall.map((p) => p.e.equipmentNumber).join(", ")}.
                  </div>
                )}
                <div className="sm:col-span-3">
                  <Button size="sm" variant="outline" className="gap-1" disabled={summary.placed.length === 0} onClick={copySummary}>
                    <ClipboardCopy className="w-4 h-4" /> Copiar resumo da carga
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {vehicleDialog && (
        <VehiclesDialog
          initial={vehicles}
          onClose={() => setVehicleDialog(false)}
          onSaved={async () => {
            setVehicleDialog(false);
            await load();
          }}
        />
      )}
      {editEqId && eqById.get(editEqId) && (
        <EquipmentDialog
          eq={eqById.get(editEqId)!}
          onClose={() => setEditEqId(null)}
          onSaved={async () => {
            setEditEqId(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ═══ Cadastro de veículos ═══════════════════════════════════════════════════
type VRow = { id: string; name: string; lengthM: string; widthM: string; heightM: string; capacityKg: string };
const toRow = (v: Vehicle): VRow => ({
  id: v.id,
  name: v.name,
  lengthM: String(v.lengthM).replace(".", ","),
  widthM: String(v.widthM).replace(".", ","),
  heightM: v.heightM != null ? String(v.heightM).replace(".", ",") : "",
  capacityKg: v.capacityKg != null ? String(v.capacityKg) : "",
});

function VehiclesDialog({ initial, onClose, onSaved }: { initial: Vehicle[]; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<VRow[]>(initial.length ? initial.map(toRow) : [{ id: "", name: "", lengthM: "", widthM: "", heightM: "", capacityKg: "" }]);
  const [saving, setSaving] = useState(false);
  const set = (i: number, patch: Partial<VRow>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/carga/veiculos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicles: rows
            .filter((r) => r.name.trim() || r.lengthM.trim() || r.widthM.trim())
            .map((r) => ({
              id: r.id || undefined,
              name: r.name,
              lengthM: r.lengthM,
              widthM: r.widthM,
              heightM: r.heightM.trim() ? r.heightM : null,
              capacityKg: r.capacityKg.trim() ? r.capacityKg : null,
            })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao salvar.");
        return;
      }
      toast.success("Veículos salvos.");
      onSaved();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Veículos</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500">
          Medidas internas da carroceria, em metros (ex.: 6,20). Altura útil e capacidade são opcionais, mas ativam os avisos.
        </p>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.2fr_auto] gap-2 text-xs font-medium text-gray-600 px-1">
            <span>Nome</span><span>Comprimento (m)</span><span>Largura (m)</span><span>Altura (m)</span><span>Capacidade (kg)</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.2fr_auto] gap-2 items-center">
              <Input placeholder="Ex.: Caminhão baú" value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
              <Input inputMode="decimal" value={r.lengthM} onChange={(e) => set(i, { lengthM: e.target.value })} />
              <Input inputMode="decimal" value={r.widthM} onChange={(e) => set(i, { widthM: e.target.value })} />
              <Input inputMode="decimal" value={r.heightM} onChange={(e) => set(i, { heightM: e.target.value })} />
              <Input inputMode="numeric" value={r.capacityKg} onChange={(e) => set(i, { capacityKg: e.target.value })} />
              <button className="p-2 text-gray-400 hover:text-red-600" title="Remover veículo" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="gap-1 w-fit" onClick={() => setRows((rs) => [...rs, { id: "", name: "", lengthM: "", widthM: "", heightM: "", capacityKg: "" }])}>
          <Plus className="w-4 h-4" /> Adicionar veículo
        </Button>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-green-500 hover:bg-green-600" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══ Medidas e peso de um equipamento ═══════════════════════════════════════
function EquipmentDialog({ eq, onClose, onSaved }: { eq: Eq; onClose: () => void; onSaved: () => void }) {
  const init = (n: number | null) => (n != null ? String(n).replace(".", ",") : "");
  const [length, setLength] = useState(init(eq.lengthM));
  const [width, setWidth] = useState(init(eq.widthM));
  const [height, setHeight] = useState(init(eq.heightM));
  const [weight, setWeight] = useState(init(eq.weightKg));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/carga/equipamento", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // só envia o que foi alterado, pra não reescrever o cadastro à toa
        body: JSON.stringify({
          id: eq.id,
          ...(length !== init(eq.lengthM) ? { lengthM: length } : {}),
          ...(width !== init(eq.widthM) ? { widthM: width } : {}),
          ...(height !== init(eq.heightM) ? { heightM: height } : {}),
          ...(weight !== init(eq.weightKg) ? { weightKg: weight } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao salvar.");
        return;
      }
      toast.success("Equipamento atualizado.");
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
          <DialogTitle>{eq.equipmentNumber} — medidas e peso</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500">
          As medidas são gravadas no cadastro do equipamento (comprimento = lado maior, no sentido do caminhão). Em metros, ex.: 2,80.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Comprimento (m)</label>
            <Input inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Largura (m)</label>
            <Input inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Altura (m)</label>
            <Input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Peso (kg)</label>
            <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-green-500 hover:bg-green-600" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
