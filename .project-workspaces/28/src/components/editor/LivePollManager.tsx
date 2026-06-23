import { useState } from "react";
import { useParams } from "react-router-dom";
import { BarChart3, Plus, Trash2, Play, Square, Eye, EyeOff, Pin, Check, X, MessageSquare } from "lucide-react";
import AudienceShareButton from "./AudienceShareButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { usePolls, usePollVotes, useCreatePoll, useTogglePoll, useDeletePoll } from "@/hooks/useLivePolls";
import { useLiveQuestions, useManageQuestion, useDeleteQuestion } from "@/hooks/useLiveQuestions";
import { toast } from "sonner";

function PollResultBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-foreground font-medium truncate">{label}</span>
        <span className="text-muted-foreground tabular-nums">{count} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function WordCloudViz({ words }: { words: { text: string; count: number }[] }) {
  if (words.length === 0) return <p className="text-xs text-muted-foreground text-center py-3">No responses yet</p>;
  const maxCount = Math.max(...words.map((w) => w.count));
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 py-3">
      {words.map((w) => {
        const scale = 0.7 + (w.count / maxCount) * 1.3;
        return (
          <span
            key={w.text}
            className="text-primary font-semibold transition-all"
            style={{ fontSize: `${Math.round(scale * 14)}px`, opacity: 0.5 + (w.count / maxCount) * 0.5 }}
          >
            {w.text}
            <sup className="text-[9px] text-muted-foreground ml-0.5">{w.count}</sup>
          </span>
        );
      })}
    </div>
  );
}

