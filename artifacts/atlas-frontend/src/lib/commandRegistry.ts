export type Command = {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  section?: string;
  action: () => void;
};

const registry = new Map<string, Command>();

export function registerCommand(cmd: Command): void {
  registry.set(cmd.id, cmd);
}

export function unregisterCommand(id: string): void {
  registry.delete(id);
}

export function getAllCommands(): Command[] {
  return Array.from(registry.values());
}

export function searchCommands(query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return getAllCommands();
  return getAllCommands().filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.description?.toLowerCase().includes(q) ||
      cmd.keywords?.some((k) => k.toLowerCase().includes(q)),
  );
}
