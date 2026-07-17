import MessageAttachmentChip from "./MessageAttachmentChip";
import type {
  PersistedAttachment,
  StagedAttachment,
} from "@/lib/attachments/types";

export interface StagedRowProps {
  kind: "staged";
  items: StagedAttachment[];
  onRemove?: (clientId: string) => void;
  onRetry?: (clientId: string) => void;
}

export interface PersistedRowProps {
  kind: "persisted";
  items: PersistedAttachment[];
  onOpen?: (attachmentId: string) => void;
  onUseAgain?: (attachmentId: string) => void;
  onSaveToLibrary?: (attachmentId: string) => void;
  onDownload?: (attachmentId: string) => void;
}

export type AttachmentRowProps = StagedRowProps | PersistedRowProps;

/**
 * Rail of attachment chips. Used both in the composer (staged) and beneath
 * sent messages (persisted). Rendered as an accessible list so screen readers
 * enumerate attachments per message.
 */
export function AttachmentRow(props: AttachmentRowProps) {
  if (props.items.length === 0) return null;
  return (
    <ul
      role="list"
      aria-label={props.kind === "staged" ? "Staged attachments" : "Message attachments"}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        padding: 0,
        margin: 0,
        listStyle: "none",
      }}
    >
      {props.kind === "staged"
        ? props.items.map((s) => (
            <li key={s.clientId}>
              <MessageAttachmentChip
                variant={{ kind: "staged", attachment: s }}
                onAction={(a) => {
                  if (a === "remove") props.onRemove?.(s.clientId);
                  else if (a === "retry") props.onRetry?.(s.clientId);
                }}
              />
            </li>
          ))
        : props.items.map((p) => (
            <li key={p.attachmentId}>
              <MessageAttachmentChip
                variant={{ kind: "persisted", attachment: p }}
                onAction={(a) => {
                  if (a === "open") props.onOpen?.(p.attachmentId);
                  else if (a === "use-again") props.onUseAgain?.(p.attachmentId);
                  else if (a === "save-to-library")
                    props.onSaveToLibrary?.(p.attachmentId);
                  else if (a === "download") props.onDownload?.(p.attachmentId);
                }}
              />
            </li>
          ))}
    </ul>
  );
}

export default AttachmentRow;
