/**
 * Phase 08: encrypted, device-local sales drafts.
 *
 * Never persist session cookies, passwords, API responses, or plaintext drafts.
 * The passphrase and AES key stay in memory and are forgotten on refresh/logout.
 * IndexedDB stores AES-GCM ciphertext only; losing the passphrase loses the drafts.
 */
export type OfflineProduct = {
  id: string; name: string; brand: string; model: string; category: 'phone' | 'case' | 'other';
  condition: 'new' | 'used'; quantity: number; sale_price: string;
};
export type OfflineSalePayload = {
  client_ref: string; origin: 'offline'; device_ref: string;
  lines: { product_id: string; quantity: number; unit_price: string; imei: string }[];
  amount_paid: string; method: string; customer_name: string; customer_phone: string; due_date: string | null;
};
export type PendingSale = {
  id: string; payload: OfflineSalePayload; created_at: string;
  status: 'pending' | 'conflict'; error: string;
};
export type CatalogSnapshot = { updated_at: string; products: OfflineProduct[] };

type Envelope = { version: 1; iv: string; ciphertext: string };
type VaultConfig = { version: 1; salt: string; proof: Envelope; device_ref: string };

const DB_NAME = 'phonestock-offline-v1';
const STORE = 'secure-records';
const ITERATIONS = 260_000;
const enc = new TextEncoder();
const dec = new TextDecoder();
let vaultKey: CryptoKey | null = null;
let nativeUnlocked = false;
const native = () => typeof window !== 'undefined' && Boolean(window.__TAURI__?.core?.invoke);
function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!native()) throw new Error('Ce stockage requiert YaraPhone Windows.');
  return window.__TAURI__!.core.invoke<T>(command, args);
}
export function setNativeVaultState(value: boolean) {
  if (native()) nativeUnlocked = value;
}
export async function lockNativeVault() {
  if (!native()) throw new Error('Application native indisponible.');
  await invoke('native_lock');
  nativeUnlocked = false;
}