function PollCard({ poll, presentationId }: { poll: any; presentationId: string }) {
  const { data: votes = [] } = usePollVotes(poll.id);
  const togglePoll = useTogglePoll();
  const deletePoll = useDeletePoll();
  const totalVotes = votes.length;
  const isWordCloud = poll.poll_type === "word_cloud";

  // For word cloud, aggregate text responses from voter_session field (we store the word there)
  const wordCloudData = isWordCloud
    ? Object.entries(
        votes.reduce((acc: Record<string, number>, v: any) => {
          const word = (v.voter_session || "").split("::")[1] || "";
          if (word) acc[word.toLowerCase()] = (acc[word.toLowerCase()] || 0) + 1;
          return acc;
        }, {})
      ).map(([text, count]) => ({ text, count: count as number })).sort((a, b) => b.count - a.count)
    : [];

  const voteCounts = !isWordCloud
    ? (poll.options as string[]).map((_, i) => votes.filter((v: any) => v.option_index === i).length)
    : [];

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground text-sm leading-snug">{poll.question}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={poll.is_active ? "default" : "secondary"} className="text-xs">
              {poll.is_active ? "Live" : "Inactive"}
            </Badge>
            {isWordCloud && <Badge variant="outline" className="text-xs">☁️ Word Cloud</Badge>}
            <span className="text-xs text-muted-foreground">{totalVotes} responses</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => togglePoll.mutate({ id: poll.id, is_active: !poll.is_active, presentationId })}
          >
            {poll.is_active ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => togglePoll.mutate({ id: poll.id, show_results: !poll.show_results, presentationId })}
          >
            {poll.show_results ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7 text-destructive"
            onClick={() => { deletePoll.mutate({ id: poll.id, presentationId }); toast.success("Poll deleted"); }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {isWordCloud ? (
        <WordCloudViz words={wordCloudData} />
      ) : (
        <div className="space-y-2">
          {(poll.options as string[]).map((opt: string, i: number) => (
            <PollResultBar key={i} label={opt} count={voteCounts[i]} total={totalVotes} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionCard({ q, presentationId }: { q: any; presentationId: string }) {
  const manage = useManageQuestion();
  const del = useDeleteQuestion();

  return (
    <div className={`rounded-lg border p-3 space-y-1.5 ${q.is_pinned ? "bg-primary/5 border-primary/30" : "bg-card"} ${q.is_answered ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">{q.body}</p>
          <p className="text-xs text-muted-foreground mt-0.5">— {q.author_name}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button variant="ghost" size="icon" className="h-6 w-6"
            onClick={() => manage.mutate({ id: q.id, presentationId, is_pinned: !q.is_pinned })}>
            <Pin className={`w-3 h-3 ${q.is_pinned ? "text-primary" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6"
            onClick={() => manage.mutate({ id: q.id, presentationId, is_answered: !q.is_answered })}>
            <Check className={`w-3 h-3 ${q.is_answered ? "text-green-500" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"
            onClick={() => del.mutate({ id: q.id, presentationId })}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreatePollDialog({ presentationId }: { presentationId: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [pollType, setPollType] = useState<"multiple_choice" | "word_cloud">("multiple_choice");
  const createPoll = useCreatePoll();

  const addOption = () => setOptions((p) => [...p, ""]);
  const updateOption = (i: number, v: string) => setOptions((p) => p.map((o, idx) => (idx === i ? v : o)));
  const removeOption = (i: number) => setOptions((p) => p.filter((_, idx) => idx !== i));

  const handleCreate = () => {
    if (!question.trim()) { toast.error("Need a question"); return; }
    if (pollType === "multiple_choice") {
      const validOptions = options.filter((o) => o.trim());
      if (validOptions.length < 2) { toast.error("Need at least 2 options"); return; }
      createPoll.mutate({ presentation_id: presentationId, question: question.trim(), options: validOptions, poll_type: "multiple_choice" }, {
        onSuccess: () => { setOpen(false); setQuestion(""); setOptions(["", ""]); toast.success("Poll created"); },
      });
    } else {
      createPoll.mutate({ presentation_id: presentationId, question: question.trim(), options: [], poll_type: "word_cloud" }, {
        onSuccess: () => { setOpen(false); setQuestion(""); toast.success("Word cloud created"); },
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" /> New Poll</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create Live Poll</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={pollType === "multiple_choice" ? "default" : "outline"}
              size="sm"
              onClick={() => setPollType("multiple_choice")}
              className="flex-1 text-xs"
            >
              Multiple Choice
            </Button>
            <Button
              variant={pollType === "word_cloud" ? "default" : "outline"}
              size="sm"
              onClick={() => setPollType("word_cloud")}
              className="flex-1 text-xs"
            >
              ☁️ Word Cloud
            </Button>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Question</label>
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={pollType === "word_cloud" ? "Describe this topic in one word..." : "What do you think about...?"} className="mt-1" />
          </div>
          {pollType === "multiple_choice" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Options</label>
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={opt} onChange={(e) => updateOption(i, e.target.value)} placeholder={`Option ${i + 1}`} />
                  {options.length > 2 && (
                    <Button variant="ghost" size="icon" className="shrink-0 h-10 w-10" onClick={() => removeOption(i)}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              {options.length < 6 && (
                <Button variant="outline" size="sm" onClick={addOption} className="gap-1.5 w-full">
                  <Plus className="w-3.5 h-3.5" /> Add Option
                </Button>
              )}
            </div>
          )}
          {pollType === "word_cloud" && (
            <p className="text-xs text-muted-foreground">Audience members will submit free-text responses that appear as a word cloud visualization.</p>
          )}
          <Button onClick={handleCreate} disabled={createPoll.isPending} className="w-full">
            {createPoll.isPending ? "Creating..." : pollType === "word_cloud" ? "Create Word Cloud" : "Create Poll"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function LivePollManager() {
  const { id: presentationId } = useParams<{ id: string }>();
  const { data: polls = [] } = usePolls(presentationId);
  const { data: questions = [] } = useLiveQuestions(presentationId);

  if (!presentationId) return null;

  const activePolls = polls.filter((p) => p.is_active);
  const unanswered = questions.filter((q: any) => !q.is_answered);

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-primary" /> Live Interaction
        </h3>
        <div className="flex items-center gap-2">
          {activePolls.length > 0 && <Badge className="text-xs">{activePolls.length} live</Badge>}
          {unanswered.length > 0 && <Badge variant="secondary" className="text-xs">{unanswered.length} Q</Badge>}
        </div>
      </div>

      <Tabs defaultValue="polls" className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none border-b bg-transparent h-9">
          <TabsTrigger value="polls" className="flex-1 text-xs gap-1"><BarChart3 className="w-3 h-3" /> Polls</TabsTrigger>
          <TabsTrigger value="qa" className="flex-1 text-xs gap-1"><MessageSquare className="w-3 h-3" /> Q&A</TabsTrigger>
        </TabsList>

        <TabsContent value="polls" className="flex-1 overflow-auto p-3 space-y-3 m-0">
          <CreatePollDialog presentationId={presentationId} />
          {polls.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No polls yet. Create one to engage your audience!</p>
          ) : (
            polls.map((poll) => <PollCard key={poll.id} poll={poll} presentationId={presentationId} />)
          )}
        </TabsContent>

        <TabsContent value="qa" className="flex-1 overflow-auto p-3 space-y-2 m-0">
          {questions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No questions yet. Audience questions will appear here in real-time.</p>
          ) : (
            questions.map((q: any) => <QuestionCard key={q.id} q={q} presentationId={presentationId} />)
          )}
        </TabsContent>
      </Tabs>

      <div className="p-3 border-t flex justify-center">
        <AudienceShareButton presentationId={presentationId} />
      </div>
    </div>
  );
}
