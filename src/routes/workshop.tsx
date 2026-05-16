import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/atlas/StubPage";
export const Route = createFileRoute("/workshop")({ component: () => <StubPage name="Workshop" path="/workshop" /> });
