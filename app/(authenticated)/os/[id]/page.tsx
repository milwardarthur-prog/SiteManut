import OSDetailClient from "./_components/os-detail-client";

export default function OSDetailPage({ params }: { params: { id: string } }) {
  return <OSDetailClient id={params?.id ?? ""} />;
}
