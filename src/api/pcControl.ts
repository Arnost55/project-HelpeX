import { invoke } from "@tauri-apps/api/core";
import type {
  FileDeleteRequest,
  FileEntry,
  FileReadRequest,
  FileReadResponse,
  FileWriteRequest,
  TerminalExecuteRequest,
  TerminalExecuteResponse
} from "../types/pcControl";

export async function executeTerminal(request: TerminalExecuteRequest): Promise<TerminalExecuteResponse> {
  return invoke("execute_terminal", { request });
}

export async function listDirectoryEntries(path: string): Promise<FileEntry[]> {
  return invoke("list_directory_entries", { path });
}

export async function readFilePreview(request: FileReadRequest): Promise<FileReadResponse> {
  return invoke("read_file_preview", { request });
}

export async function writeFileContents(request: FileWriteRequest): Promise<void> {
  await invoke("write_file_contents", { request });
}

export async function deleteFilePath(request: FileDeleteRequest): Promise<void> {
  await invoke("delete_file_path", { request });
}
