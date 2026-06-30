import EditarEquipamentoClient from "./_components/editar-equipamento-client";

export default function EditarEquipamentoPage({ params }: { params: { id: string } }) {
  return <EditarEquipamentoClient id={params?.id ?? ""} />;
}
