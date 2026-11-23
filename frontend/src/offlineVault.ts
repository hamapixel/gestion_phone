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
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(data, id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new Error('Enregistrement local impossible. Vérifie l’espace disponible.'));
    });
  } finally { db.close(); }
}
async function removeRecord(id: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new Error('Suppression locale impossible.'));
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
async function seal<T>(key: CryptoKey, value: T): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = enc.encode(JSON.stringify(value));
  const result = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { version: 1, iv: base64(iv), ciphertext: base64(new Uint8Array(result)) };
}
async function unseal<T>(key: CryptoKey, envelope: Envelope): Promise<T> {
  const bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unbase64(envelope.iv) as BufferSource },
    key, unbase64(envelope.ciphertext) as BufferSource
  );
  return JSON.parse(dec.decode(bytes)) as T;
}
export function isUnlocked() { return vaultKey !== null; }
export function lockVault() { vaultKey = null; }
export async function hasVault() {
  return Boolean(await getRecord<VaultConfig>('config'));
}
export async function unlockVault(passphrase: string) {
  secureCrypto();
  if (passphrase.length < 8) throw new Error('Utilise une phrase secrète d’au moins 8 caractères.');
  const config = await getRecord<VaultConfig>('config');
  if (config) {
    try {
      const key = await deriveKey(passphrase, unbase64(config.salt));
      const proof = await unseal<{ marker: string }>(key, config.proof);
      if (proof.marker !== 'phonestock-offline-v1') throw new Error('Code incorrect.');
      vaultKey = key;
    } catch {
      vaultKey = null;
      throw new Error('Phrase secrète incorrecte ou données locales endommagées.');
    }
  } else {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt);
    const proof = await seal(key, { marker: 'phonestock-offline-v1' });
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
  await putRecord('catalog', await seal(requireKey(), snapshot));
}
export async function readCatalog(): Promise<CatalogSnapshot | null> {
  const item = await getRecord<Envelope>('catalog');
  return item ? unseal<CatalogSnapshot>(requireKey(), item) : null;
}
export async function savePending(sale: PendingSale) {
  if (sale.id !== sale.payload.client_ref) throw new Error('Référence de vente incohérente.');
  await putRecord('sale:' + sale.id, await seal(requireKey(), sale));
}
export async function listPending(): Promise<PendingSale[]> {
  const keys = (await listKeys()).filter((key) => typeof key === 'string' && key.startsWith('sale:'));
  const result = await Promise.all(keys.map(async (key) => {
    const item = await getRecord<Envelope>(String(key));
    return item ? unseal<PendingSale>(requireKey(), item) : null;
  }));
  return result.filter((sale): sale is PendingSale => Boolean(sale))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}
export async function deletePending(id: string) {
  requireKey();
  await removeRecord('sale:' + id);
}


/** Stable opaque device identifier, only used for authorized sale audit. */
export async function getDeviceRef() {
  requireKey();
  const config = await getRecord<VaultConfig>('config');
  if (!config) throw new Error('Configuration du coffre introuvable.');
  if (!config.device_ref) {
    config.device_ref = crypto.randomUUID();
    await putRecord('config', config);
  }
  return config.device_ref;
}
