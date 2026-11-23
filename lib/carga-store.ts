// Veículos e pesos da tela "Montar carga". Guardados como JSON no DataStore pra
// a fase de teste não exigir tabela/coluna nova; se a tela for adotada, o peso
// vira coluna de Equipment e os veículos viram tabela.
import { prisma } from "@/lib/db";
import type { Vehicle } from "@/lib/carga";

const VEHICLES_KEY = "carga_veiculos";
const WEIGHTS_KEY = "carga_pesos";
const EXTRAS_KEY = "carga_extras";

/** Item que se carrega mas não é equipamento cadastrado (ex.: bacia de contenção). */
export type ExtraItem = {
  id: string; // "extra:BC-01"
  code: string;
  name: string;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.dataStore.findUnique({ where: { key } });
  if (!row?.content) return fallback;
  try {
    const parsed = JSON.parse(row.content);
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown) {
  const content = JSON.stringify(value);
  await prisma.dataStore.upsert({ where: { key }, update: { content }, create: { key, content } });
}

export const loadVehicles = () => readJson<Vehicle[]>(VEHICLES_KEY, []);
export const saveVehicles = (v: Vehicle[]) => writeJson(VEHICLES_KEY, v);

export const loadExtras = () => readJson<ExtraItem[]>(EXTRAS_KEY, []);
export const saveExtras = (e: ExtraItem[]) => writeJson(EXTRAS_KEY, e);

/** equipmentId -> peso em kg */
export const loadWeights = () => readJson<Record<string, number>>(WEIGHTS_KEY, {});
export const saveWeights = (w: Record<string, number>) => writeJson(WEIGHTS_KEY, w);
