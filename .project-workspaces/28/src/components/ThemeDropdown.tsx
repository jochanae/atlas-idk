/**
 * ⚠️  CRITICAL SHARED COMPONENT — Uses Radix Portal pattern.
 * DO NOT wrap in containers with overflow-hidden or revert to manual dropdown.
 * Covered by: src/components/__tests__/ThemeDropdown.test.tsx
 */
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ThemeDropdownProps {
  buttonClassName?: string;
}

const ThemeDropdown = ({ buttonClassName = "rounded-full text-muted-foreground hover:text-foreground h-8 w-8 border border-border/80 shadow-sm bg-card/50 backdrop-blur-sm" }: ThemeDropdownProps) => {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const options = [
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
    { value: "system" as const, label: "System", icon: Monitor },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={buttonClassName}
          title="Toggle theme"
        >
          {resolvedTheme === "dark" ? <Moon className="w-4 h-4 text-amber-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[100]">
        {options.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onClick={() => setTheme(o.value)}
            className="flex items-center justify-between gap-2 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <o.icon className={`w-4 h-4 ${
                o.value === "light" ? "text-amber-500" : 
                o.value === "dark" ? "text-amber-400" : 
                "text-teal-500"
              }`} />
              <span>{o.label}</span>
            </div>
            {theme === o.value && <Check className="w-3.5 h-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeDropdown;
