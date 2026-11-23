import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Checkout from './Checkout';

const accessory = {
  id: 'case-1', name: 'Pochette A17', brand: '', model: '',
  category: 'other', condition: 'new', sale_price: '2500', purchase_price: '1000', quantity: 10,
};
const phone = {
  id: 'phone-1', name: 'Téléphone', brand: 'Samsung', model: 'Galaxy A17',
  category: 'phone', condition: 'new', sale_price: '95000', purchase_price: '85000', quantity: 1,
};
const salesList = {
  results: [], today: {
    total: '0', cash_collected: '0', balance: '0', gross_profit: '0',
  },
};

describe('PhoneStock Pro — caisse intelligente', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=test-sale-token; path=/';
    let counter = 0;
    vi.stubGlobal('crypto', {
      randomUUID: () => '00000000-0000-4000-8000-' + String(++counter).padStart(12, '0'),
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url.startsWith('/api/products/?q=')) {
        return { ok: true, json: async () => ({ results: [accessory, phone] }) };
      }
      if (url === '/api/products/phone-1/') {
        return { ok: true, json: async () => ({
          phones: [{ id: 'unit1', sold: false, imeis: [{ slot: 1, imei: '490154203237518' }] }],
        }) };
      }
      if (url === '/api/sales/' && options?.method === 'POST') {
        const body = JSON.parse(options.body as string);
        const total = body.lines.reduce((sum: number, line: { unit_price: string; quantity: number }) =>
          sum + Number(line.unit_price) * line.quantity, 0);
        const paid = Number(body.amount_paid);
        return { ok: true, json: async () => ({
          sale: {
            id: 'sale-1', reference: 'VTE-ABC123', client_ref: body.client_ref,
            status: total > paid ? 'credit' : 'paid',
            total: total.toFixed(2), amount_paid: paid.toFixed(2), balance: (total - paid).toFixed(2),
          },
          replayed: false,
        }) };
      }
      if (url === '/api/sales/') return { ok: true, json: async () => salesList };
      throw new Error('Unexpected route: ' + url);
    }));
  });

  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('affiche les produits en cartes et le panier vide sans données fictives', async () => {
    render(<Checkout/>);
    expect(await screen.findByRole('button', { name: 'Ajouter Pochette A17' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ajouter Téléphone · Samsung · Galaxy A17' })).toBeTruthy();
    expect(screen.getByText(/Ton panier est vide/)).toBeTruthy();
    expect(document.querySelectorAll('.pos-product-card').length).toBe(2);
    expect(screen.getByRole('button', { name: 'Valider la vente' }).hasAttribute('disabled')).toBe(true);
  });

  it('ajoute des pochettes et valide une vente au comptant avec CSRF', async () => {
    render(<Checkout/>);
    const add = await screen.findByRole('button', { name: 'Ajouter Pochette A17' });
    fireEvent.click(add);
    fireEvent.click(screen.getByRole('button', { name: 'Augmenter Pochette A17' }));
    expect(screen.getByRole('button', { name: 'Valider la vente' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Valider la vente' }));
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([url, options]) => url === '/api/sales/' && options?.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(call![1]!.body as string);
      expect(body.lines[0].quantity).toBe(2);
      expect(body.amount_paid).toBe('5000.00');
      expect(body.lines[0].imei).toBe('');
      expect((call![1]!.headers as Record<string, string>)['X-CSRFToken']).toBe('test-sale-token');
    });
    expect(await screen.findByText(/Vente VTE-ABC123 enregistrée/)).toBeTruthy();
  });

  it('demande le client pour le paiement Moitié et garde le crédit', async () => {
    render(<Checkout/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter Pochette A17' }));
    fireEvent.click(screen.getByRole('button', { name: 'Moitié' }));
    expect(screen.getByText(/Vente à crédit/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nom du client *'), { target: { value: 'Awa' } });
    fireEvent.change(screen.getByLabelText('Téléphone du client *'), { target: { value: '75000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider la vente' }));
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([url, options]) => url === '/api/sales/' && options?.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(call![1]!.body as string);
      expect(body.amount_paid).toBe('1250.00');
      expect(body.customer_name).toBe('Awa');
      expect(body.customer_phone).toBe('75000000');
    });
  });

  it('demande un IMEI pour ajouter un téléphone au panier', async () => {
    render(<Checkout/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter Téléphone · Samsung · Galaxy A17' }));
    const input = await screen.findByLabelText('IMEI du téléphone *');
    fireEvent.change(input, { target: { value: '490154203237518' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au panier' }));
    expect(screen.getByText('IMEI : 490154203237518')).toBeTruthy();
  });
});
