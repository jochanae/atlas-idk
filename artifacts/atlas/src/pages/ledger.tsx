import { useParams, Link } from "wouter";
import { 
  useGetProject, 
  useListEntries,
  useGetProjectSummary,
  getGetProjectQueryKey,
  getListEntriesQueryKey,
  getGetProjectSummaryQueryKey
} from "@workspace/api-client-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Ledger() {
  const { projectId } = useParams();
  const id = Number(projectId);

  const { data: project } = useGetProject(id, { query: { enabled: !!id, queryKey: getGetProjectQueryKey(id) } });
  const { data: summary } = useGetProjectSummary(id, { query: { enabled: !!id, queryKey: getGetProjectSummaryQueryKey(id) } });
  const { data: entries } = useListEntries(id, {}, { query: { enabled: !!id, queryKey: getListEntriesQueryKey(id, {}) } });

  const committed = entries?.filter(e => e.status === "committed") || [];
  const parked = entries?.filter(e => e.status === "parked") || [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-16 border-b border-border flex items-center px-8 justify-between bg-card">
        <div className="flex items-center space-x-2">
          <Link href="/" className="font-bold text-primary mr-2">ATLAS</Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`/project/${id}`} className="text-sm font-medium hover:text-primary">
            {project?.name || "Workspace"}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium text-accent">Ledger</span>
        </div>
      </header>

      <div className="flex-1 max-w-5xl mx-auto w-full p-8 flex flex-col space-y-8">
        <div className="flex gap-4 p-4 border border-border bg-card rounded-sm">
          <div className="flex-1 text-center">
            <div className="text-2xl font-bold text-accent">{summary?.committedCount || 0}</div>
            <div className="text-xs uppercase text-muted-foreground tracking-widest">Committed</div>
          </div>
          <div className="w-px bg-border" />
          <div className="flex-1 text-center">
            <div className="text-2xl font-bold text-foreground">{summary?.parkedCount || 0}</div>
            <div className="text-xs uppercase text-muted-foreground tracking-widest">Parked</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-lg font-bold text-accent mb-4 border-b border-border pb-2">Committed</h2>
            <div className="space-y-3">
              {committed.length === 0 && <p className="text-sm text-muted-foreground italic">No decisions locked in.</p>}
              {committed.map(e => (
                <div key={e.id} className="p-4 border border-accent/20 bg-card rounded-sm">
                  <h3 className="font-bold mb-1">{e.title}</h3>
                  <p className="text-sm text-muted-foreground">{e.summary}</p>
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 bg-accent/10 text-accent rounded-sm">{e.mode}</span>
                    <span className="text-muted-foreground">{new Date(e.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-muted-foreground mb-4 border-b border-border pb-2">Parked</h2>
            <div className="space-y-3">
              {parked.length === 0 && <p className="text-sm text-muted-foreground italic">No parked items.</p>}
              {parked.map(e => (
                <div key={e.id} className="p-4 border border-border bg-card rounded-sm opacity-80 hover:opacity-100 transition-opacity">
                  <h3 className="font-medium mb-1 text-foreground">{e.title}</h3>
                  <p className="text-sm text-muted-foreground">{e.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
