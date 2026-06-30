"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Search, Loader2, Wrench, ArrowRight, FileText, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function EquipamentosClient() {
  const { data: session } = useSession() || {};
  const router = useRouter();
  const [equipments, setEquipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  useEffect(() => {
    fetchEquipments();
  }, []);

  const fetchEquipments = async (q?: string) => {
    setLoading(true);
    try {
      const params = q ? `?search=${encodeURIComponent(q)}` : "";
      const res = await fetch(`/api/equipamentos${params}`);
      if (res.ok) setEquipments(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => fetchEquipments(search);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900">Equipamentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie os equipamentos cadastrados</p>
        </div>
        {isAdmin && (
          <Link href="/equipamentos/novo">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="w-4 h-4 mr-2" /> Novo Equipamento
            </Button>
          </Link>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Buscar por número ou nome..."
          value={search}
          onChange={(e: any) => setSearch(e?.target?.value ?? "")}
          onKeyDown={(e: any) => e?.key === "Enter" && handleSearch()}
          className="max-w-md"
        />
        <Button variant="outline" onClick={handleSearch}>
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
      ) : (equipments?.length ?? 0) === 0 ? (
        <Card className="border-0 shadow-md">
          <CardContent className="py-12 text-center">
            <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum equipamento encontrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(equipments ?? []).map((eq: any) => (
            <Card
              key={eq?.id}
              className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push(`/equipamentos/${eq?.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                      <Wrench className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{eq?.name ?? ""}</p>
                      <p className="text-xs text-muted-foreground font-mono">{eq?.equipmentNumber ?? ""}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {eq?._count?.files ?? 0} arquivos</span>
                  <span className="flex items-center gap-1"><ClipboardList className="w-3 h-3" /> {eq?._count?.workOrders ?? 0} OS</span>
                </div>
                {eq?.model && <p className="text-xs text-muted-foreground mt-1">Modelo: {eq.model}{eq?.year ? ` (${eq.year})` : ""}</p>}
                <p className="text-xs text-muted-foreground">Horímetro: {eq?.currentHorimeter ?? 0}h</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
