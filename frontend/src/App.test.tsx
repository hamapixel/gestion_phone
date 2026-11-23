import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

describe('PhoneStock Pro - phase 01', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/products/')) return {
        ok: true, json: async () => ({ results: [] }),
      };
      if (url === '/api/sales/') return {
        ok: true, json: async () => ({
          results: [], today: { total: '0', cash_collected: '0', balance: '0', gross_profit: '0' },
        }),
      };
      return { ok: true, json: async () => ({ status: 'ok' }) };
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('affiche le tableau de bord', async () => {
    render(<App/>);
    await screen.findByText('API connectée');
    expect(screen.getByText('Bienvenue dans PhoneStock Pro')).toBeTruthy();
    expect(screen.getByText('Prochaines fonctionnalités')).toBeTruthy();
  });

  it('ouvre la caisse active sans afficher un module fictif', async () => {
    render(<App/>);
    await screen.findByText('API connectée');
    fireEvent.click(screen.getAllByRole('button', { name: 'Caisse' })[0]);
    expect(await screen.findByText('Articles disponibles')).toBeTruthy();
    expect(screen.queryByText('MODULE EN PRÉPARATION')).toBeNull();
  });

  it('n’affiche aucun module de gestion des utilisateurs', async () => {
    render(<App/>);
    await screen.findByText('API connectée');
    expect(screen.queryByRole('button', { name: 'Utilisateurs' })).toBeNull();
  });

  it('permet de changer le thème et mémorise le choix', async () => {
    render(<App/>);
    await screen.findByText('API connectée');
    fireEvent.click(screen.getByRole('button', { name: 'Changer le thème' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('phonestock-theme')).toBe('dark');
  });
});
