export interface TerminalExecuteRequest {
  command: string;
  workingDir?: string;
  timeoutMs?: number;
}

export interface TerminalExecuteResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt?: string | null;
}

export interface FileReadRequest {
  path: string;
  maxBytes?: number;
}

export interface FileReadResponse {
  content: string;
  truncated: boolean;
  bytesRead: number;
}

export interface FileWriteRequest {
  path: string;
  content: string;
  append: boolean;
}

export interface FileDeleteRequest {
  path: string;
  recursive: boolean;
}
