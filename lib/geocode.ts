// Geocodificação (endereço -> latitude/longitude) usando o Nominatim do
// OpenStreetMap, que é gratuito e não exige chave. Em troca, a política de uso
// pede no máximo 1 requisição por segundo e um User-Agent identificando o app —
// por isso o resultado de cada endereço é guardado em cache (ver
// lib/mapa-cache.ts) e nunca é consultado duas vezes.
//
// Os endereços vêm do CSV de locação, em texto livre ("HOTEL X: R. Y, 399 -
// CENTRO, JUIZ DE FORA - MG, 36010-071"). O OpenStreetMap no Brasil nem sempre
// conhece o número do imóvel (e quase nunca rodovia com KM), então a busca tenta
// do mais preciso ao mais genérico e devolve o nível de precisão obtido, pro
// mapa avisar quando o pino é só aproximado.

export type GeoPrecision = "EXATO" | "RUA" | "CEP" | "CIDADE" | "MANUAL";
export type GeoResult = { lat: number; lng: number; precision: GeoPrecision };

const UF_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
  MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
  PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};
const UF_RE = new RegExp(`(?:^|[\\s/])(${Object.keys(UF_NAMES).join("|")})$`);

// Abreviações de cidade que aparecem nos endereços.
const CITY_ALIASES: Record<string, string> = { JF: "JUIZ DE FORA", BH: "BELO HORIZONTE", RJ: "RIO DE JANEIRO" };

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "SiteManut-Beltloc/1.0 (controle de equipamentos)";
const MIN_INTERVAL_MS = 1100;

/** Chave de cache: maiúsculas, sem espaços sobrando nem vírgulas soltas. */
export function normalizeAddress(a: string | null | undefined): string {
  return (a ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/[,\s]+$/, "");
}

export type ParsedAddress = {
  street: string;
  number: string | null;
  city: string | null;
  uf: string | null;
  cep: string | null;
};

const STREET_ABBREV: [RegExp, string][] = [
  [/^R\.?\s+/, "RUA "],
  [/^AV\.?\s+/, "AVENIDA "],
  [/^ROD\.?\s+/, "RODOVIA "],
  [/^AL\.?\s+/, "ALAMEDA "],
  [/^TRAV\.?\s+/, "TRAVESSA "],
  [/^ESTR?\.?\s+/, "ESTRADA "],
  [/^PÇ\.?\s+|^PCA\.?\s+/, "PRAÇA "],
];
const STREET_START = /^(R\.?|RUA|AV\.?|AVENIDA|ROD\.?|RODOVIA|ESTR?\.?|ESTRADA|AL\.?|ALAMEDA|TRAV\.?|TRAVESSA|PÇ\.?|PCA\.?|PRAÇA|LARGO|BR[\s-]?\d|MG[\s-]?\d|FERROVIA)(\s|$|-)/;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (["de", "da", "do", "das", "dos", "e"].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Quebra o endereço livre do CSV em rua, número, cidade, UF e CEP. */
export function parseAddress(raw: string): ParsedAddress {
  let s = normalizeAddress(raw)
    .replace(/[\u0000-\u001f\u0080-\u009f]/g, " ") // lixo de codificação (travessão quebrado)
    .replace(/\s[-–—]\s|[|·:;–—]/g, ",") // separadores: " - ", "|", "·", ":", travessões
    .replace(/(\S)-\s+/g, "$1, ") // "JUIZ DE FORA- MG"
    .replace(/\s-(?=\S)/g, ", ") // "JUIZ DE FORA -MG"
    .replace(/\(.*?\)/g, " ");

  // CEP: 36.021-630, 36021-630, 36021630, "CEP: ..."
  const cepMatch = s.match(/\b(\d{2})\.?(\d{3})-?(\d{3})\b/);
  const cep = cepMatch ? `${cepMatch[1]}${cepMatch[2]}-${cepMatch[3]}` : null;
  if (cepMatch) s = s.replace(cepMatch[0], ",").replace(/\bCEP\b\.?/g, " ");

  const tokens = s
    .split(",")
    .map((t) => t.replace(/\s+/g, " ").replace(/^[\s.\-]+|[\s.\-]+$/g, ""))
    .filter(Boolean);

  // UF: último token que termina em sigla de estado ("MG", "JUIZ DE FORA MG", "LIMA DUARTE/MG").
  let uf: string | null = null;
  let city: string | null = null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const m = tokens[i].match(UF_RE);
    if (!m) continue;
    uf = m[1];
    const before = tokens[i].slice(0, m.index).replace(/[\s/]+$/, "").trim();
    const candidate = before || (i > 0 ? tokens[i - 1] : null);
    if (candidate && !/^\d+$/.test(candidate)) city = candidate;
    break;
  }
  if (!city && tokens.length > 1) city = tokens[tokens.length - 1];
  if (city) {
    city = city.replace(/[/\s]+$/, "").trim();
    city = CITY_ALIASES[city] ?? city;
    // "CENTRO/JUIZ DE FORA" etc.: fica com o último pedaço depois da barra.
    if (city.includes("/")) city = city.split("/").pop()!.trim();
  }

  // Rua: o primeiro pedaço que parece logradouro (descarta nome do local, ex. "HOTEL X").
  let streetIdx = tokens.findIndex((t) => STREET_START.test(t));
  if (streetIdx < 0) streetIdx = 0;
  let street = tokens[streetIdx] ?? "";
  let number: string | null = null;

  // Rodovia: "ROD 040", "BR 040 KM 820", "RODOVIA BR-267 KM 64" -> "BR-267".
  const hw = street.match(/\b(BR|MG)[\s-]?(\d{2,3})\b/) ?? street.match(/^ROD\.?\s+(\d{3})$/);
  if (hw) {
    street = hw.length === 3 ? `${hw[1]}-${hw[2]}` : `BR-${hw[1]}`;
  } else {
    for (const [re, rep] of STREET_ABBREV) street = street.replace(re, rep);
    // número colado na rua: "AVENIDA BARÃO DO RIO BRANCO 3579"
    const inline = street.match(/^(.*\D)\s+(\d{1,5})$/);
    if (inline) {
      street = inline[1];
      number = inline[2];
    }
  }
  if (!number) {
    const next = tokens[streetIdx + 1] ?? "";
    const n = next.match(/^(?:N[º°O]?\s*)?(\d{1,5})(?:\D.*)?$/);
    if (n) number = n[1];
  }

  return {
    street: titleCase(street.replace(/\s+/g, " ").trim()).replace(/^Br-/, "BR-").replace(/^Mg-/, "MG-"),
    number,
    city: city ? titleCase(city) : null,
    uf,
    cep,
  };
}

