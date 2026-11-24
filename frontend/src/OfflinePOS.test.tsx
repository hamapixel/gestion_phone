import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OfflinePOS from './OfflinePOS';
import * as storage from './offlineVault';

vi.mock('./offlineVault', () => ({
  isUnlocked: vi.fn(() => true),
  hasVault: vi.fn(async () => true),
  unlockVault: vi.fn(async () => {}),
  lockVault: vi.fn(),
  getDeviceRef: vi.fn(async () => '11111111-1111-4111-8111-111111111111'),
  readCatalog: vi.fn(async () => ({
    updated_at: '2026-11-23T10:00:00Z',
    products: [{
      id: 'p1', name: 'Pochette', brand: '', model: '', category: 'other',
      condition: 'new', quantity: 10, sale_price: '2500.00',
    }],
  })),
  listPending: vi.fn(async () => []),
  saveCatalog: vi.fn(async () => {}),
  savePending: vi.fn(async () => {}),
  deletePending: vi.fn(async () => {}),
}));

describe('Caisse hors ligne', () => {
  beforeEach(() => {
    let n = 1;
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-' + String(n++).padStart(12, '0') });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('présente le stock comme provisoire, sans promettre une facture hors connexion', async () => {
    render(<OfflinePOS/>);
    expect(await screen.findByText('Pochette')).toBeTruthy();
    expect(screen.getByText('Stock mémorisé : 10 · Réservé localement : 0')).toBeTruthy();
    expect(screen.getByText(/Toute vente reste en attente/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Enregistrer en attente/ }).hasAttribute('disabled')).toBe(true);
  });

  it('chiffre le brouillon avant de vider le panier et garde UUID et origine', async () => {
    render(<OfflinePOS/>);
    expect(await screen.findByText('Pochette')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer en attente/ }));
    await waitFor(() => {
      expect(storage.savePending).toHaveBeenCalledOnce();
      const item = vi.mocked(storage.savePending).mock.calls[0][0];
      expect(item.id).toBe(item.payload.client_ref);
      expect(item.payload.lines).toEqual([{ product_id: 'p1', quantity: 1, unit_price: '2500.00', imei: '' }]);
      expect(item.payload.origin).toBe('offline');
      expect(item.payload.device_ref).toBe('11111111-1111-4111-8111-111111111111');
      expect(item.payload.amount_paid).toBe('2500.00');
      expect(item.status).toBe('pending');
    });
    expect(await screen.findByText(/Vente sauvegardée localement et chiffrée/)).toBeTruthy();
  });

  it('n’envoie la file qu’avec une session propriétaire et la même référence persistée', async () => {
    document.cookie = 'csrftoken=offline-test-token; path=/';
    const id = '00000000-0000-4000-8000-000000000008';
    const draft: storage.PendingSale = {
      id, status: 'pending', created_at: '2026-11-23T10:00:00Z', error: '',
      payload: {
        client_ref: id, origin: 'offline',
        device_ref: '11111111-1111-4111-8111-111111111111',
        lines: [{ product_id: 'p1', quantity: 1, unit_price: '2500.00', imei: '' }],
        amount_paid: '2500.00', method: 'cash', customer_name: '',
        customer_phone: '', due_date: null,
      },
    };
    vi.mocked(storage.listPending).mockResolvedValueOnce([draft]).mockResolvedValueOnce([]);
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url === '/api/auth/csrf/') return { ok: true, json: async () => ({ status: 'ok' }) };
      if (url === '/api/auth/session/') return { ok: true, json: async () => ({ authenticated: true }) };
      if (url === '/api/sales/' && options?.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({
          sale: { id: 'confirmed-1', reference: 'VTE-00001' },
        }) };
      }
      throw new Error('Unexpected route: ' + url);
    }));
    render(<OfflinePOS/>);
    expect(await screen.findByText('En attente de validation')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Synchroniser les ventes' }));
    await waitFor(() => {
      const post = vi.mocked(fetch).mock.calls.find(([url, options]) =>
        url === '/api/sales/' && options?.method === 'POST'
      );
      expect(post).toBeTruthy();
      expect(JSON.parse(post![1]!.body as string).client_ref).toBe(id);
      expect((post![1]!.headers as Record<string, string>)['X-CSRFToken']).toBe('offline-test-token');
      expect(storage.deletePending).toHaveBeenCalledWith(id);
    });
    expect(await screen.findByText(/1 vente\(s\) confirmée\(s\) par Django/)).toBeTruthy();
  });

});
