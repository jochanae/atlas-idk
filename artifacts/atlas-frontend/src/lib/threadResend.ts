/**
 * Milestone 2.4 Phase C — B4 interrupt/resend honesty.
 * Truncate the visible thread at (and including) the edited user turn so
 * resend does not leave a duplicate user bubble.
 */

export function truncateMessagesForResend<T>(
  messages: T[],
  fromIndex: number,
): T[] {
  if (fromIndex < 0) return messages;
  if (fromIndex >= messages.length) return messages;
  return messages.slice(0, fromIndex);
}
