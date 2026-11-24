//! SQLite contains only AES-256-GCM encrypted sale/catalogue payloads.
//! Names, phone numbers and IMEIs are NEVER stored in plaintext.
//! The owner supplies an independent passphrase; Argon2id derives an in-memory key.
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use rand::{rngs::OsRng, RngCore};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::{fs, path::PathBuf, sync::Mutex};
use uuid::Uuid;
use zeroize::Zeroizing;

const DB_VERSION: i64 = 1;
const MAX_PAYLOAD: usize = 1024 * 1024;

#[derive(Serialize)]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
    pub pending_count: u64,
    pub engine: &'static str,
}

#[derive(Serialize)]
pub struct NativeDraft {
    pub client_ref: String,
    pub created_at: String,
    pub payload_json: String,
}

pub struct NativeVault {
    path: PathBuf,
    key: Mutex<Option<Zeroizing<[u8; 32]>>>,
}

fn failed<E: std::fmt::Display>(error: E) -> String {
    format!("Opération locale impossible : {error}")
}

fn derive(passphrase: &str, salt: &[u8]) -> Result<Zeroizing<[u8; 32]>, String> {
    let mut derived = Zeroizing::new([0u8; 32]);
    let params = Params::new(32768, 3, 1, Some(32)).map_err(failed)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    argon2
        .hash_password_into(passphrase.as_bytes(), salt, &mut *derived)
        .map_err(|_| "Dérivation de la clé locale impossible.".to_string())?;
    Ok(derived)
}

fn encrypt(key: &[u8; 32], plaintext: &[u8], context: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(failed)?;
    let mut iv = [0u8; 12];
    OsRng.fill_bytes(&mut iv);
    let encrypted = cipher
        .encrypt(Nonce::from_slice(&iv), Payload { msg: plaintext, aad: context })
        .map_err(|_| "Chiffrement local impossible.".to_string())?;
    let mut envelope = Vec::with_capacity(1 + iv.len() + encrypted.len());
    envelope.push(1); // format version
    envelope.extend_from_slice(&iv);
    envelope.extend_from_slice(&encrypted);
    Ok(envelope)
}

