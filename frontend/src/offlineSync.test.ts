import { describe, expect, it, vi } from 'vitest';
import { syncPendingSales } from './offlineSync';
import type { PendingSale } from './offlineVault';

const draft = (id: string, status: PendingSale['status'] = 'pending'): PendingSale => ({
  id, created_at: '2026-11-23T10:00:00Z', status, error: '',
  payload: {
    client_ref: id, device_ref: '11111111-1111-4111-8111-111111111111',
    origin: 'offline', amount_paid: '5000.00', method: 'cash',
    customer_name: '', customer_phone: '', due_date: null,
    lines: [{ product_id: 'p-1', quantity: 1, unit_price: '5000.00', imei: '' }],
  },
});
const response = (status: number, body: object) => ({
  status, ok: status >= 200 && status < 300, json: async () => body,
}) as Response;

describe('Synchronisation hors ligne sécurisée', () => {
  it('confirme une première vente puis rejoue exactement la même référence sans doublon', async () => {
    const send = vi.fn(async () => response(200, {
      sale: { id: 'server-sale-1', reference: 'VTE-123' }, replayed: true,
    }));
    const confirmed = vi.fn(async () => {});
    const conflicted = vi.fn(async () => {});
    const result = await syncPendingSales([draft('local-uuid-1')], send, confirmed, conflicted);
    expect(result.confirmed).toEqual([{ id: 'server-sale-1', reference: 'VTE-123' }]);
    expect(result.paused).toBe('');
    expect(result.conflicts).toBe(0);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      client_ref: 'local-uuid-1', origin: 'offline',
      device_ref: '11111111-1111-4111-8111-111111111111',
    }));
    expect(confirmed).toHaveBeenCalledOnce();
    expect(conflicted).not.toHaveBeenCalled();
  });

  it('conserve un conflit d’IMEI pour une correction manuelle et continue avec la suivante', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce(response(409, { detail: 'Ce téléphone a déjà été vendu.' }))
      .mockResolvedValueOnce(response(201, { sale: { id: 's2', reference: 'VTE-2' } }));
    const confirmed = vi.fn(async () => {});
    const conflict = vi.fn(async () => {});
    const result = await syncPendingSales([draft('d1'), draft('d2')], send, confirmed, conflict);
    expect(result.conflicts).toBe(1);
    expect(result.confirmed.length).toBe(1);
    expect(conflict).toHaveBeenCalledWith(expect.objectContaining({id:'d1'}), 'Ce téléphone a déjà été vendu.');
    expect(confirmed).toHaveBeenCalledWith(expect.objectContaining({id:'d2'}), expect.anything());
  });

  it('s’arrête si la session propriétaire expire sans perdre les brouillons suivants', async () => {
    const send = vi.fn().mockResolvedValue(response(403, { detail: 'CSRF' }));
    const result = await syncPendingSales([draft('d1'), draft('d2')], send, vi.fn(), vi.fn());
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.paused).toContain('Session expirée');
    expect(result.confirmed).toEqual([]);
  });

  it('ne duplique pas une vente lorsque le réseau coupe avant la réponse', async () => {
    const send = vi.fn(async () => { throw new TypeError('Network is down'); });
    const confirmed = vi.fn();
    const conflict = vi.fn();
    const result = await syncPendingSales([draft('d1')], send, confirmed, conflict);
    expect(result.paused).toContain('Connexion interrompue');
    expect(confirmed).not.toHaveBeenCalled();
    expect(conflict).not.toHaveBeenCalled();
  });

  it('ignore les conflits déjà signalés jusqu’à action explicite du propriétaire', async () => {
    const send = vi.fn(async () => response(201, { sale: { id: 's1', reference: 'VTE-1' } }));
    const result = await syncPendingSales([draft('blocked', 'conflict'), draft('pending')], send, vi.fn(async () => {}), vi.fn());
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.confirmed.length).toBe(1);
  });
});
