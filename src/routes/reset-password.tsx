import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/atlas/StubPage";
export const Route = createFileRoute("/reset-password")({ component: () => <StubPage name="Reset Password" path="/reset-password" /> });
