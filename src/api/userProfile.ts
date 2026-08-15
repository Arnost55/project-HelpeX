import { invoke } from "@tauri-apps/api/core";

export interface UserProfile {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export async function loadUserProfile(): Promise<UserProfile | null> {
  return invoke("load_user_profile");
}
