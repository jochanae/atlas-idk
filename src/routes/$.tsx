import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const App = lazy(() => import("@/App"));

export const Route = createFileRoute("/$")({
  ssr: false,
  component: () => (
    <ClientOnly fallback={null}>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </ClientOnly>
  ),
});
