import { useState, useRef, useEffect } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useParams } from "react-router-dom";
import { BarChart3, Send, MessageSquare, Check, Heart, GraduationCap, CheckCircle2, XCircle } from "lucide-react";
import ThemeDropdown from "@/components/ThemeDropdown";
import LiveReactions from "@/components/audience/LiveReactions";
import PulseCheck from "@/components/audience/PulseCheck";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePolls, usePollVotes, useCastVote } from "@/hooks/useLivePolls";
import { useLiveQuestions, useSubmitQuestion } from "@/hooks/useLiveQuestions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

function getVoterSession(): string {
  let s = sessionStorage.getItem("voter_session");
  if (!s) { s = crypto.randomUUID(); sessionStorage.setItem("voter_session", s); }
  return s;
}

function WordCloudAudience({ poll }: { poll: any }) {
  const session = useRef(getVoterSession());
  const [word, setWord] = useState("");
  const { data: votes = [] } = usePollVotes(poll.id);
  const castVote = useCastVote();
  const mySubmission = votes.find((v: any) => v.voter_session.startsWith(session.current));

  const wordData = Object.entries(
    votes.reduce((acc: Record<string, number>, v: any) => {
      const w = (v.voter_session || "").split("::")[1] || "";
      if (w) acc[w.toLowerCase()] = (acc[w.toLowerCase()] || 0) + 1;
      return acc;
    }, {})
  ).map(([text, count]) => ({ text, count: count as number })).sort((a, b) => b.count - a.count);

  const maxCount = wordData.length > 0 ? Math.max(...wordData.map((w) => w.count)) : 1;

  const handleSubmit = () => {
    if (!word.trim()) return;
    if (mySubmission) { toast.info("You've already submitted"); return; }
    castVote.mutate(
      { poll_id: poll.id, option_index: 0, voter_session: `${session.current}::${word.trim()}` },
      { onSuccess: () => { setWord(""); toast.success("Word submitted!"); }, onError: () => toast.error("Already submitted") }
    );
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
      <div className="flex items-start justify-between">
        <h3 className="font-semibold text-foreground">{poll.question}</h3>
        <Badge variant="outline" className="text-xs shrink-0 ml-2">☁️ Word Cloud</Badge>
      </div>
      {!mySubmission ? (
        <div className="flex gap-2">
          <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Type a word..." onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
          <Button onClick={handleSubmit} disabled={!word.trim() || castVote.isPending} size="sm">
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">✓ You submitted your word</p>
      )}
      {(poll.show_results || mySubmission) && wordData.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 py-2">
          {wordData.map((w) => {
            const scale = 0.7 + (w.count / maxCount) * 1.3;
            return (
              <span key={w.text} className="text-primary font-semibold" style={{ fontSize: `${Math.round(scale * 16)}px`, opacity: 0.5 + (w.count / maxCount) * 0.5 }}>
                {w.text}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AudiencePollCard({ poll }: { poll: any }) {
  const session = useRef(getVoterSession());
  const { data: votes = [] } = usePollVotes(poll.id);
  const castVote = useCastVote();
  const myVote = votes.find((v: any) => v.voter_session === session.current);
  const totalVotes = votes.length;

  const voteCounts = (poll.options as string[]).map((_, i) =>
    votes.filter((v: any) => v.option_index === i).length
  );

  const handleVote = (i: number) => {
    if (myVote) { toast.info("You've already voted"); return; }
    castVote.mutate({ poll_id: poll.id, option_index: i, voter_session: session.current }, {
      onSuccess: () => toast.success("Vote recorded!"),
      onError: () => toast.error("Already voted"),
    });
  };

  const showResults = poll.show_results || !!myVote;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
      <div className="flex items-start justify-between">
        <h3 className="font-semibold text-foreground">{poll.question}</h3>
        <Badge className="text-xs shrink-0 ml-2">{totalVotes} votes</Badge>
      </div>
      <div className="space-y-2">
        {(poll.options as string[]).map((opt: string, i: number) => {
          const pct = totalVotes > 0 ? Math.round((voteCounts[i] / totalVotes) * 100) : 0;
          const isMyVote = myVote?.option_index === i;
          return (
            <button
              key={i}
              onClick={() => handleVote(i)}
              disabled={!!myVote}
              className={`w-full text-left rounded-lg border p-3 transition-all ${
                isMyVote ? "border-primary bg-primary/10" : "hover:border-primary/50 hover:bg-accent/50"
              } ${myVote ? "cursor-default" : "cursor-pointer"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground flex items-center gap-2">
                  {isMyVote && <Check className="w-3.5 h-3.5 text-primary" />}
                  {opt}
                </span>
                {showResults && <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>}
              </div>
              {showResults && (
                <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface QuizSlide {
  id: string;
  sort_order: number;
  content: {
    heading?: string;
    question?: string;
    choices?: string[];
    correctIndex?: number;
    explanation?: string;
  };
}

function AudienceQuizCard({ quiz, index }: { quiz: QuizSlide; index: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const handleSelect = (i: number) => {
    if (revealed) return;
    setSelected(i);
  };

  const handleReveal = () => {
    if (selected === null) { toast.info("Pick an answer first"); return; }
    setRevealed(true);
  };

  const isCorrect = selected === quiz.content.correctIndex;
  const choices = quiz.content.choices || [];

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
      <div className="flex items-start justify-between">
        <h3 className="font-semibold text-foreground">{quiz.content.heading || `Quiz ${index + 1}`}</h3>
        <Badge variant="outline" className="text-xs shrink-0 ml-2">
          <GraduationCap className="w-3 h-3 mr-1" /> Quiz
        </Badge>
      </div>
      <p className="text-sm text-foreground">{quiz.content.question}</p>
      <div className="space-y-2">
        {choices.map((choice, i) => {
          const letter = String.fromCharCode(65 + i);
          const isThis = selected === i;
          const isAnswer = quiz.content.correctIndex === i;
          let borderClass = "border-border hover:border-primary/50";
          if (revealed && isAnswer) borderClass = "border-green-500 bg-green-500/10";
          else if (revealed && isThis && !isAnswer) borderClass = "border-destructive bg-destructive/10";
          else if (isThis) borderClass = "border-primary bg-primary/10";

          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={revealed}
              className={`w-full text-left rounded-lg border p-3 transition-all ${borderClass} ${revealed ? "cursor-default" : "cursor-pointer"}`}
            >
              <span className="text-sm font-medium text-foreground flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-bold shrink-0">{letter}</span>
                {choice}
                {revealed && isAnswer && <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto shrink-0" />}
                {revealed && isThis && !isAnswer && <XCircle className="w-4 h-4 text-destructive ml-auto shrink-0" />}
              </span>
            </button>
          );
        })}
      </div>
      {!revealed ? (
        <Button onClick={handleReveal} disabled={selected === null} className="w-full">
          Check Answer
        </Button>
      ) : (
        <div className={`rounded-lg p-3 text-sm ${isCorrect ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
          <p className="font-medium">{isCorrect ? "✓ Correct!" : "✗ Not quite."}</p>
          {quiz.content.explanation && <p className="mt-1 opacity-80">{quiz.content.explanation}</p>}
        </div>
      )}
    </div>
  );
}

export default function AudienceInteract() {
  const { id: presentationId } = useParams<{ id: string }>();
  const { data: polls = [], isLoading: pollsLoading } = usePolls(presentationId);
  const { data: questions = [] } = useLiveQuestions(presentationId);
  const submitQuestion = useSubmitQuestion();
  const [quizSlides, setQuizSlides] = useState<QuizSlide[]>([]);
  const [quizzesLoading, setQuizzesLoading] = useState(true);

  const [questionText, setQuestionText] = useState("");
  const [authorName, setAuthorName] = useState("");

  // Fetch quiz slides from the presentation
  useEffect(() => {
    if (!presentationId) return;
    (async () => {
      const { data } = await supabase
        .from("slides")
        .select("id, sort_order, content")
        .eq("presentation_id", presentationId)
        .eq("block_type", "quiz")
        .order("sort_order");
      setQuizSlides((data || []) as unknown as QuizSlide[]);
      setQuizzesLoading(false);
    })();
  }, [presentationId]);

  const activePolls = polls.filter((p: any) => p.is_active);

  const handleSubmitQuestion = () => {
    if (!questionText.trim() || !presentationId) return;
    submitQuestion.mutate({
      presentation_id: presentationId,
      body: questionText.trim(),
      author_name: authorName.trim() || "Anonymous",
    }, {
      onSuccess: () => { setQuestionText(""); toast.success("Question submitted!"); },
      onError: () => toast.error("Failed to submit"),
    });
  };

  if (!presentationId) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" /> Live Interaction
        </h1>
        <ThemeDropdown />
      </header>

      <div className="max-w-lg mx-auto p-4">
        <Tabs defaultValue={quizSlides.length > 0 ? "quizzes" : "polls"}>
          <TabsList className="w-full mb-4">
            {quizSlides.length > 0 && (
              <TabsTrigger value="quizzes" className="flex-1 gap-1.5">
                <GraduationCap className="w-3.5 h-3.5" /> Quizzes
                <Badge variant="secondary" className="text-xs ml-1">{quizSlides.length}</Badge>
              </TabsTrigger>
            )}
            <TabsTrigger value="polls" className="flex-1 gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> Polls
              {activePolls.length > 0 && <Badge variant="secondary" className="text-xs ml-1">{activePolls.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="react" className="flex-1 gap-1.5">
              <Heart className="w-3.5 h-3.5" /> React
            </TabsTrigger>
            <TabsTrigger value="qa" className="flex-1 gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" /> Q&A
            </TabsTrigger>
          </TabsList>

          {quizSlides.length > 0 && (
            <TabsContent value="quizzes" className="space-y-4">
              {quizzesLoading ? (
                <div className="flex justify-center py-8"><LoadingSpinner size="sm" text="Loading quizzes…" /></div>
              ) : (
                quizSlides.map((q, i) => <AudienceQuizCard key={q.id} quiz={q} index={i} />)
              )}
            </TabsContent>
          )}

          <TabsContent value="polls" className="space-y-4">
            {pollsLoading ? (
              <div className="flex justify-center py-8"><LoadingSpinner size="sm" text="Loading polls…" /></div>
            ) : activePolls.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground">No active polls right now</p>
                <p className="text-xs text-muted-foreground">Check back when the presenter activates a poll</p>
              </div>
            ) : (
              activePolls.map((poll: any) =>
                poll.poll_type === "word_cloud"
                  ? <WordCloudAudience key={poll.id} poll={poll} />
                  : <AudiencePollCard key={poll.id} poll={poll} />
              )
            )}
          </TabsContent>

          <TabsContent value="react" className="space-y-4">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Send a Reaction</h3>
              <LiveReactions presentationId={presentationId} isAudience />
            </div>
            <PulseCheck presentationId={presentationId} isAudience />
          </TabsContent>

          <TabsContent value="qa" className="space-y-4">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <Input
                placeholder="Your name (optional)"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="text-sm"
              />
              <Textarea
                placeholder="Ask a question..."
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                rows={3}
              />
              <Button
                onClick={handleSubmitQuestion}
                disabled={!questionText.trim() || submitQuestion.isPending}
                className="w-full gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                {submitQuestion.isPending ? "Submitting..." : "Submit Question"}
              </Button>
            </div>

            {questions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Recent Questions</h3>
                {questions.map((q: any) => (
                  <div key={q.id} className={`rounded-lg border p-3 ${q.is_answered ? "opacity-50" : "bg-card"}`}>
                    <p className="text-sm text-foreground">{q.body}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">— {q.author_name}</span>
                      {q.is_answered && <Badge variant="secondary" className="text-xs">Answered</Badge>}
                      {q.is_pinned && <Badge className="text-xs">Pinned</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
