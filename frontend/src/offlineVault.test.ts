import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { deletePending, getDeviceRef, hasVault, listPending, lockVault,
  readCatalog, saveCatalog, savePending, unlockVault } from './offlineVault';

/**
 * Tiny in-memory IndexedDB driver: tests the *real* AES-GCM/PBKDF2 vault code.
 * It dispatches the same asynchronous request/transaction callbacks used by the browser.
 */
function fakeIndexedDB() {
  const records = new Map<string, unknown>();
  let storeCreated = false;
  type FakeReq = { result: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null };
  const request = (result: unknown) => {
    const req: FakeReq = { result, onsuccess: null, onerror: null };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  };
  const db = {
    objectStoreNames: { contains: () => storeCreated },
    createObjectStore: () => { storeCreated = true; },
    close: () => {},
    transaction: () => {
      const tx: { oncomplete: (() => void) | null; onabort: (() => void) | null;
        onerror: (() => void) | null; objectStore: () => object } = {
        oncomplete: null, onabort: null, onerror: null,
        objectStore: () => ({
          get: (key: string) => request(records.get(key)),
          getAllKeys: () => request(Array.from(records.keys())),
          put: (data: unknown, key: string) => {
            records.set(key, data);
            queueMicrotask(() => tx.oncomplete?.());
            return request(undefined);
          },
          delete: (key: string) => {
            records.delete(key);
            queueMicrotask(() => tx.oncomplete?.());
            return request(undefined);
          },
        }),
      };
      return tx;
    },
  };
  return {
    records,
    api: {
      open: () => {
        const req: FakeReq & { onupgradeneeded: (() => void) | null } = {
          result: db, onsuccess: null, onerror: null, onupgradeneeded: null,
        };
        queueMicrotask(() => {
          if (!storeCreated) req.onupgradeneeded?.();
          req.onsuccess?.();
        });
        return req;
      },
    },
  };
}

describe('Coffre local chiffré IndexedDB', () => {
  let database: ReturnType<typeof fakeIndexedDB>;
  beforeEach(() => {
    database = fakeIndexedDB();
    vi.stubGlobal('indexedDB', database.api);
    vi.stubGlobal('crypto', webcrypto);
    lockVault();
  });
  afterEach(() => { lockVault(); vi.unstubAllGlobals(); });

  it('stocke des brouillons et le catalogue en AES-GCM, jamais en clair', async () => {
    expect(await hasVault()).toBe(false);
    await unlockVault('Ma phrase secrète unique 2026 !');
    expect(await hasVault()).toBe(true);
    const device = await getDeviceRef();
    expect(device).toMatch(/^[0-9a-f-]{36}$/i);
    await saveCatalog({
      updated_at: '2026-11-23T10:00:00Z',
      products: [{ id: 'p1', name: 'Téléphone SECRET', brand: 'Samsung', model: 'A17',
        condition: 'new', quantity: 1, category: 'phone', sale_price: '90000.00' }],
    });
    await savePending({
      id: '00000000-0000-4000-8000-000000000001',
      created_at: '2026-11-23T10:00:00Z', status: 'pending', error: '',
      payload: {
        client_ref: '00000000-0000-4000-8000-000000000001',
        device_ref: device, origin: 'offline',
        lines: [{ product_id: 'p1', quantity: 1, unit_price: '90000.00', imei: '490154203237518' }],
        amount_paid: '20000.00', method: 'cash', customer_name: 'Awa SECRET',
        customer_phone: '75000000', due_date: null,
      },
    });
    const raw = JSON.stringify(Array.from(database.records.entries()));
    expect(raw).not.toContain('Téléphone SECRET');
    expect(raw).not.toContain('Awa SECRET');
    expect(raw).not.toContain('490154203237518');
    expect(raw).toContain('ciphertext');
    lockVault();
    await expect(unlockVault('Mauvaise phrase 00000')).rejects.toThrow('incorrecte');
    await unlockVault('Ma phrase secrète unique 2026 !');
    expect(await getDeviceRef()).toBe(device);
    expect((await readCatalog())?.products[0].name).toBe('Téléphone SECRET');
    expect((await listPending())[0].payload.customer_name).toBe('Awa SECRET');
    await deletePending('00000000-0000-4000-8000-000000000001');
    expect(await listPending()).toEqual([]);
  });

  it('refuse l’ouverture sans phrase assez longue', async () => {
    await expect(unlockVault('123')).rejects.toThrow('au moins 8');
  });
});