fn decrypt(key: &[u8; 32], envelope: &[u8], context: &[u8]) -> Result<Vec<u8>, String> {
    if envelope.len() < 30 || envelope[0] != 1 {
        return Err("Données chiffrées invalides.".to_string());
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(failed)?;
    cipher
        .decrypt(
            Nonce::from_slice(&envelope[1..13]),
            Payload { msg: &envelope[13..], aad: context },
        )
        .map_err(|_| "Phrase secrète incorrecte ou données locales altérées.".to_string())
}

fn validate_sale(ref_id: &str, payload: &str) -> Result<(), String> {
    Uuid::parse_str(ref_id).map_err(|_| "Référence UUID invalide.".to_string())?;
    if payload.len() > MAX_PAYLOAD {
        return Err("Brouillon trop volumineux.".to_string());
    }
    let json: serde_json::Value =
        serde_json::from_str(payload).map_err(|_| "Brouillon JSON invalide.".to_string())?;
    if json.get("client_ref").and_then(|x| x.as_str()) != Some(ref_id) {
        return Err("Référence du brouillon différente de son contenu.".to_string());
    }
    if json.get("origin").and_then(|x| x.as_str()) != Some("offline") {
        return Err("Seuls les brouillons hors ligne sont acceptés.".to_string());
    }
    let device = json.get("device_ref").and_then(|x| x.as_str())
        .ok_or("Identifiant d’appareil manquant.")?;
    Uuid::parse_str(device).map_err(|_| "Identifiant d’appareil invalide.".to_string())?;
    if json.get("lines").and_then(|x| x.as_array()).is_none_or(|x| x.is_empty()) {
        return Err("Une vente doit contenir au moins un article.".to_string());
    }
    Ok(())
}

impl NativeVault {
    pub fn new(path: PathBuf) -> Result<Self, String> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(failed)?;
        }
        let this = Self { path, key: Mutex::new(None) };
        let db = this.connection()?;
        let version: i64 = db
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(failed)?;
        if version > DB_VERSION {
            return Err("Cette base a été créée par une version plus récente.".to_string());
        }
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS vault_meta(
                id INTEGER PRIMARY KEY CHECK(id = 1),
                salt BLOB NOT NULL,
                verifier BLOB NOT NULL
             );
             CREATE TABLE IF NOT EXISTS pending_sales(
                client_ref TEXT PRIMARY KEY,
                payload BLOB NOT NULL,
                created_at TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'pending'
                   CHECK(state IN ('pending', 'conflict'))
             );
             CREATE TABLE IF NOT EXISTS catalog_snapshot(
                id INTEGER PRIMARY KEY CHECK(id = 1),
                payload BLOB NOT NULL
             );
             PRAGMA user_version = 1;",
        )
        .map_err(failed)?;
        Ok(this)
    }

    fn connection(&self) -> Result<Connection, String> {
        let db = Connection::open(&self.path).map_err(failed)?;
        db.execute_batch("PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;")
            .map_err(failed)?;
        Ok(db)
    }

    fn with_key<T>(&self, action: impl FnOnce(&[u8; 32]) -> Result<T, String>) -> Result<T, String> {
        let guard = self.key.lock().map_err(failed)?;
        let key = guard.as_ref().ok_or("Déverrouille le coffre local.")?;
        action(key)
    }

    pub fn status(&self) -> Result<VaultStatus, String> {
        let db = self.connection()?;
        let initialized: bool = db
            .query_row("SELECT EXISTS(SELECT 1 FROM vault_meta)", [], |r| r.get(0))
            .map_err(failed)?;
        let pending_count: i64 = db
            .query_row("SELECT COUNT(*) FROM pending_sales", [], |r| r.get(0))
            .map_err(failed)?;
        Ok(VaultStatus {
            initialized, pending_count: pending_count as u64,
            unlocked: self.key.lock().map_err(failed)?.is_some(),
            engine: "SQLite / AES-256-GCM / Argon2id",
        })
    }

    pub fn unlock(&self, passphrase: &str) -> Result<VaultStatus, String> {
        if passphrase.chars().count() < 12 || passphrase.len() > 1024 {
            return Err("Utilise une phrase secrète de 12 à 1024 caractères.".to_string());
        }
        let db = self.connection()?;
        let previous: Option<(Vec<u8>, Vec<u8>)> = db
            .query_row("SELECT salt, verifier FROM vault_meta WHERE id = 1", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .optional()
            .map_err(failed)?;
        let derived = if let Some((salt, verifier)) = previous {
            let derived = derive(passphrase, &salt)?;
            let marker = decrypt(&derived, &verifier, b"vault-proof")?;
            if marker != b"phonestock-native-vault-v1" {
                return Err("Phrase secrète incorrecte.".to_string());
            }
            derived
        } else {
            let mut salt = [0u8; 16];
            OsRng.fill_bytes(&mut salt);
            let derived = derive(passphrase, &salt)?;
            let proof = encrypt(&derived, b"phonestock-native-vault-v1", b"vault-proof")?;
            db.execute(
                "INSERT OR IGNORE INTO vault_meta(id, salt, verifier) VALUES(1, ?1, ?2)",
                params![salt.as_slice(), proof],
            )
            .map_err(failed)?;
            // If another caller concurrently initialized the vault, recheck it.
            let verifier: Vec<u8> = db
                .query_row("SELECT verifier FROM vault_meta WHERE id=1", [], |r| r.get(0))
                .map_err(failed)?;
            decrypt(&derived, &verifier, b"vault-proof")?;
            derived
        };
        *self.key.lock().map_err(failed)? = Some(derived);
        self.status()
    }

    pub fn lock(&self) -> Result<VaultStatus, String> {
        // Dropping Zeroizing<[u8;32]> wipes the key from memory.
        *self.key.lock().map_err(failed)? = None;
        self.status()
    }

    pub fn save_draft(&self, ref_id: &str, payload_json: &str) -> Result<bool, String> {
        validate_sale(ref_id, payload_json)?;
        self.with_key(|key| {
            let mut db = self.connection()?;
            let tx = db.transaction().map_err(failed)?;
            let prior: Option<Vec<u8>> = tx
                .query_row("SELECT payload FROM pending_sales WHERE client_ref=?1",
                    params![ref_id], |r| r.get(0))
                .optional().map_err(failed)?;
            let aad = format!("pending-sale:{ref_id}");
            if let Some(existing) = prior {
                let value = decrypt(key, &existing, aad.as_bytes())?;
                let existing_json: serde_json::Value = serde_json::from_slice(&value)
                    .map_err(failed)?;
                let incoming_json: serde_json::Value = serde_json::from_str(payload_json)
                    .map_err(failed)?;
                if existing_json != incoming_json {
                    return Err("Référence déjà utilisée avec un contenu différent.".to_string());
                }
                return Ok(false); // exact, safe idempotent retry
            }
            let payload = encrypt(key, payload_json.as_bytes(), aad.as_bytes())?;
            tx.execute(
                "INSERT INTO pending_sales(client_ref, payload, created_at) \
                 VALUES(?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
                params![ref_id, payload],
            )
            .map_err(failed)?;
            tx.commit().map_err(failed)?;
            Ok(true)
        })
    }

    pub fn list_drafts(&self) -> Result<Vec<NativeDraft>, String> {
        self.with_key(|key| {
            let db = self.connection()?;
            let mut statement = db.prepare(
                "SELECT client_ref, payload, created_at FROM pending_sales \
                 ORDER BY created_at, client_ref LIMIT 500",
            ).map_err(failed)?;
            let rows = statement
                .query_map([], |r| Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Vec<u8>>(1)?,
                    r.get::<_, String>(2)?,
                )))
                .map_err(failed)?;
            let mut drafts = Vec::new();
            for item in rows {
                let (client_ref, encrypted, created_at) = item.map_err(failed)?;
                let aad = format!("pending-sale:{client_ref}");
                let json = decrypt(key, &encrypted, aad.as_bytes())?;
                let payload_json = String::from_utf8(json)
                    .map_err(|_| "Brouillon UTF-8 invalide.".to_string())?;
                drafts.push(NativeDraft { client_ref, created_at, payload_json });
            }
            Ok(drafts)
        })
    }

    pub fn save_catalog(&self, payload_json: &str) -> Result<(), String> {
        if payload_json.len() > 5 * MAX_PAYLOAD {
            return Err("Catalogue trop volumineux.".to_string());
        }
        let value: serde_json::Value =
            serde_json::from_str(payload_json).map_err(failed)?;
        if !value.get("products").is_some_and(|p| p.is_array()) {
            return Err("Catalogue invalide.".to_string());
        }
        self.with_key(|key| {
            let encrypted = encrypt(key, payload_json.as_bytes(), b"catalog:v1")?;
            let db = self.connection()?;
            db.execute(
                "INSERT INTO catalog_snapshot(id,payload) VALUES(1,?1) \
                 ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
                params![encrypted],
            ).map_err(failed)?;
            Ok(())
        })
    }

    pub fn read_catalog(&self) -> Result<Option<String>, String> {
        self.with_key(|key| {
            let db = self.connection()?;
            let item: Option<Vec<u8>> = db
                .query_row("SELECT payload FROM catalog_snapshot WHERE id=1", [], |r| r.get(0))
                .optional().map_err(failed)?;
            item.map(|value| {
                let json = decrypt(key, &value, b"catalog:v1")?;
                String::from_utf8(json).map_err(failed)
            }).transpose()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_path() -> PathBuf {
        std::env::temp_dir().join(format!("phonestock-vault-test-{}.sqlite", Uuid::new_v4()))
    }
    fn sale(id: &str) -> String {
        serde_json::json!({
            "client_ref": id, "origin": "offline",
            "device_ref": "11111111-1111-4111-8111-111111111111",
            "customer_name": "Awa Secret", "customer_phone": "75000000",
            "lines": [{"product_id":"p1","quantity":1,"unit_price":"2500.00","imei":""}],
            "amount_paid": "2500.00", "method": "cash",
        }).to_string()
    }

    #[test]
    fn sensitive_data_is_encrypted_and_survives_reopening() {
        let path = test_path();
        let id = Uuid::new_v4().to_string();
        let vault = NativeVault::new(path.clone()).unwrap();
        assert!(!vault.status().unwrap().initialized);
        vault.unlock("Ma phrase secrete longue et unique").unwrap();
        assert!(vault.save_draft(&id, &sale(&id)).unwrap());
        assert!(!vault.save_draft(&id, &sale(&id)).unwrap());
        let mut modified: serde_json::Value = serde_json::from_str(&sale(&id)).unwrap();
        modified["customer_name"] = "Autre Client".into();
        assert!(vault.save_draft(&id, &modified.to_string()).is_err());
        vault.save_catalog(r#"{"products":[{"name":"Telephone Secret"}]}"#).unwrap();
        assert!(vault.read_catalog().unwrap().unwrap().contains("Telephone Secret"));
        let disk = fs::read(&path).unwrap();
        assert!(!disk.windows("Awa Secret".len()).any(|v| v == b"Awa Secret"));
        assert!(!disk.windows("Telephone Secret".len()).any(|v| v == b"Telephone Secret"));
        assert_eq!(vault.list_drafts().unwrap().len(), 1);
        vault.lock().unwrap();
        assert!(vault.list_drafts().is_err());
        drop(vault);
        let reloaded = NativeVault::new(path.clone()).unwrap();
        assert!(reloaded.unlock("Mot de passe errone 123").is_err());
        reloaded.unlock("Ma phrase secrete longue et unique").unwrap();
        assert_eq!(reloaded.list_drafts().unwrap().len(), 1);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejects_invalid_payload_and_missing_key() {
        let path = test_path();
        let vault = NativeVault::new(path.clone()).unwrap();
        let ref_id = Uuid::new_v4().to_string();
        assert!(vault.save_draft(&ref_id, &sale(&ref_id)).is_err());
        vault.unlock("Une autre phrase secrete forte").unwrap();
        assert!(vault.save_draft(&ref_id, "{}").is_err());
        assert!(vault.save_catalog(r#"{"not_products":[]}"#).is_err());
        fs::remove_file(path).unwrap();
    }
}
