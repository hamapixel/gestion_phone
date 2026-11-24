import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Debts from './Debts';

const credit = {
  id: 'sale-1', reference: 'VTE-AAA123', created_at: '2026-11-20T10:00:00Z',
  customer_name: 'Awa Coulibaly', customer_phone: '75000000', due_date: '2026-11-22',
  overdue: true, total: '10000.00', amount_paid: '3000.00', balance: '7000.00',
  status: 'credit', payments: [
    { id: 'p0', client_ref: null, amount: '3000.00', method: 'cash', created_at: '2026-11-20T10:00:00Z' },
  ],
};
describe('PhoneStock — créances', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=debt-test-csrf; path=/';
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url.startsWith('/api/debt-payments/?')) {
        return { ok: true, json: async () => ({ results: [
          { id: 'p0', client_ref: null, amount: '3000.00', method: 'cash',
            created_at: '2026-11-20T10:00:00Z', sale_id: 'sale-1',
            reference: 'VTE-AAA123', customer_name: 'Awa Coulibaly',
            customer_phone: '75000000', kind: 'initial' },
        ], limit: 100 }) };
      }
      if (url.startsWith('/api/debts/?')) {
        return { ok: true, json: async () => ({
          results: [credit], summary: { outstanding: '7000.00', open_count: 1, overdue_count: 1 },
        }) };
      }
      if (url === '/api/debts/sale-1/payments/' && options?.method === 'POST') {
        return { ok: true, json: async () => ({ debt: { ...credit, balance: '3500.00' }, replayed: false }) };
      }
      throw new Error('Route inattendue : ' + url);
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it('affiche la créance réelle en carte, le reste dû et les échéances', async () => {
    render(<Debts/>);
    expect((await screen.findAllByText('Awa Coulibaly')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('VTE-AAA123', { exact: false }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('7 000 FCFA', { exact: false }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Historique des versements (1)')).toBeTruthy();
    expect(document.querySelector('.debt-card')).not.toBeNull();
    expect(await screen.findByRole('heading', { name: 'Liste des paiements de créances' })).toBeTruthy();
    expect(screen.getByText('Acompte initial')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reçu du paiement p0' })).toBeTruthy();
    expect(document.querySelector('.debt-history-table tbody tr')).not.toBeNull();
    expect(screen.getByRole('table')).toBeTruthy();
  });
  it('filtre les paiements sans altérer les montants ni les reçus, avec total des lignes affichées', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/debt-payments/?')) return { ok: true, json: async () => ({
        results: [
          { id: 'p0', amount: '3000.00', method: 'cash', created_at: '2026-11-20T10:00:00Z',
            sale_id: 'sale-1', reference: 'VTE-AAA123', customer_name: 'Awa Coulibaly',
            customer_phone: '75000000', kind: 'initial', client_ref: null },
          { id: 'p1', amount: '500.00', method: 'orange', created_at: '2026-11-21T10:00:00Z',
            sale_id: 'sale-1', reference: 'VTE-AAA123', customer_name: 'Awa Coulibaly',
            customer_phone: '75000000', kind: 'repayment', client_ref: 'repay-1' },
        ], limit: 100,
      }) };
      if (url.startsWith('/api/debts/?')) return { ok: true, json: async () => ({
        results: [credit], summary: { outstanding: '7000.00', open_count: 1, overdue_count: 1 },
      }) };
      throw new Error('Route inattendue : ' + url);
    }));
    render(<Debts/>);
    expect(await screen.findByText('3 500 FCFA')).toBeTruthy();
    const table = screen.getByRole('table');
    expect(table.querySelectorAll('thead th').length).toBe(7);
    expect(table.querySelectorAll('tbody tr').length).toBe(2);
    expect(screen.getByRole('button', { name: 'Reçu du paiement p1' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remboursements' }));
    expect(screen.getAllByText('500 FCFA').length).toBeGreaterThanOrEqual(1);
    expect(table.querySelectorAll('tbody tr').length).toBe(1);
    expect(screen.queryByRole('button', { name: 'Reçu du paiement p0' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Acomptes' }));
    expect(screen.getAllByText('3 000 FCFA').length).toBeGreaterThanOrEqual(1);
    expect(table.querySelectorAll('tbody tr').length).toBe(1);
    expect(screen.queryByRole('button', { name: 'Reçu du paiement p1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tous les paiements' }));
    expect(table.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('encaisse la moitié avec CSRF sans modifier le montant de la vente', async () => {
    render(<Debts/>);
    await screen.findAllByText('Awa Coulibaly');
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser' }));
    fireEvent.click(screen.getByRole('button', { name: 'Moitié' }));
    expect((screen.getByLabelText('Montant à encaisser') as HTMLInputElement).value).toBe('3500.00');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le versement' }));
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([url, opts]) => url === '/api/debts/sale-1/payments/' && opts?.method === 'POST');
      expect(call).toBeTruthy();
      const data = JSON.parse(call![1]!.body as string);
      expect(data.amount).toBe('3500.00');
      expect(data.method).toBe('cash');
      expect(data.client_ref).toBe('11111111-1111-4111-8111-111111111111');
      expect((call![1]!.headers as Record<string,string>)['X-CSRFToken']).toBe('debt-test-csrf');
    });
  });

  it('prépare une relance WhatsApp polie ou ferme avant ouverture', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    render(<Debts/>);
    await screen.findAllByText('Awa Coulibaly');
    fireEvent.click(screen.getByRole('button', { name: 'Relancer WhatsApp' }));
    expect(screen.getByRole('heading', { name: 'Relance WhatsApp' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ferme' }));
    const message = screen.getByLabelText('Message à personnaliser') as HTMLTextAreaElement;
    expect(message.value).toContain('régulariser');
    fireEvent.change(message, { target: { value: 'Bonjour, merci de régler votre solde.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir WhatsApp' }));
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0][0]).toContain('https://wa.me/22375000000?text=');
    expect(decodeURIComponent(open.mock.calls[0][0])).toContain('Bonjour, merci de régler votre solde.');
  });
});
