import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/atlas/StubPage";
export const Route = createFileRoute("/landing")({ component: () => <StubPage name="Landing" path="/landing" /> });
