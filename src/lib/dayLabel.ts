/**
 * Shared calendar-day label used by TimelineRail and sticky in-thread dividers.
 * Output is short, uppercase, mono-friendly:
 *   TODAY · YESTERDAY · MON · TUE · JUN 2 · MAY 27
 */
export function dayLabel(t: number, now: number = Date.now()): string {
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;
  const weekStart = today - 6 * 86_400_000;
  if (t >= today) return "TODAY";
  if (t >= yesterday) return "YESTERDAY";
  if (t >= weekStart) {
    return new Date(t)
      .toLocaleDateString(undefined, { weekday: "short" })
      .toUpperCase();
  }
  return new Date(t)
    .toLocaleDateString(undefined, { month: "short", day: "numeric" })
    .toUpperCase();
}

/** Key used to dedupe consecutive messages on the same calendar day. */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
