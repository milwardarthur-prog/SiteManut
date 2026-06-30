import EquipDetailClient from "./_components/equip-detail-client";
export default function EquipDetailPage({ params }: { params: { id: string } }) {
  return <EquipDetailClient id={params?.id ?? ""} />;
}
