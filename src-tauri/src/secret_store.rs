use keyring::Entry;
use tauri::AppHandle;

const SECRET_SERVICE_NAME: &str = "HelpeX";

#[derive(Debug, Clone)]
pub struct SecretStore;

impl SecretStore {
    pub fn provider_api_key_ref(provider: &str) -> String {
        format!("provider/{provider}/api_key")
    }

    pub fn mcp_env_secret_ref(server_id: &str, env_name: &str) -> String {
        format!("mcp/{server_id}/{env_name}")
    }

    pub fn database_password_ref(profile: &str) -> String {
        format!("database/{profile}/password")
    }

    fn entry(secret_ref: &str) -> Result<Entry, String> {
        Entry::new(SECRET_SERVICE_NAME, secret_ref).map_err(|error| error.to_string())
    }

    pub fn set(&self, secret_ref: &str, value: &str) -> Result<(), String> {
        Self::entry(secret_ref)?
            .set_password(value)
            .map_err(|error| error.to_string())
    }

    pub fn get(&self, secret_ref: &str) -> Result<Option<String>, String> {
        match Self::entry(secret_ref)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    pub fn delete(&self, secret_ref: &str) -> Result<(), String> {
        match Self::entry(secret_ref)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}

pub fn secret_store(_app_handle: &AppHandle) -> SecretStore {
    SecretStore
}
