import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUpcomingEvents } from "@/hooks/useEvents";

export default function DashboardCalendar() {
  const [date, setDate] = useState<Date>(new Date());
  const { data: events = [] } = useUpcomingEvents();

  const eventDates = events.map((e) => new Date(e.starts_at));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs h-8"
        >
          <CalendarDays className="w-3.5 h-3.5 text-primary" />
          {format(date, "EEEE, MMMM d, yyyy")}
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">{format(new Date(), "h:mm a")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => d && setDate(d)}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
          modifiers={{ event: eventDates }}
          modifiersClassNames={{ event: "bg-primary/20 text-primary font-bold rounded-full" }}
        />
        {events.length > 0 && (
          <div className="px-3 pb-3 space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Upcoming</p>
            {events.slice(0, 3).map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span className="truncate">{e.title}</span>
                <span className="text-muted-foreground ml-auto text-[10px] whitespace-nowrap">
                  {format(new Date(e.starts_at), "MMM d")}
                </span>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
