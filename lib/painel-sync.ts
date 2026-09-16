// ────────────────────────────────────────────────────────────────────────────
// Publica automaticamente o status dos equipamentos no painel externo
// (GitHub Pages estático "testemanut"), sobrescrevendo o dados.csv do
// repositório via API do GitHub. Nunca deve derrubar a operação que a
// disparou — qualquer falha aqui só é logada.
// ────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";

const REPO_OWNER = "milwardarthur-prog";
const REPO_NAME = "testemanut";
const FILE_PATH = "dados.csv";

function csvField(v: string): string {
  if (v === "") return "";
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function fmtPrazo(d: Date | null): string {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

export async function syncPainelEquipamentos(): Promise<void> {
  const token = process.env.PAINEL_GITHUB_TOKEN;
  if (!token) {
    console.warn("[painel-sync] PAINEL_GITHUB_TOKEN não configurado, sincronização ignorada.");
    return;
  }

  try {
    const equipments = await prisma.equipment.findMany({
      select: {
        equipmentNumber: true,
        leaseStatus: true,
        currentClient: true,
        maintenanceSeverity: true,
        maintenanceExpectedDate: true,
        comments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true },
        },
      },
    });

    const header = "equipamento,local,contrato,espera_acumulada_min,espera_inicio";
    const lines = [header];

    for (const e of equipments) {
      let local = "";
      if (e.leaseStatus === "LOCADO") {
        local = e.currentClient ?? "";
      } else if (e.leaseStatus === "MANUTENCAO") {
        const sevLabel = e.maintenanceSeverity === "PESADA" ? "Manutenção Pesada" : "Manutenção Leve";
        const desc = e.comments[0]?.content?.trim() ?? "";
        const prazo = fmtPrazo(e.maintenanceExpectedDate);
        local = desc ? `${sevLabel} - ${desc}` : sevLabel;
        if (prazo) local += ` | Prazo: ${prazo}`;
      }
      lines.push([e.equipmentNumber, local, "", "0", ""].map(csvField).join(","));
    }

    const csvContent = lines.join("\n") + "\n";
    const contentB64 = Buffer.from(csvContent, "utf-8").toString("base64");

    const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    };

    const getRes = await fetch(apiUrl, { headers });
    let sha: string | undefined;
    if (getRes.ok) {
      const json = await getRes.json();
      sha = json.sha;
    } else {
      console.error("[painel-sync] Falha ao ler dados.csv atual:", getRes.status, await getRes.text());
    }

    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Atualização automática via SiteManut",
        content: contentB64,
        sha,
      }),
    });

    if (!putRes.ok) {
      console.error("[painel-sync] Falha ao publicar dados.csv:", putRes.status, await putRes.text());
    }
  } catch (err) {
    console.error("[painel-sync] Erro inesperado:", err);
  }
}
