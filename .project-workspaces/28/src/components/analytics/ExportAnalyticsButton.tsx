import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

interface ExportAnalyticsButtonProps {
  presTitle: string;
  totalViews: number;
  uniqueViewers: number;
  avgTime: number;
  slideData: { slide: string; views: number; avgTime: number }[];
}

export default function ExportAnalyticsButton({ presTitle, totalViews, uniqueViewers, avgTime, slideData }: ExportAnalyticsButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const lines = [
        `Analytics Report: ${presTitle || "All Presentations"}`,
        `Generated: ${new Date().toLocaleString()}`,
        "",
        "Summary",
        `Total Views,${totalViews}`,
        `Unique Viewers,${uniqueViewers}`,
        `Avg Time per View (s),${avgTime}`,
        "",
        "Slide,Views,Avg Time (s)",
        ...slideData.map((s) => `${s.slide},${s.views},${s.avgTime}`),
      ];
      const csv = lines.join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${presTitle || "all"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Analytics report exported!");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting} className="gap-1.5">
      {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      Export CSV
    </Button>
  );
}
