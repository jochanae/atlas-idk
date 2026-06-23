import { useEffect, useState } from "react";
import { Search, Sparkles, BookOpen, Zap, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { useArc } from "./ArcProvider";

const quickActions = [
  { label: "Build a presentation (guided)", prompt: "Help me build a presentation from scratch", icon: BookOpen },
  { label: "Quick draft a deck", prompt: "I need a quick deck. Let me describe what I need.", icon: Zap },
  { label: "Coach me on my deck", prompt: "Review my current deck and suggest improvements", icon: MessageSquare },
  { label: "Strengthen my opening", prompt: "Help me create a powerful opening slide that hooks my audience", icon: Sparkles },
  { label: "Add emotional impact", prompt: "Help me add more emotional depth to my presentation", icon: Sparkles },
  { label: "Practice my delivery", prompt: "I want to rehearse my delivery. Give me coaching tips.", icon: Sparkles },
];

const ArcCommandBar = () => {
  const { isCommandOpen, openCommand, closeCommand, sendMessage } = useArc();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openCommand();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openCommand]);

  const handleSelect = (prompt: string) => {
    sendMessage(prompt);
    setQuery("");
  };

  const handleSubmitCustom = () => {
    if (query.trim()) {
      sendMessage(query.trim());
      setQuery("");
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 border-border bg-secondary/50 text-muted-foreground hover:text-foreground px-3 min-w-[220px] justify-start"
        onClick={openCommand}
      >
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs">Ask Arc anything...</span>
        <kbd className="ml-auto text-[10px] bg-background/50 px-1.5 py-0.5 rounded border border-border">⌘K</kbd>
      </Button>

      <CommandDialog open={isCommandOpen} onOpenChange={(open) => !open && closeCommand()}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-display font-medium text-primary">Arc</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">What are we building?</span>
        </div>
        <CommandInput
          placeholder="Describe your presentation or ask for help..."
          value={query}
          onValueChange={setQuery}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              e.preventDefault();
              handleSubmitCustom();
            }
          }}
        />
        <CommandList>
          <CommandEmpty>
            {query.trim() ? (
              <button
                className="w-full text-left px-4 py-3 text-sm hover:bg-secondary rounded-md transition-colors"
                onClick={handleSubmitCustom}
              >
                <span className="text-muted-foreground">Ask Arc: </span>
                <span className="text-foreground font-medium">"{query}"</span>
              </button>
            ) : (
              <span className="text-muted-foreground">Type anything to ask Arc...</span>
            )}
          </CommandEmpty>
          <CommandGroup heading="Get Started">
            {quickActions.map((action) => (
              <CommandItem
                key={action.label}
                onSelect={() => handleSelect(action.prompt)}
                className="cursor-pointer"
              >
                <action.icon className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                {action.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
};

export default ArcCommandBar;
