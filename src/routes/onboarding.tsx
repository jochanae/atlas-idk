import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/atlas/StubPage";
export const Route = createFileRoute("/onboarding")({ component: () => <StubPage name="Onboarding" path="/onboarding" /> });