function base64(bytes: Uint8Array) {
  // The encryption envelope contains binary data, never raw UTF-8 text.
  let s = '';
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
}
function unbase64(value: string) {
  const s = atob(value);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
function secureCrypto() {
  if (typeof crypto === 'undefined' || !crypto.subtle || !crypto.getRandomValues) {
    throw new Error('Chiffrement indisponible. Utilise HTTPS ou localhost sur un navigateur compatible.');
  }
  if (typeof indexedDB === 'undefined') throw new Error('Stockage hors ligne indisponible sur ce navigateur.');
}
function database(): Promise<IDBDatabase> {
  secureCrypto();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Impossible d’ouvrir le stockage hors ligne.'));
  });
}
async function getRecord<T>(id: string): Promise<T | undefined> {
  const db = await database();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(new Error('Lecture du stockage local impossible.'));
    });
  } finally { db.close(); }
}
async function putRecord(id: string, data: unknown) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, id);
      // Wait for durable transaction commit, not merely the put request's success.
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error('Enregistrement local interrompu. Vérifie l’espace disponible.'));
      tx.onerror = () => reject(new Error('Enregistrement local impossible.'));
    });
  } finally { db.close(); }
}
async function removeRecord(id: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error('Suppression locale interrompue.'));
      tx.onerror = () => reject(new Error('Suppression locale impossible.'));
    });
  } finally { db.close(); }
}
async function listKeys(): Promise<IDBValidKey[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('Liste locale indisponible.'));
    });
  } finally { db.close(); }
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function seal<T>(key: CryptoKey, value: T, recordId: string): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = enc.encode(JSON.stringify(value));
  const result = await crypto.subtle.encrypt({
    name: 'AES-GCM', iv, additionalData: enc.encode(recordId),
  }, key, bytes);
  return { version: 1, iv: base64(iv), ciphertext: base64(new Uint8Array(result)) };
}
async function unseal<T>(key: CryptoKey, envelope: Envelope, recordId: string): Promise<T> {
  const bytes = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: unbase64(envelope.iv) as BufferSource,
      additionalData: enc.encode(recordId) as BufferSource,
    },
    key, unbase64(envelope.ciphertext) as BufferSource
  );
  return JSON.parse(dec.decode(bytes)) as T;
}
export function isUnlocked() { return native() ? nativeUnlocked : vaultKey !== null; }
export function lockVault() {
  if (native()) {
    // UI native uses lockNativeVault() so the Rust command is awaited.
    nativeUnlocked = false;
    void invoke('native_lock').catch(() => {});
  } else vaultKey = null;
}
export async function hasVault() {
  if (native()) {
    const state = await invoke<{ initialized: boolean }>('native_vault_status');
    return state.initialized;
  }
  return Boolean(await getRecord<VaultConfig>('config'));
}
export async function unlockVault(passphrase: string) {
  if (native()) {
    const state = await invoke<{ unlocked: boolean }>('native_unlock', { passphrase });
    nativeUnlocked = state.unlocked;
    if (!nativeUnlocked) throw new Error('Le coffre Windows reste verrouillé.');
    return;
  }
  secureCrypto();
  if (passphrase.length < 8) throw new Error('Utilise une phrase secrète d’au moins 8 caractères.');
  const config = await getRecord<VaultConfig>('config');
  if (config) {
    try {
      const key = await deriveKey(passphrase, unbase64(config.salt));
      const proof = await unseal<{ marker: string }>(key, config.proof, 'config-proof');
      if (proof.marker !== 'phonestock-offline-v1') throw new Error('Code incorrect.');
      vaultKey = key;
    } catch {
      vaultKey = null;
      throw new Error('Phrase secrète incorrecte ou données locales endommagées.');
    }
  } else {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt);
    const proof = await seal(key, { marker: 'phonestock-offline-v1' }, 'config-proof');
    await putRecord('config', {
      version: 1, salt: base64(salt), proof, device_ref: crypto.randomUUID(),
    } satisfies VaultConfig);
    vaultKey = key;
  }
}
function requireKey(): CryptoKey {
  if (!vaultKey) throw new Error('Déverrouille d’abord le coffre hors ligne.');
  return vaultKey;
}
export async function saveCatalog(snapshot: CatalogSnapshot) {
  if (native()) {
    await invoke('native_save_catalog', { payloadJson: JSON.stringify(snapshot) });
    return;
  }
  await putRecord('catalog', await seal(requireKey(), snapshot, 'catalog'));
}
export async function readCatalog(): Promise<CatalogSnapshot | null> {
  if (native()) {
    const value = await invoke<string | null>('native_read_catalog');
    return value ? JSON.parse(value) as CatalogSnapshot : null;
  }
  const item = await getRecord<Envelope>('catalog');
  return item ? unseal<CatalogSnapshot>(requireKey(), item, 'catalog') : null;
}
export async function savePending(sale: PendingSale) {
  if (sale.id !== sale.payload.client_ref) throw new Error('Référence de vente incohérente.');
  if (native()) {
    if (sale.status !== 'pending') throw new Error('Les conflits natifs seront gérés après activation de la synchronisation.');
    await invoke('native_save_draft', { clientRef: sale.id, payloadJson: JSON.stringify(sale.payload) });
    return;
  }
  await putRecord('sale:' + sale.id, await seal(requireKey(), sale, 'sale:' + sale.id));
}
export async function listPending(): Promise<PendingSale[]> {
  if (native()) {
    const drafts = await invoke<{ client_ref: string; created_at: string; payload_json: string }[]>('native_list_drafts');
    return drafts.map((item): PendingSale => ({
      id: item.client_ref, payload: JSON.parse(item.payload_json) as OfflineSalePayload,
      created_at: item.created_at, status: 'pending', error: '',
    }));
  }
  const keys = (await listKeys()).filter((key) => typeof key === 'string' && key.startsWith('sale:'));
  const result = await Promise.all(keys.map(async (key) => {
    const item = await getRecord<Envelope>(String(key));
    return item ? unseal<PendingSale>(requireKey(), item, String(key)) : null;
  }));
  return result.filter((sale): sale is PendingSale => Boolean(sale))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}
export async function deletePending(id: string) {
  if (native()) {
    await invoke('native_delete_draft', { clientRef: id });
    return;
  }
  requireKey();
  await removeRecord('sale:' + id);
}


/** Stable opaque device identifier, only used for authorized sale audit. */
export async function getDeviceRef() {
  if (native()) return invoke<string>('native_device_ref');
  requireKey();
  const config = await getRecord<VaultConfig>('config');
  if (!config) throw new Error('Configuration du coffre introuvable.');
  if (!config.device_ref) {
    config.device_ref = crypto.randomUUID();
    await putRecord('config', config);
  }
  return config.device_ref;
}