let lastRequestAt = 0;
async function pace() {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

type NominatimHit = { lat: string; lon: string; address?: Record<string, string> };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lançado quando o prazo da chamada acabou: o endereço fica pendente pra próxima. */
export class GeoDeadlineError extends Error {
  constructor() {
    super("prazo da chamada esgotado");
  }
}

async function fetchHit(params: Record<string, string>, deadline?: number): Promise<NominatimHit | null> {
  await pace();
  // Cada consulta pode levar alguns segundos; não começa uma que não cabe no prazo.
  const left = deadline ? deadline - Date.now() : 9000;
  if (left < 2500) throw new GeoDeadlineError();
  const qs = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    addressdetails: "1",
    countrycodes: "br",
    ...params,
  });
  const res = await fetch(`${NOMINATIM_URL}?${qs}`, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR" },
    signal: AbortSignal.timeout(Math.min(9000, left)),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = (await res.json()) as NominatimHit[];
  return data[0] ?? null;
}

/** Uma tentativa de busca; descarta resultado que cai em outro estado. */
async function search(
  params: Record<string, string>,
  expectedState?: string,
  deadline?: number
): Promise<NominatimHit | null> {
  const hit = await fetchHit(params, deadline);
  if (!hit) return null;
  const state = hit.address?.state;
  if (expectedState && state && fold(state) !== fold(expectedState)) return null;
  return hit;
}

const toResult = (hit: NominatimHit, precision: GeoPrecision): GeoResult => ({
  lat: Number(hit.lat),
  lng: Number(hit.lon),
  precision,
});

/**
 * Procura o endereço do mais preciso ao mais genérico. Devolve null se nada
 * for encontrado. Erros de rede/limite são propagados (não viram "não achou"),
 * pra quem chama poder tentar de novo depois.
 */
export async function geocodeAddress(raw: string, deadline?: number): Promise<GeoResult | null> {
  // Alguns endereços já trazem as coordenadas (ex.: "(-21.0620, -44.3121)").
  const coord = raw.match(/(-\d{1,2}\.\d{4,})\s*,\s*(-\d{1,3}\.\d{4,})/);
  if (coord) return { lat: Number(coord[1]), lng: Number(coord[2]), precision: "EXATO" };

  const a = parseAddress(raw);
  const state = a.uf ? UF_NAMES[a.uf] : undefined;
  const place: Record<string, string> = {};
  if (a.city) place.city = a.city;
  if (state) place.state = state;
  const hasStreet = !!a.street && !/^\d+$/.test(a.street);

  // 1) rua + número
  if (hasStreet && a.number && a.city) {
    const hit = await search({ ...place, street: `${a.number} ${a.street}` }, state, deadline);
    if (hit) return toResult(hit, hit.address?.house_number ? "EXATO" : "RUA");
  }
  // 2) só a rua / rodovia
  if (hasStreet && a.city) {
    const hit = await search({ ...place, street: a.street }, state, deadline);
    if (hit) return toResult(hit, "RUA");
  }
  // 3) CEP
  if (a.cep) {
    const hit = await search({ ...place, postalcode: a.cep }, state, deadline);
    if (hit) return toResult(hit, "CEP");
  }
  // 4) cidade (aproximado)
  if (a.city) {
    const hit = await search(place, state, deadline);
    if (hit) return toResult(hit, "CIDADE");
  }
  return null;
}

/** Aceita "-19.91, -43.94" (coordenadas coladas do Google Maps). */
export function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const m = input.trim().match(/^(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(",", "."));
  const lng = Number(m[2].replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
