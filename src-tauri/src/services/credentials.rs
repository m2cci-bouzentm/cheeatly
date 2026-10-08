use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "com.cheatly.assistant";
const ACCOUNT: &str = "credentials";

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredCredentials {
    pub open_router_api_key: Option<String>,
    pub default_model: Option<String>,
    pub stt_provider: Option<String>,
    pub stt_language: Option<String>,
}

pub struct CredentialService;

impl CredentialService {
    pub fn load() -> anyhow::Result<StoredCredentials> {
        let entry = Entry::new(SERVICE, ACCOUNT)?;
        match entry.get_password() {
            Ok(value) => Ok(serde_json::from_str(&value)?),
            Err(keyring::Error::NoEntry) => Ok(StoredCredentials::default()),
            Err(error) => Err(error.into()),
        }
    }

    pub fn save(credentials: &StoredCredentials) -> anyhow::Result<()> {
        Entry::new(SERVICE, ACCOUNT)?.set_password(&serde_json::to_string(credentials)?)?;
        Ok(())
    }
}
