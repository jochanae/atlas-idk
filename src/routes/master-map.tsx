import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/atlas/StubPage";
export const Route = createFileRoute("/master-map")({ component: () => <StubPage name="Master Map" path="/master-map" /> });
