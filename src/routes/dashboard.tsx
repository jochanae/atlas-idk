import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/atlas/StubPage";
export const Route = createFileRoute("/dashboard")({ component: () => <StubPage name="Dashboard" path="/dashboard" /> });
