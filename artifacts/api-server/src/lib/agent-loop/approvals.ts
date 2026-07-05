interface PendingApproval {
  planId: string;
  projectId: number;
  userId: number;
  toolCallId: string;
}

const pendingApprovals = new Map<string, PendingApproval>();

export function registerPendingApproval(approvalId: string, data: PendingApproval): void {
  pendingApprovals.set(approvalId, data);
  setTimeout(() => pendingApprovals.delete(approvalId), 30 * 60 * 1000);
}

export function resolvePendingApproval(approvalId: string): PendingApproval | undefined {
  const data = pendingApprovals.get(approvalId);
  if (data) pendingApprovals.delete(approvalId);
  return data;
}
