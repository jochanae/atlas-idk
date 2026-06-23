import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AvatarStackProps {
  collaborators: { user_id: string; display_name: string | null; avatar_url: string | null }[];
  max?: number;
}

const AvatarStack = ({ collaborators, max = 3 }: AvatarStackProps) => {
  if (!collaborators.length) return null;

  const visible = collaborators.slice(0, max);
  const overflow = collaborators.length - max;

  return (
    <TooltipProvider>
      <div className="flex items-center -space-x-1.5">
        {visible.map((c) => (
          <Tooltip key={c.user_id}>
            <TooltipTrigger asChild>
              <Avatar className="h-5 w-5 border border-background ring-1 ring-border">
                <AvatarImage src={c.avatar_url || undefined} />
                <AvatarFallback className="text-[8px] bg-primary/20 text-primary">
                  {(c.display_name || "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {c.display_name || "Team member"}
            </TooltipContent>
          </Tooltip>
        ))}
        {overflow > 0 && (
          <span className="flex items-center justify-center h-5 w-5 rounded-full bg-secondary border border-background ring-1 ring-border text-[8px] text-muted-foreground font-medium">
            +{overflow}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
};

export default AvatarStack;
