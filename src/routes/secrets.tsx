import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/atlas/StubPage";
export const Route = createFileRoute("/secrets")({ component: () => <StubPage name="Secrets" path="/secrets" /> });
