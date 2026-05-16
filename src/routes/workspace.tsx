import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/atlas/StubPage";
export const Route = createFileRoute("/workspace")({ component: () => <StubPage name="Workspace" path="/workspace" /> });