/**
 * Portable encrypted transfer between web Phase 08 and Windows Phase 09.
 * Export creates an encrypted file only. The source IndexedDB is NEVER deleted.
 * The transfer passphrase is separate from the destination native-vault phrase.
 */
export type PortableTransfer = {
  catalog: CatalogSnapshot | null;
  drafts: PendingSale[];
};
type TransferFile = { kind: 'yaraphone-encrypted-transfer'; version: 1; salt: string; sealed: Envelope };

export async function createPortableTransfer(passphrase: string): Promise<string> {
  if (native()) throw new Error('Le transfert est exporté depuis la version web.');
  if (!isUnlocked()) throw new Error('Déverrouille le coffre web avant l’export.');
  if (passphrase.length < 12 || passphrase.length > 1024) {
    throw new Error('Utilise une phrase de transfert de 12 caractères minimum.');
  }
  const transfer: PortableTransfer = { catalog: await readCatalog(), drafts: await listPending() };
  if (transfer.drafts.some((entry) => entry.status !== 'pending')) {
    throw new Error('Résous les brouillons en conflit dans la version web avant le transfert vers Windows.');
  }
  if (!transfer.catalog && transfer.drafts.length === 0) {
    throw new Error('Aucun produit ou brouillon à exporter.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const sealed = await seal(key, transfer, 'yaraphone-transfer-v1');
  return JSON.stringify({ kind: 'yaraphone-encrypted-transfer', version: 1,
    salt: base64(salt), sealed } satisfies TransferFile);
}

export async function openPortableTransfer(content: string, passphrase: string): Promise<PortableTransfer> {
  if (content.length > 10_000_000) throw new Error('Fichier de transfert trop volumineux.');
  if (passphrase.length < 12 || passphrase.length > 1024) {
    throw new Error('Phrase de transfert invalide.');
  }
  let file: TransferFile;
  try { file = JSON.parse(content) as TransferFile; }
  catch { throw new Error('Fichier JSON illisible.'); }
  if (file?.kind !== 'yaraphone-encrypted-transfer' || file.version !== 1 ||
      typeof file.salt !== 'string' || !file.sealed || file.sealed.version !== 1) {
    throw new Error('Ce fichier n’est pas un transfert YaraPhone chiffré.');
  }
  let decoded: PortableTransfer;
  try {
    decoded = await unseal<PortableTransfer>(
      await deriveKey(passphrase, unbase64(file.salt)), file.sealed, 'yaraphone-transfer-v1',
    );
  } catch {
    throw new Error('Phrase de transfert incorrecte ou fichier altéré.');
  }
  const catalog = decoded?.catalog;
  if (catalog !== null && catalog !== undefined &&
      (!Array.isArray(catalog.products) || typeof catalog.updated_at !== 'string' ||
        catalog.products.length > 200 || catalog.products.some((p) =>
          !p || typeof p.id !== 'string' || !p.id ||
          typeof p.name !== 'string' || typeof p.sale_price !== 'string' ||
          !Number.isFinite(Number(p.sale_price)) || Number(p.sale_price) <= 0 ||
          !Number.isSafeInteger(p.quantity) || p.quantity < 0 ||
          !['phone','case','other'].includes(p.category) ||
          !['new','used'].includes(p.condition)))) {
    throw new Error('Catalogue du transfert invalide.');
  }
  if (!Array.isArray(decoded?.drafts) || decoded.drafts.length > 500 ||
    decoded.drafts.some((entry) => !entry || entry.id !== entry.payload?.client_ref ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.id) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.payload?.device_ref ?? '') ||
      entry.status !== 'pending' || !Array.isArray(entry.payload.lines) ||
      entry.payload.lines.length === 0 || entry.payload.lines.length > 200 ||
      entry.payload.lines.some((line) => typeof line.product_id !== 'string' ||
        !Number.isSafeInteger(line.quantity) || line.quantity < 1 ||
        typeof line.unit_price !== 'string' || !/^\d+(\.\d{1,2})?$/.test(line.unit_price)) ||
      entry.payload.origin !== 'offline' || typeof entry.created_at !== 'string')) {
    throw new Error('Brouillons du transfert invalides.');
  }
  return { catalog: catalog ?? null, drafts: decoded.drafts };
}
