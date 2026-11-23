import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Expenses from './Expenses';

const item = {
  id: 'e-1', client_ref: 'ref-1', label: 'Transport', amount: '1200.00',
  spent_on: '2026-11-23', note: 'Taxi', created_at: '2026-11-23T13:00:00Z',
};

describe('PhoneStock — dépenses', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=expense-token; path=/';
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url.startsWith('/api/expenses/?')) {
        return { ok: true, json: async () => ({
          results: [], total: '0.00', period: 'month', start: '2026-11-01', end: '2026-11-23',
        }) };
      }
      if (url === '/api/expenses/' && options?.method === 'POST') {
        return { ok: true, json: async () => ({ expense: item, replayed: false }) };
      }
      throw new Error('Route inattendue : ' + url);
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('affiche une liste vide sans inventer des dépenses', async () => {
    render(<Expenses/>);
    expect(await screen.findByText('Aucune dépense enregistrée sur cette période.')).toBeTruthy();
    expect(screen.getByText('Total des dépenses de la période')).toBeTruthy();
  });

  it('enregistre une dépense courte avec UUID de requête et protection CSRF', async () => {
    render(<Expenses/>);
    await screen.findByText('Aucune dépense enregistrée sur cette période.');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une dépense' }));
    fireEvent.change(screen.getByLabelText('Motif de la dépense *'), { target: { value: 'Transport' } });
    fireEvent.change(screen.getByLabelText('Montant (FCFA) *'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la dépense' }));
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([url, opts]) =>
        url === '/api/expenses/' && opts?.method === 'POST'
      );
      expect(call).toBeTruthy();
      const body = JSON.parse(call![1]!.body as string);
      expect(body.label).toBe('Transport');
      expect(body.amount).toBe('1200');
      expect(body.client_ref).toBe('11111111-1111-4111-8111-111111111111');
      expect((call![1]!.headers as Record<string,string>)['X-CSRFToken']).toBe('expense-token');
    });
    expect(await screen.findByText(/Dépense enregistrée/)).toBeTruthy();
  });
});
