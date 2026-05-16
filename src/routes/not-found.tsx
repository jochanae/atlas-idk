import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/atlas/StubPage";
export const Route = createFileRoute("/not-found")({ component: () => <StubPage name="Not Found" path="/not-found" /> });
