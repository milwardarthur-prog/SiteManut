// Cache das coordenadas de cada endereço (tela Mapa). Guardado como JSON no
// DataStore, pra não exigir tabela nova. A chave é o endereço normalizado
// (lib/geocode.ts#normalizeAddress): equipamentos no mesmo endereço dividem a
// mesma entrada, e o OpenStreetMap só é consultado uma vez por endereço.
import { prisma } from "@/lib/db";
import type { GeoPrecision } from "@/lib/geocode";

const STORE_KEY = "geocode_cache";

export type GeoCacheEntry =
  | { lat: number; lng: number; precision: GeoPrecision; at: string }
  | { fail: true; at: string };
export type GeoCache = Record<string, GeoCacheEntry>;

export const isFound = (e: GeoCacheEntry | undefined): e is Extract<GeoCacheEntry, { lat: number }> =>
  !!e && "lat" in e;

export async function loadGeoCache(): Promise<GeoCache> {
  const row = await prisma.dataStore.findUnique({ where: { key: STORE_KEY } });
  if (!row?.content) return {};
  try {
    const parsed = JSON.parse(row.content);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveGeoCache(cache: GeoCache): Promise<void> {
  const content = JSON.stringify(cache);
  await prisma.dataStore.upsert({
    where: { key: STORE_KEY },
    update: { content },
    create: { key: STORE_KEY, content },
  });
}
