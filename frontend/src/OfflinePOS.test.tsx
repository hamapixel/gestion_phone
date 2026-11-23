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
});
