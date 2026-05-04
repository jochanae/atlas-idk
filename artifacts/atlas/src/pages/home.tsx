import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useListProjects, useCreateSession, useCreateProject } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MODES = ["Think", "Plan", "Build", "Explore", "Decide", "Audit"];

export default function Home() {
  const [activeMode, setActiveMode] = useState("Think");
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();

  const { data: projects } = useListProjects();
  const createSession = useCreateSession();
  const createProject = useCreateProject();

  const handleStart = () => {
    if (!query.trim()) return;
    
    // Auto-create a default project if none exists just to keep the flow smooth
    if (!projects || projects.length === 0) {
      createProject.mutate({ data: { name: "Default Project" } }, {
        onSuccess: (p) => {
          createSession.mutate({ projectId: p.id, data: { title: query.slice(0, 30), mode: activeMode } }, {
            onSuccess: (s) => setLocation(`/project/${p.id}`)
          });
        }
      });
    } else {
      const pId = projects[0].id;
      createSession.mutate({ projectId: pId, data: { title: query.slice(0, 30), mode: activeMode } }, {
        onSuccess: (s) => setLocation(`/project/${pId}`)
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-8">
        <header className="flex justify-between items-center mb-16">
          <div className="text-xl font-bold tracking-tight text-primary">ATLAS</div>
          <Link href="/projects" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            Projects
          </Link>
        </header>

        <div className="space-y-6">
          <div className="flex space-x-2 border-b border-border pb-2">
            {MODES.map((mode) => (
              <button
                key={mode}
                onClick={() => setActiveMode(mode)}
                className={`px-4 py-1 text-sm font-medium transition-colors ${
                  activeMode === mode ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
              placeholder={`What do we need to ${activeMode.toLowerCase()}?`}
              className="text-xl py-6 bg-card border-none ring-1 ring-border focus-visible:ring-primary rounded-sm placeholder:text-muted-foreground"
            />
            <Button 
              onClick={handleStart}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-sm"
              disabled={createSession.isPending || !query.trim()}
            >
              Engage
            </Button>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-border/50">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Recent Sessions</h2>
          {projects && projects.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No past sessions. The slate is clean.</p>
          ) : (
            <div className="grid gap-2">
              {projects?.slice(0, 3).map(p => (
                <Link key={p.id} href={`/project/${p.id}`} className="block p-4 bg-card hover:bg-muted/50 border border-border transition-colors rounded-sm flex justify-between items-center">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
