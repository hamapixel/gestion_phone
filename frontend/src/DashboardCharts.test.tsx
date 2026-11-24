import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PaymentDoughnut, SalesLineChart, ProductsBarChart } from './DashboardCharts';

const calls = vi.hoisted(() => ({ configs: [] as {type: string; data: {datasets: {data: number[]}[]} }[], destroyed: 0 }));
vi.mock('chart.js/auto', () => ({
  default: class MockChart {
    constructor(_canvas: unknown, options: {type: string; data: {datasets: {data: number[]}[]} }) {
      calls.configs.push(options);
    }
    destroy() { calls.destroyed++; }
  },
}));

describe('Chart.js branchement et cycles de vie', () => {
  afterEach(() => { cleanup(); calls.configs.length = 0; calls.destroyed = 0; });

  it('construit un vrai graphique Chart.js doughnut avec les montants exacts', () => {
    const result = render(<PaymentDoughnut settled={80000} outstanding={20000} dark={false}/>);
    expect(calls.configs[0].type).toBe('doughnut');
    expect(calls.configs[0].data.datasets[0].data).toEqual([80000, 20000]);
    expect(screen.getByRole('img', { name: /Diagramme en anneau/ })).toBeTruthy();
    result.unmount();
    expect(calls.destroyed).toBe(1);
  });

  it('affiche les ventes journalières et le top produit sans données fictives', () => {
    const one = render(<SalesLineChart dark={true} daily={[
      { date: '2026-11-24', revenue: '2500.00', gross_profit: '1500.00' },
    ]}/>);
    expect(calls.configs[0].type).toBe('line');
    expect(calls.configs[0].data.datasets[0].data).toEqual([2500]);
    expect(calls.configs[0].data.datasets[1].data).toEqual([1500]);
    one.unmount();
    const two = render(<ProductsBarChart dark={false} products={[
      { product_id: 'p1', product_name: 'Pochette', revenue: '2500.00' },
    ]}/>);
    expect(calls.configs[1].type).toBe('bar');
    expect(calls.configs[1].data.datasets[0].data).toEqual([2500]);
    two.unmount();
    expect(calls.destroyed).toBe(2);
  });

  it('évite les graphiques vides quand aucune vente existe', () => {
    render(<PaymentDoughnut settled={0} outstanding={0} dark={false}/>);
    render(<ProductsBarChart products={[]} dark={false}/>);
    expect(calls.configs).toHaveLength(0);
  });
});
