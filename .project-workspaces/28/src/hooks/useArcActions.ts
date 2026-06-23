import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export interface ArcAction {
  type: "delete" | "move" | "rewrite";
  slideNumber: number; // 1-based
  toPosition?: number; // 1-based, for "move"
  field?: string; // for "rewrite" — valid fields: heading, subheading, body, quote, speaker_script, steps, reference, passage, commentary, image_url
  newValue?: string | string[]; // for "rewrite"
  reason?: string;
}

/** Parse ```arc-actions blocks from assistant message content */
export function parseArcActions(content: string): ArcAction[] {
  const match = content.match(/```arc-actions\s*([\s\S]*?)```/);
  if (!match) return [];
  try {
    const actions = JSON.parse(match[1]);
    if (Array.isArray(actions)) {
      return actions.map((a: any) => ({
        ...a,
        // normalize alternate field names the model sometimes outputs
        slideNumber: a.slideNumber ?? a.slide_index ?? a.slideIndex ?? a.slide,
        newValue: a.newValue ?? a.value ?? a.new_value,
        toPosition: a.toPosition ?? a.to_position,
      })) as ArcAction[];
    }
  } catch { /* invalid JSON */ }
  return [];
}

/** Strip arc-actions blocks from display content */
export function stripArcActionsBlock(content: string): string {
  return content
    .replace(/```arc-actions[\s\S]*?```/g, "")
    .replace(/```arc-image[\s\S]*?```/g, "")
    .replace(/```arc-generate-image[\s\S]*?```/g, "")
    .replace(/```arc-theme[\s\S]*?```/g, "")
    .replace(/```arc-memory[\s\S]*?```/g, "")
    .trim();
}

/** Get a human-readable label for an action */
export function getActionLabel(action: ArcAction): string {
  switch (action.type) {
    case "delete":
      return `Delete slide ${action.slideNumber}`;
    case "move":
      return `Move slide ${action.slideNumber} → position ${action.toPosition}`;
    case "rewrite":
      return `Rewrite slide ${action.slideNumber} (${action.field})`;
    default:
      return `Unknown action`;
  }
}

interface SlideRef {
  id: string;
  sort_order: number;
  content: Json;
  presentation_id: string;
}

export function useApplyArcActions() {
  const qc = useQueryClient();

  const applyActions = useCallback(async (
    actions: ArcAction[],
    slides: SlideRef[],
    presentationId: string
  ): Promise<{ success: boolean; applied: number }> => {
    if (!actions.length || !slides.length) return { success: false, applied: 0 };

    let applied = 0;
    const rewrites = actions.filter(a => a.type === "rewrite");
    const moves = actions.filter(a => a.type === "move");
    const deletes = actions.filter(a => a.type === "delete");

    // Helper: find slide by slideNumber (1-based) OR by slide_id (UUID)
    const findSlide = (action: any): SlideRef | undefined => {
      // Try by UUID first if slide_id present
      if (action.slide_id) {
        const found = slides.find(s => s.id === action.slide_id);
        if (found) return found;
      }
      // Try by 1-based slideNumber
      const num = action.slideNumber;
      if (num && num >= 1 && num <= slides.length) {
        return slides[num - 1];
      }
      return undefined;
    };

    // Apply rewrites
    for (const action of rewrites) {
      const slide = findSlide(action);
      if (!slide) continue;

      const existingContent = typeof slide.content === "object" && slide.content !== null
        ? { ...(slide.content as Record<string, unknown>) }
        : {};

      let newContent: Record<string, unknown>;

      // Handle "value" being a full content object (model hallucination)
      if (typeof (action as any).value === "object" && (action as any).value !== null && !action.field) {
        // Merge the entire value object into content
        newContent = { ...existingContent, ...(action as any).value };
      } else if (action.field && action.newValue !== undefined) {
        // Normal case: set a specific field
        newContent = { ...existingContent };
        newContent[action.field] = action.newValue;
      } else {
        continue;
      }

      const updatePayload: Record<string, unknown> = { content: newContent as Json };
      // Sync notes column when speaker_script changes
      const scriptVal = newContent["speaker_script"];
      if (action.field === "speaker_script" && typeof scriptVal === "string") {
        updatePayload.notes = scriptVal;
      }

      const { error } = await supabase
        .from("slides")
        .update(updatePayload)
        .eq("id", slide.id);

      if (!error) applied++;
    }

    // Apply moves
    for (const action of moves) {
      if (!action.toPosition) continue;
      const fromIdx = action.slideNumber - 1;
      const toIdx = action.toPosition - 1;
      if (fromIdx < 0 || fromIdx >= slides.length || toIdx < 0 || toIdx >= slides.length) continue;

      const ordered = [...slides];
      const [moved] = ordered.splice(fromIdx, 1);
      ordered.splice(toIdx, 0, moved);

      const updates = ordered.map((s, i) =>
        supabase.from("slides").update({ sort_order: i }).eq("id", s.id)
      );
      await Promise.all(updates);
      applied++;
    }

    // Apply deletes (highest index first)
    const sortedDeletes = [...deletes].sort((a, b) => b.slideNumber - a.slideNumber);
    for (const action of sortedDeletes) {
      const slide = findSlide(action);
      if (!slide) continue;

      const { error } = await supabase
        .from("slides")
        .delete()
        .eq("id", slide.id);

      if (!error) applied++;
    }

    qc.invalidateQueries({ queryKey: ["slides", presentationId] });
    return { success: applied > 0, applied };
  }, [qc]);

  return applyActions;
}
