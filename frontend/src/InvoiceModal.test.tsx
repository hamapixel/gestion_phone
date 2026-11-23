import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import InvoiceModal from './InvoiceModal';

const shop = {
  id: 'brand-1', name: 'Boutique Seydou', phone: '74980744',
  address: 'Bamako, Mali', email: 'shop@example.com',
  tax_id: 'NIF-123', footer: 'Merci pour votre confiance.', logo_data: '',
};
const sale = {
  id: 'sale-1', reference: 'VTE-00001', created_at: '2026-11-23T12:00:00Z',
  customer_name: 'Awa', customer_phone: '75000000', due_date: null,
  total: '95000.00', amount_paid: '60000.00', balance: '35000.00', method: 'cash',
  lines: [{
    product_name: 'Téléphone', brand: 'Samsung', model: 'Galaxy A17',
    condition: 'new', quantity: 1, imei: '490154203237518', unit_price: '95000.00', total: '95000.00',
  }],
};

describe('Documents PhoneStock Pro', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/sales/sale-1/invoice/') return {
        ok: true, json: async () => ({ kind: 'invoice', shop, sale }),
      };
      if (url === '/api/payments/p-1/receipt/') return {
        ok: true, json: async () => ({
          kind: 'payment', shop, sale,
          payment: {
            id: 'p-1', reference: 'REC-00001', created_at: '2026-11-23T15:00:00Z',
            amount: '20000.00', method: 'orange', balance_after: '15000.00',
          },
        }),
      };
      throw new Error('Route inattendue : ' + url);
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('montre une facture personnalisée avec IMEI, prix et format A5', async () => {
    const printer = vi.fn();
    vi.stubGlobal('print', printer);
    render(<InvoiceModal saleId="sale-1" onClose={vi.fn()}/>);
    expect(await screen.findByText('Boutique Seydou')).toBeTruthy();
    expect(screen.getByText('IMEI : 490154203237518')).toBeTruthy();
    expect(screen.getByText('35 000 FCFA')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'A5' }));
    expect(document.querySelector('.invoice-paper--a5')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Imprimer / PDF' }));
    expect(printer).toHaveBeenCalledOnce();
  });

  it('montre le reçu individuel du versement sans coûts d’achat', async () => {
    render(<InvoiceModal paymentId="p-1" onClose={vi.fn()}/>);
    expect(await screen.findByText('REC-00001')).toBeTruthy();
    expect(screen.getByText('Orange Money')).toBeTruthy();
    expect(screen.getByText('15 000 FCFA')).toBeTruthy();
    expect(screen.queryByText('Marge brute')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ticket 80 mm' }));
    expect(document.querySelector('.invoice-paper--ticket')).not.toBeNull();
  });
});
