import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "@/components/atlas/StubPage";
export const Route = createFileRoute("/projects")({ component: () => <StubPage name="Projects" path="/projects" /> });
