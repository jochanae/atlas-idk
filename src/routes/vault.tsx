import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/atlas/StubPage";
export const Route = createFileRoute("/vault")({ component: () => <StubPage name="Vault" path="/vault" /> });
