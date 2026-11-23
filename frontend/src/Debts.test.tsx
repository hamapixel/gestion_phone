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
    expect(await screen.findByText('Awa Coulibaly')).toBeTruthy();
    expect(screen.getByText('VTE-AAA123', { exact: false })).toBeTruthy();
    expect(screen.getAllByText('7 000 FCFA', { exact: false }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Historique des versements (1)')).toBeTruthy();
    expect(document.querySelector('.debt-card')).not.toBeNull();
  });
  it('encaisse la moitié avec CSRF sans modifier le montant de la vente', async () => {
    render(<Debts/>);
    await screen.findByText('Awa Coulibaly');
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
});
