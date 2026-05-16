import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/atlas/StubPage";
export const Route = createFileRoute("/login")({ component: () => <StubPage name="Login" path="/login" /> });
