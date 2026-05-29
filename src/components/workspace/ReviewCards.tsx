import { useMemo, useState } from "react";
import { PlanCard } from "@/components/PlanCard";
import { GitHubPushModal } from "@/components/workspace/GitHubPushModal";
import { useGithubPushToken } from "@/hooks/useGithubPushToken";
import { getAuthHeaders } from "@/lib/api";
import type { Plan, PlanExecution } from "@/lib/plan";
import {
  getGetProjectQueryKey,
  useGetProject,
} from "@workspace/api-client-react";
import type {
  ChatMessage,
  FileEdit,
  LinePatch,
  LinkedRepo,
  PushRecord,
} from "@/pages/workspace";
import type { PlanState } from "@/components/workspace/chatShared";

export function LinePatchReviewCard({
  linePatches,
  linkedRepo,
  projectId,
  onPushSuccess,
  onPrCreated,
}: {
  linePatches: LinePatch[];
  linkedRepo: LinkedRepo | null;
  projectId: number;
  onPushSuccess: (records: PushRecord[]) => void;
  onPrCreated?: (prUrl: string) => void;
}) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patchedEdits, setPatchedEdits] = useState<FileEdit[] | null>(null);
  const [showPushModal, setShowPushModal] = useState(false);

  const { data: project } = useGetProject(projectId, { query: { queryKey: getGetProjectQueryKey(projectId) } });
  const token = useGithubPushToken(project?.githubToken);

  const pathGroups = useMemo(() => {
    const groups: Record<string, LinePatch[]> = {};
    for (const p of linePatches) {
      if (!groups[p.path]) groups[p.path] = [];
      groups[p.path].push(p);
    }
    return groups;
  }, [linePatches]);

  const uniquePaths = Object.keys(pathGroups);
  const patchCount = linePatches.length;
  const fileCount = uniquePaths.length;

  const handleApply = async () => {
    if (!linkedRepo) { setError("No repo linked — connect a GitHub repo in the Files tab."); return; }
    if (!token) { setError("No GitHub token — add your personal token in the Files tab."); return; }
    setApplying(true);
    setError(null);
    try {
      const edits: FileEdit[] = [];
      for (const [filePath, patches] of Object.entries(pathGroups)) {
        const r = await fetch(
          `/api/github/file?repo=${encodeURIComponent(linkedRepo.fullName)}&path=${encodeURIComponent(filePath)}&branch=${encodeURIComponent(linkedRepo.defaultBranch)}`,
          { headers: { ...getAuthHeaders(), "x-github-token": token } }
        );
        if (!r.ok) throw new Error(`Could not fetch ${filePath.split("/").pop()} (${r.status})`);
        const data = await r.json() as { content: string };
        let content = data.content;
        for (const patch of patches) {
          const idx = content.indexOf(patch.find);
          if (idx === -1) throw new Error(
            `Anchor not found in ${filePath.split("/").pop()}. The file may have changed since Atlas last read it — ask Atlas to re-read the file first.`
          );
          content = content.slice(0, idx) + patch.replace + content.slice(idx + patch.find.length);
        }
        const ext = filePath.split(".").pop() ?? "";
        const lang = ["ts", "tsx"].includes(ext) ? "typescript" : ["js", "jsx"].includes(ext) ? "javascript" : ext;
        edits.push({ path: filePath, language: lang, content });
      }
      setPatchedEdits(edits);
      setShowPushModal(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <div style={{
        marginTop: 12, padding: "11px 14px", borderRadius: 8,
        background: "rgba(201,162,76,0.05)", border: "1px solid rgba(201,162,76,0.2)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, background: "rgba(201,162,76,0.12)", border: "1px solid rgba(201,162,76,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="4.5" cy="4.5" r="2" stroke="var(--atlas-gold)" strokeWidth="1.2" />
              <circle cx="4.5" cy="11.5" r="2" stroke="var(--atlas-gold)" strokeWidth="1.2" />
              <path d="M6.2 5.8L14 3M6.2 10.2L14 13M9 8H14" stroke="var(--atlas-gold)" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "var(--ts-caption)", fontWeight: 600, color: "var(--atlas-gold)", marginBottom: 2 }}>
              {patchCount} patch{patchCount !== 1 ? "es" : ""} ready
            </div>
            <div style={{ fontFamily: "var(--app-font-mono)", fontSize: "var(--ts-micro)", color: "var(--atlas-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {fileCount === 1
                ? uniquePaths[0]
                : `${fileCount} files — ${uniquePaths.map(p => p.split("/").pop()).join(", ")}`}
            </div>
          </div>
        </div>
        <button
          onClick={handleApply}
          disabled={applying}
          style={{
            flexShrink: 0, padding: "6px 13px", borderRadius: 5, fontSize: "var(--ts-caption)", fontWeight: 600,
            fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em",
            background: applying
              ? "rgba(201,162,76,0.25)"
              : "linear-gradient(180deg, var(--atlas-gold) 0%, color-mix(in oklab, var(--atlas-gold) 78%, #6a4a18) 100%)",
            color: applying ? "var(--atlas-gold)" : "var(--atlas-bg)",
            border: "none", cursor: applying ? "default" : "pointer",
            boxShadow: applying ? "none" : "0 0 12px -4px color-mix(in oklab, var(--atlas-gold) 50%, transparent)",
            transition: "opacity 160ms ease",
          }}
        >
          {applying ? "Applying…" : "Apply & Review →"}
        </button>
      </div>

      {error && (
        <div style={{
          marginTop: 8, padding: "8px 12px", borderRadius: 6,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
          fontSize: "var(--ts-caption)", color: "rgba(239,68,68,0.85)", fontFamily: "var(--app-font-mono)", lineHeight: 1.55,
        }}>
          {error}
        </div>
      )}

      {showPushModal && patchedEdits && patchedEdits.length > 0 && (
        <GitHubPushModal
          fileEdits={patchedEdits}
          linkedRepo={linkedRepo}
          projectId={projectId}
          onClose={() => setShowPushModal(false)}
          onPushSuccess={(records) => { onPushSuccess(records); setShowPushModal(false); }}
          onPrCreated={onPrCreated}
        />
      )}
    </>
  );
}

export function ReviewPlanCard({
  message,
  projectId,
  linkedRepo,
  githubPushToken,
  planState,
  planExecution,
  onPlanStateChange,
  onPlanExecutionChange,
  onExecuteHomePlan,
  onStreamActivityUpdate,
  onStreamActivityComplete,
  onPushSuccess,
  onPrCreated,
}: {
  message: ChatMessage;
  projectId: number;
  linkedRepo: LinkedRepo | null;
  githubPushToken?: string | null;
  planState: PlanState;
  planExecution?: PlanExecution;
  onPlanStateChange: (messageId: number, state: PlanState) => void;
  onPlanExecutionChange: (messageId: number, execution: PlanExecution | null) => void;
  onExecuteHomePlan: (plan: Plan) => void;
  onStreamActivityUpdate: (message: ChatMessage, content: string) => void;
  onStreamActivityComplete: () => void;
  onPushSuccess: (records: PushRecord[]) => void;
  onPrCreated?: (prUrl: string) => void;
}) {
  const [showPlanPushModal, setShowPlanPushModal] = useState(false);
  const [planPushEdits, setPlanPushEdits] = useState<FileEdit[] | null>(null);
  const activeEdits = message.fileEdits ?? (message.fileEdit ? [message.fileEdit] : []);
  const userEdits = activeEdits.filter((edit) => !/^artifacts\/(atlas|api-server)\//.test(edit.path));
  const planMessageId = message.id ?? 0;

  if (!message.plan) return null;

  const setPlanStatus = (state: PlanState) => {
    onPlanStateChange(planMessageId, state);
  };

  const setPlanExecution = (execution: PlanExecution | null) => {
    onPlanExecutionChange(planMessageId, execution);
  };

  const resolvePlanLinePatches = async (): Promise<FileEdit[]> => {
    if (!message.linePatches?.length) return [];
    if (!linkedRepo) throw new Error("No repo linked - connect a GitHub repo in the Files tab.");
    if (!githubPushToken) throw new Error("No GitHub token - add your personal token in the Files tab.");
    const groups: Record<string, LinePatch[]> = {};
    for (const patch of message.linePatches) {
      if (!groups[patch.path]) groups[patch.path] = [];
      groups[patch.path].push(patch);
    }
    const edits: FileEdit[] = [];
    for (const [filePath, patches] of Object.entries(groups)) {
      const response = await fetch(
        `/api/github/file?repo=${encodeURIComponent(linkedRepo.fullName)}&path=${encodeURIComponent(filePath)}&branch=${encodeURIComponent(linkedRepo.defaultBranch)}`,
        { headers: { ...getAuthHeaders(), "x-github-token": githubPushToken } }
      );
      if (!response.ok) throw new Error(`Could not fetch ${filePath.split("/").pop()} (${response.status})`);
      const data = await response.json() as { content: string };
      let content = data.content;
      for (const patch of patches) {
        const idx = content.indexOf(patch.find);
        if (idx === -1) throw new Error(`Anchor not found in ${filePath.split("/").pop()}. Ask Atlas to re-read the file first.`);
        content = content.slice(0, idx) + patch.replace + content.slice(idx + patch.find.length);
      }
      const ext = filePath.split(".").pop() ?? "";
      const language = ["ts", "tsx"].includes(ext) ? "typescript" : ["js", "jsx"].includes(ext) ? "javascript" : ext;
      edits.push({ path: filePath, language, content });
    }
    return edits;
  };

  const handlePlanApprove = async () => {
    if (!message.plan || planState === "executing") return;
    const firstStepOrder = message.plan.steps[0]?.order ?? 1;
    setPlanStatus("executing");
    setPlanExecution({ currentStepOrder: firstStepOrder, completedStepOrders: [] });
    onStreamActivityUpdate(message, `PLAN_STEP:${message.plan.steps[0]?.description ?? message.plan.title}`);

    const codeEdits = userEdits.length > 0 ? userEdits : activeEdits;
    const hasCodeChanges = codeEdits.length > 0 || (message.linePatches?.length ?? 0) > 0;

    if (message.planFromHome && !hasCodeChanges) {
      onExecuteHomePlan(message.plan);
      return;
    }

    if (!hasCodeChanges) {
      setPlanExecution({
        completedStepOrders: message.plan.steps.map((step) => step.order),
        changedFiles: 0,
        statusMessage: "Done. 0 files changed.",
      });
      setPlanStatus("completed");
      onStreamActivityComplete();
      return;
    }

    try {
      const patchEdits = await resolvePlanLinePatches();
      const modalEdits = [...codeEdits, ...patchEdits];
      if (modalEdits.length === 0) {
        setPlanExecution({
          completedStepOrders: message.plan.steps.map((step) => step.order),
          changedFiles: 0,
          statusMessage: "Done. 0 files changed.",
        });
        setPlanStatus("completed");
        onStreamActivityComplete();
        return;
      }
      const pushStep = message.plan.steps.find((step) => step.type === "push") ?? message.plan.steps[message.plan.steps.length - 1];
      setPlanExecution({
        currentStepOrder: pushStep?.order,
        completedStepOrders: message.plan.steps.filter((step) => step.order !== pushStep?.order).map((step) => step.order),
      });
      onStreamActivityUpdate(message, `PLAN_STEP:${pushStep?.description ?? "Review and push changes"}`);
      setPlanPushEdits(modalEdits);
      setShowPlanPushModal(true);
    } catch (error) {
      setPlanExecution({
        currentStepOrder: undefined,
        completedStepOrders: [],
        failedStep: {
          order: firstStepOrder,
          error: error instanceof Error ? error.message : "Plan execution failed.",
        },
      });
      setPlanStatus("pending");
      onStreamActivityComplete();
    }
  };

  return (
    <>
      <PlanCard
        plan={message.plan}
        messageId={planMessageId}
        projectId={projectId}
        isExecuting={planState === "executing"}
        isExpanded={planState === "reviewing"}
        isCompleted={planState === "completed"}
        execution={planExecution}
        onReview={() => setPlanStatus(planState === "reviewing" ? "pending" : "reviewing")}
        onSkip={() => setPlanStatus("skipped")}
        onApprove={() => void handlePlanApprove()}
      />

      {showPlanPushModal && planPushEdits && planPushEdits.length > 0 && (
        <GitHubPushModal
          fileEdits={planPushEdits}
          linkedRepo={linkedRepo}
          projectId={projectId}
          onClose={() => {
            setShowPlanPushModal(false);
            setPlanStatus("pending");
            setPlanExecution(null);
            onStreamActivityComplete();
          }}
          onPushSuccess={(records) => {
            onPushSuccess(records);
            const changedFiles = new Set(records.map((record) => record.path)).size;
            setPlanExecution({
              completedStepOrders: message.plan?.steps.map((step) => step.order) ?? [],
              changedFiles,
              statusMessage: `Done. ${changedFiles} file${changedFiles === 1 ? "" : "s"} changed.`,
            });
            setPlanStatus("completed");
            setShowPlanPushModal(false);
            onStreamActivityComplete();
          }}
          onPrCreated={onPrCreated}
        />
      )}
    </>
  );
}

export function ReviewTabPanel({
  messages,
  projectId,
  linkedRepo,
  githubPushToken,
  planStates,
  planExecutions,
  onPlanStateChange,
  onPlanExecutionChange,
  onExecuteHomePlan,
  onStreamActivityUpdate,
  onStreamActivityComplete,
  onPushSuccess,
  onPrCreated,
}: {
  messages: ChatMessage[];
  projectId: number;
  linkedRepo: LinkedRepo | null;
  githubPushToken?: string | null;
  planStates: Map<number, PlanState>;
  planExecutions: Map<number, PlanExecution>;
  onPlanStateChange: (messageId: number, state: PlanState) => void;
  onPlanExecutionChange: (messageId: number, execution: PlanExecution | null) => void;
  onExecuteHomePlan: (plan: Plan) => void;
  onStreamActivityUpdate: (message: ChatMessage, content: string) => void;
  onStreamActivityComplete: () => void;
  onPushSuccess: (records: PushRecord[]) => void;
  onPrCreated?: (prUrl: string) => void;
}) {
  return (
    <div style={{ flex: 1, height: "100%", overflowY: "auto", padding: "16px 22px 28px" }} className="scrollbar-none">
      {messages.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--atlas-muted)", fontFamily: "var(--app-font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.55 }}>
          No review items yet.
        </div>
      ) : (
        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((message, index) => {
            const messageId = message.id ?? 0;
            return (
              <ReviewPlanCard
                key={message.id ?? `review-${index}`}
                message={message}
                projectId={projectId}
                linkedRepo={linkedRepo}
                githubPushToken={githubPushToken}
                planState={planStates.get(messageId) ?? "pending"}
                planExecution={planExecutions.get(messageId)}
                onPlanStateChange={onPlanStateChange}
                onPlanExecutionChange={onPlanExecutionChange}
                onExecuteHomePlan={onExecuteHomePlan}
                onStreamActivityUpdate={onStreamActivityUpdate}
                onStreamActivityComplete={onStreamActivityComplete}
                onPushSuccess={onPushSuccess}
                onPrCreated={onPrCreated}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
