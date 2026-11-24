import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DashboardOverview, { settledSaleAmounts } from './DashboardOverview';

vi.mock('./DashboardCharts', () => ({
  PaymentDoughnut: ({ settled, outstanding }: { settled: number; outstanding: number }) =>
    <output data-testid="donut-values">{settled} / {outstanding}</output>,
  SalesLineChart: ({ daily }: { daily: unknown[] }) =>
    <output data-testid="daily-count">{daily.length} jour(s)</output>,
  ProductsBarChart: ({ products }: { products: unknown[] }) =>
    <output data-testid="product-count">{products.length} article(s)</output>,
}));

const report = {
  period: 'month', start: '2026-11-01', end: '2026-11-24',
  summary: {
    sales_count: 3, revenue: '100000.00', collected: '75000.00',
    receivable_from_period_sales: '20000.00',
    purchase_cost_of_sold_items: '65000.00', gross_profit: '35000.00',
    expenses: '12000.00', operating_result: '23000.00',
  },
  products: [{
    product_id: 'p1', product_name: 'Téléphone A17', quantity: 1,
    revenue: '100000.00', gross_profit: '35000.00',
  }],
  daily: [{
    date: '2026-11-24', revenue: '100000.00', gross_profit: '35000.00',
  }],
};

describe('Tableau de bord et chiffres réels', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/reports/?')) return { ok: true, json: async () => report };
      throw new Error('Endpoint inattendu: ' + url);
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('lit PostgreSQL via API : cartes, anneau et données produits sans chiffres fictifs', async () => {
    render(<DashboardOverview dark={false}/>);
    expect(await screen.findAllByText('100 000 FCFA')).toBeTruthy();
    expect(screen.getByText('Encaissements réels')).toBeTruthy();
    expect(screen.getByText('75 000 FCFA')).toBeTruthy();
    expect(screen.getByText('20 000 FCFA')).toBeTruthy();
    expect(screen.getByText('23 000 FCFA')).toBeTruthy();
    // Encaissement de la période (75 000) is NOT necessarily what was settled
    // on sales of the period (80 000). The two measures are kept separate.
    expect(screen.getByTestId('donut-values').textContent).toBe('80000 / 20000');
    expect(screen.getByTestId('daily-count').textContent).toBe('1 jour(s)');
    expect(screen.getByTestId('product-count').textContent).toBe('1 article(s)');
    expect(vi.mocked(fetch).mock.calls.some(([url]) =>
      url === '/api/reports/?period=month'
    )).toBe(true);
  });

  it('actualise vraiment les montants et accepte les autres périodes', async () => {
    render(<DashboardOverview dark={true}/>);
    await screen.findAllByText('100 000 FCFA');
    fireEvent.click(screen.getByRole('button', { name: 'Aujourd’hui' }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) =>
      url === '/api/reports/?period=today'
    )).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([url]) =>
      url === '/api/reports/?period=today'
    ).length).toBeGreaterThanOrEqual(2));
  });

  it('ne montre aucune valeur trompeuse lors d’une erreur réseau', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Serveur indisponible'); }));
    render(<DashboardOverview dark={false}/>);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Serveur indisponible')).toBeTruthy();
    expect(screen.queryByText('0 FCFA')).toBeNull();
  });

  it('ne mélange pas les remboursements d’anciennes créances avec l’anneau', () => {
    expect(settledSaleAmounts(report.summary)).toEqual({
      settled: 80000, outstanding: 20000, turnover: 100000,
    });
    expect(settledSaleAmounts({
      ...report.summary, revenue: '0.00', collected: '5000.00',
      receivable_from_period_sales: '0.00',
    })).toEqual({ settled: 0, outstanding: 0, turnover: 0 });
  });
});
