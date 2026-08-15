import { create } from "zustand";

export interface PermissionDetails {
  level: string;
  decision: string;
  source: string;
}

export interface CapabilityDetails {
  action: string;
  target: string;
}

export interface ScopeDetails {
  kind: string;
  identifier: string;
}

export interface ToolApprovalRequest {
  approvalId: string;
  streamId?: string | null;
  providerToolName?: string | null;
  serverName: string;
  toolName: string;
  arguments: unknown;
  permission: PermissionDetails;
  riskLevel: string;
  actionLabel: string;
  description?: string | null;
  requestOrigin: string;
  capability: CapabilityDetails;
  scope: ScopeDetails;
  requestedAtMs: number;
  expiresAtMs: number;
}

interface ToolApprovalState {
  pending: ToolApprovalRequest[];
  upsertPending: (request: ToolApprovalRequest) => void;
  removePending: (approvalId: string) => void;
  clearForTool: (streamId: string | null | undefined, serverName: string, toolName: string) => void;
}

export const useToolApprovalStore = create<ToolApprovalState>((set) => ({
  pending: [],
  upsertPending: (request) =>
    set((state) => {
      const next = state.pending.filter((item) => item.approvalId !== request.approvalId);
      next.unshift(request);
      return { pending: next };
    }),
  removePending: (approvalId) =>
    set((state) => ({
      pending: state.pending.filter((item) => item.approvalId !== approvalId),
    })),
  clearForTool: (streamId, serverName, toolName) =>
    set((state) => ({
      pending: state.pending.filter(
        (item) =>
          !(
            item.streamId === streamId &&
            item.serverName === serverName &&
            item.toolName === toolName
          ),
      ),
    })),
}));
