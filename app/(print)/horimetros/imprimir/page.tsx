import { Suspense } from "react";
import ImprimirClient from "./_components/imprimir-client";

export default function ImprimirPage() {
  return (
    <Suspense fallback={null}>
      <ImprimirClient />
    </Suspense>
  );
}
