// Fotos do checklist da Revisão ficam no Supabase Storage (bucket privado) —
// no banco só vai o caminho do arquivo. Usa a API REST com a service role key,
// que só existe no servidor.
const bucket = () => process.env.SUPABASE_BUCKET || "os-fotos";

export function isPhotoStorageConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function base() {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return { url: `${url}/storage/v1`, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export async function uploadPhoto(path: string, data: Buffer, contentType: string): Promise<void> {
  const { url, headers } = base();
  const res = await fetch(`${url}/object/${bucket()}/${encodePath(path)}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": contentType, "x-upsert": "false" },
    body: new Uint8Array(data),
  });
  if (!res.ok) throw new Error(`Falha no upload da foto (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

// Gera links temporários (1h) pra exibir as fotos; retorna path -> url.
export async function signedPhotoUrls(paths: string[], expiresIn = 3600): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0 || !isPhotoStorageConfigured()) return out;
  const { url, headers } = base();
  const res = await fetch(`${url}/object/sign/${bucket()}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn, paths }),
  });
  if (!res.ok) throw new Error(`Falha ao gerar links das fotos (${res.status})`);
  const rows: { path: string; signedURL: string | null }[] = await res.json();
  for (const r of rows) if (r.signedURL) out.set(r.path, `${url}${r.signedURL}`);
  return out;
}

export async function deletePhoto(path: string): Promise<void> {
  const { url, headers } = base();
  const res = await fetch(`${url}/object/${bucket()}`, {
    method: "DELETE",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [path] }),
  });
  if (!res.ok) throw new Error(`Falha ao apagar a foto (${res.status})`);
}
