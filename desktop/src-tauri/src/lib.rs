mod vault;
use tauri::{Manager, State};
use vault::{NativeDraft, NativeVault, VaultStatus};

#[tauri::command]
fn native_vault_status(vault: State<'_, NativeVault>) -> Result<VaultStatus, String> {
    vault.status()
}
#[tauri::command]
fn native_unlock(vault: State<'_, NativeVault>, passphrase: String) -> Result<VaultStatus, String> {
    vault.unlock(&passphrase)
}
#[tauri::command]
fn native_lock(vault: State<'_, NativeVault>) -> Result<VaultStatus, String> {
    vault.lock()
}
#[tauri::command]
fn native_save_draft(
    vault: State<'_, NativeVault>, client_ref: String, payload_json: String,
) -> Result<bool, String> {
    vault.save_draft(&client_ref, &payload_json)
}
#[tauri::command]
fn native_list_drafts(vault: State<'_, NativeVault>) -> Result<Vec<NativeDraft>, String> {
    vault.list_drafts()
}
#[tauri::command]
fn native_device_ref(vault: State<'_, NativeVault>) -> Result<String, String> {
    vault.device_ref()
}
#[tauri::command]
fn native_delete_draft(
    vault: State<'_, NativeVault>, client_ref: String,
) -> Result<bool, String> {
    vault.delete_draft(&client_ref)
}
#[tauri::command]
fn native_save_catalog(
    vault: State<'_, NativeVault>, payload_json: String,
) -> Result<(), String> {
    vault.save_catalog(&payload_json)
}
#[tauri::command]
fn native_read_catalog(vault: State<'_, NativeVault>) -> Result<Option<String>, String> {
    vault.read_catalog()
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // No caller-controlled file paths. One SQLite file in OS-managed app data.
            let base = app.path().app_local_data_dir()?;
            let native = NativeVault::new(base.join("yaraphone-local.sqlite"))
                .map_err(std::io::Error::other)?;
            app.manage(native);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            native_vault_status,
            native_unlock,
            native_lock,
            native_save_draft,
            native_list_drafts,
            native_device_ref,
            native_delete_draft,
            native_save_catalog,
            native_read_catalog,
        ])
        .run(tauri::generate_context!())
        .expect("Impossible de démarrer YaraPhone Windows");
}
