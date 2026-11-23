import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Reports from './Reports';

const report = {
  period: 'month', start: '2026-11-01', end: '2026-11-23',
  summary: {
    sales_count: 2, revenue: '10000.00', purchase_cost_of_sold_items: '4000.00',
    gross_profit: '6000.00', expenses: '1200.00', operating_result: '4800.00',
    collected: '7500.00', receivable_from_period_sales: '2500.00',
  },
  products: [{ product_id: 'case-1', product_name: 'Pochette Galaxy A17', quantity: 4, revenue: '10000.00', gross_profit: '6000.00' }],
  daily: [{ date: '2026-11-23', revenue: '10000.00', gross_profit: '6000.00' }],
};

describe('PhoneStock — rapports', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/reports/?')) {
        return { ok: true, json: async () => report };
      }
      throw new Error('Route inattendue : ' + url);
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('affiche ventes, marge, dépenses et résultat sans confondre encaissements', async () => {
    render(<Reports/>);
    expect(await screen.findByText('Pochette Galaxy A17')).toBeTruthy();
    expect(screen.getByText('Résultat indicatif')).toBeTruthy();
    expect(screen.getByText('4 800 FCFA')).toBeTruthy();
    expect(screen.getByText('7 500 FCFA')).toBeTruthy();
    expect(screen.getByText('2 500 FCFA')).toBeTruthy();
    expect(document.querySelector('.phase7-product-card')).not.toBeNull();
  });

  it('change réellement la période et conserve les contrôles de dates', async () => {
    render(<Reports/>);
    await screen.findByText('Pochette Galaxy A17');
    fireEvent.click(screen.getByRole('button', { name: 'Semaine' }));
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([url]) => url === '/api/reports/?period=week')).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Période' }));
    expect(screen.getByLabelText('Du')).toBeTruthy();
    expect(screen.getByLabelText('Au')).toBeTruthy();
  });
});
