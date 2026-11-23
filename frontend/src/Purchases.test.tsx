import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Purchases from './Purchases';

describe('PhoneStock achats fournisseurs', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=test-token; path=/';
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000001' });
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/products/') return { ok: true, json: async () => ({ results: [
        { id: 'case-id', name: 'Pochette A17', brand: '', model: '', category: 'other', purchase_price: '1000', quantity: 10 },
      ] }) };
      if (url === '/api/suppliers/') return { ok: true, json: async () => ({ results: [] }) };
      if (url === '/api/purchases/' && opts?.method === 'POST') return { ok: true, json: async () => ({
        receipt: { id: 'receipt-id', total: '5000', supplier: { name: 'Fournisseur Central' }, lines: [] }, replayed: false,
      }) };
      if (url === '/api/purchases/') return { ok: true, json: async () => ({ results: [] }) };
      throw new Error('URL inattendue : ' + url);
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('montre les achats sans données inventées', async () => {
    render(<Purchases/>);
    expect(await screen.findByText(/Aucun achat fournisseur enregistré/)).toBeTruthy();
  });

  it('enregistre un achat avec fournisseur et quantité en utilisant CSRF', async () => {
    render(<Purchases/>);
    await screen.findByText(/Aucun achat fournisseur enregistré/);
    fireEvent.click(screen.getByRole('button', { name: 'Nouvel achat' }));
    fireEvent.change(screen.getByLabelText('Fournisseur *'), { target: { value: 'Fournisseur Central' } });
    fireEvent.change(screen.getByLabelText('Produit *'), { target: { value: 'case-id' } });
    fireEvent.change(screen.getByLabelText('Quantité *'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider la réception' }));
    await waitFor(() => {
      const found = vi.mocked(fetch).mock.calls.find(([url, opts]) =>
        url === '/api/purchases/' && opts?.method === 'POST'
      );
      expect(found).toBeTruthy();
      const body = JSON.parse(found![1]!.body as string);
      expect(body.supplier.name).toBe('Fournisseur Central');
      expect(body.lines[0].quantity).toBe(5);
      expect(body.lines[0].unit_cost).toBe('1000');
      expect((found![1]!.headers as Record<string,string>)['X-CSRFToken']).toBe('test-token');
    });
  });
});
