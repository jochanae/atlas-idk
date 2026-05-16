import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/atlas/StubPage";
export const Route = createFileRoute("/nexus")({ component: () => <StubPage name="Nexus" path="/nexus" /> });
