import CargaClient from "@/app/(authenticated)/carga/_components/carga-client";

export const metadata = { title: "Montar carga" };

// Versão pública e somente leitura de "Montar carga", pra ser mostrada dentro do
// painel estático (github.io/testemanut). Fica fora do grupo (authenticated) e
// do matcher do middleware, então não pede login. Medidas, pesos e veículos só
// se editam no SiteManut.
export default function CargaPublicaPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4">
      <CargaClient readOnly />
    </div>
  );
}
