import { afterEach, describe, expect, it, vi } from 'vitest';
import { deletePending, getDeviceRef, hasVault, isUnlocked, listPending,
  lockNativeVault, readCatalog, saveCatalog, savePending, unlockVault } from './offlineVault';

describe('Coffre Windows : adaptateur SQLite natif', () => {
  afterEach(() => { delete window.__TAURI__; vi.unstubAllGlobals(); });

  it('réutilise la caisse hors ligne, chiffre côté Rust et ne contacte pas IndexedDB', async () => {
    const nativeData = new Map<string, string>();
    let catalog: string | null = null;
    let initialized = false;
    let unlocked = false;
    const invoke = vi.fn(async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
      if (command === 'native_vault_status') return { initialized, unlocked };
      if (command === 'native_unlock') {
        initialized = true; unlocked = true;
        return { initialized, unlocked };
      }
      if (command === 'native_lock') { unlocked = false; return { initialized, unlocked }; }
      if (command === 'native_device_ref') return '11111111-1111-5111-8111-111111111111';
      if (command === 'native_save_catalog') { catalog = args?.payloadJson as string; return null; }
      if (command === 'native_read_catalog') return catalog;
      if (command === 'native_save_draft') {
        nativeData.set(args?.clientRef as string, args?.payloadJson as string);
        return true;
      }
      if (command === 'native_list_drafts') return Array.from(nativeData).map(([id, body]) => ({
        client_ref: id, payload_json: body, created_at: '2026-11-24T12:00:00Z',
      }));
      if (command === 'native_delete_draft') return nativeData.delete(args?.clientRef as string);
      throw Error('Commande native inconnue ' + command);
    });
    window.__TAURI__ = { core: {
      invoke: invoke as unknown as <T>(command: string, args?: Record<string, unknown>) => Promise<T>,
    } };
    vi.stubGlobal('indexedDB', undefined);
    expect(await hasVault()).toBe(false);
    await unlockVault('Une phrase Windows longue 2026');
    expect(isUnlocked()).toBe(true);
    expect(await hasVault()).toBe(true);
    const device = await getDeviceRef();
    const snapshot = { updated_at: '2026-11-24T10:00:00Z', products: [{
      id: 'p1', name: 'Pochette A17', brand: '', model: '',
      category: 'case' as const, condition: 'new' as const, quantity: 12, sale_price: '2500.00',
    }] };
    await saveCatalog(snapshot);
    expect(await readCatalog()).toEqual(snapshot);
    const id = '00000000-0000-4000-8000-000000000001';
    await savePending({
      id, created_at: '2026-11-24T10:00:00Z', status: 'pending', error: '',
      payload: { client_ref: id, origin: 'offline', device_ref: device,
        lines: [{ product_id: 'p1', quantity: 1, unit_price: '2500.00', imei: '' }],
        amount_paid: '2500.00', method: 'cash',
        customer_name: '', customer_phone: '', due_date: null },
    });
    expect((await listPending())[0].payload.device_ref).toBe(device);
    expect(invoke).toHaveBeenCalledWith('native_save_draft', {
      clientRef: id, payloadJson: expect.any(String),
    });
    await deletePending(id);
    expect(await listPending()).toEqual([]);
    await lockNativeVault();
    expect(isUnlocked()).toBe(false);
    expect(invoke).not.toHaveBeenCalledWith('native_save_catalog', expect.objectContaining({
      payload_json: expect.any(String),
    }));
  });
});
