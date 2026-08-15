import { create } from "zustand";

export interface PermissionDetails {
  level: string;
  decision: string;
  source: string;
}

export interface ToolApprovalRequest {
  requestId: string;
  streamId?: string | null;
  serverName: string;
  toolName: string;
  arguments: unknown;
  permission: PermissionDetails;
  requestedAt: string;
}

interface ToolApprovalState {
  pending: ToolApprovalRequest[];
  upsertPending: (request: ToolApprovalRequest) => void;
  removePending: (requestId: string) => void;
  clearForTool: (streamId: string | null | undefined, serverName: string, toolName: string) => void;
}

export const useToolApprovalStore = create<ToolApprovalState>((set) => ({
  pending: [],
  upsertPending: (request) =>
    set((state) => {
      const next = state.pending.filter((item) => item.requestId !== request.requestId);
      next.unshift(request);
      return { pending: next };
    }),
  removePending: (requestId) =>
    set((state) => ({
      pending: state.pending.filter((item) => item.requestId !== requestId),
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
