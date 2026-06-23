import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame } from "lucide-react";

interface ViewRow {
  slide_index: number;
  time_spent_seconds: number;
  viewer_session: string;
  created_at: string;
}

interface EngagementHeatmapProps {
  views: ViewRow[];
  slideCount: number;
}

export default function EngagementHeatmap({ views, slideCount }: EngagementHeatmapProps) {
  const heatData = useMemo(() => {
    // Build a 7-day x slide grid
    const now = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split("T")[0];
    });

    const grid: number[][] = days.map(() => new Array(Math.min(slideCount, 20)).fill(0));

    views.forEach((v) => {
      const day = v.created_at.split("T")[0];
      const dayIdx = days.indexOf(day);
      if (dayIdx >= 0 && v.slide_index < 20) {
        grid[dayIdx][v.slide_index] += v.time_spent_seconds;
      }
    });

    const maxVal = Math.max(1, ...grid.flat());
    return { days, grid, maxVal };
  }, [views, slideCount]);

  const getColor = (val: number) => {
    if (val === 0) return "bg-secondary/30";
    const intensity = val / heatData.maxVal;
    if (intensity > 0.75) return "bg-primary";
    if (intensity > 0.5) return "bg-primary/70";
    if (intensity > 0.25) return "bg-primary/40";
    return "bg-primary/20";
  };

  const slides = Math.min(slideCount, 20);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="w-4 h-4 text-primary" /> Engagement Heatmap
          <Badge variant="secondary" className="text-[10px]">7 days</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {/* Column headers */}
          <div className="flex items-center gap-0.5 ml-16">
            {Array.from({ length: slides }, (_, i) => (
              <div key={i} className="text-[8px] text-muted-foreground text-center" style={{ width: 20 }}>
                S{i + 1}
              </div>
            ))}
          </div>
          {/* Rows */}
          {heatData.days.map((day, dayIdx) => (
            <div key={day} className="flex items-center gap-0.5">
              <span className="text-[10px] text-muted-foreground w-14 shrink-0 text-right pr-2">
                {new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              {heatData.grid[dayIdx].map((val, slideIdx) => (
                <div
                  key={slideIdx}
                  className={`w-5 h-5 rounded-sm transition-colors ${getColor(val)}`}
                  title={`Slide ${slideIdx + 1}, ${day}: ${val}s`}
                />
              ))}
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 justify-end">
          <span className="text-[10px] text-muted-foreground">Less</span>
          {["bg-secondary/30", "bg-primary/20", "bg-primary/40", "bg-primary/70", "bg-primary"].map((c, i) => (
            <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
          ))}
          <span className="text-[10px] text-muted-foreground">More</span>
        </div>
      </CardContent>
    </Card>
  );
}
