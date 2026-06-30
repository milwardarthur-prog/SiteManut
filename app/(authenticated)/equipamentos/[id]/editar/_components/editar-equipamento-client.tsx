"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import EquipamentoForm from "../../../_components/equipamento-form";

export default function EditarEquipamentoClient({ id }: { id: string }) {
  const router = useRouter();
  const { data: session, status } = useSession() || {};
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const [equip, setEquip] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/equipamentos/${id}`);
        if (res.ok) {
          setEquip(await res.json());
        } else {
          toast.error("Erro ao carregar equipamento");
        }
      } catch {
        toast.error("Erro ao carregar equipamento");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isAdmin, status]);

  if (status === "loading" || loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
        <h2 className="text-lg font-semibold text-gray-900">Acesso restrito</h2>
        <p className="text-sm text-muted-foreground">Apenas gestores (Admin) podem editar equipamentos.</p>
        <button onClick={() => router.replace(`/equipamentos/${id}`)} className="text-sm text-orange-600 underline">
          Voltar ao equipamento
        </button>
      </div>
    );
  }

  if (!equip) {
    return <div className="text-center py-12 text-muted-foreground">Equipamento não encontrado</div>;
  }

  return <EquipamentoForm equipmentId={id} initialData={equip} />;
}
