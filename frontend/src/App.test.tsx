import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByRole('heading', { name: 'Bienvenue !' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Aperçu financier' })).toBeTruthy();
    expect(screen.queryByText('Pilotez')).toBeNull();
    expect(screen.queryByText('ESPACE PREMIUM · VOTRE BOUTIQUE')).toBeNull();
  });

  it('salue la personne réellement connectée plutôt que la boutique', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/account/profile/') return { ok: true, json: async () => ({
        profile: { username: 'owner123', first_name: 'Aminata', display_name: 'Aminata Traoré' },
      }) };
      if (url === '/api/shop/') return { ok: true, json: async () => ({
        shop: { name: 'YaraPhone', logo_data: '' },
      }) };
      if (url === '/api/health/') return { ok: true, json: async () => ({ status: 'ok' }) };
      return { ok: true, json: async () => ({ status: 'ok' }) };
    }));
    render(<App ownerName="owner123"/>);
    expect(await screen.findByRole('heading', { name: 'Bienvenue, Aminata !' })).toBeTruthy();
    expect(screen.queryByText('Bienvenue dans YaraPhone')).toBeNull();
    expect(screen.queryByText('VOTRE COMMERCE, VOTRE IDENTITÉ')).toBeNull();
    expect(screen.queryByText('Fonctionnalités disponibles')).toBeNull();
    expect(screen.queryByText('ESPACE PREMIUM · VOTRE BOUTIQUE')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Aperçu financier' })).toBeTruthy();
  });

  it('accueille le compte connecté même si l’API du profil ne répond pas', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/account/profile/') throw new Error('Profil temporairement indisponible');
      return { ok: true, json: async () => ({ status: 'ok' }) };
    }));
    render(<App ownerName="proprietaire01"/>);
    expect(await screen.findByRole('heading', { name: 'Bienvenue, proprietaire01 !' })).toBeTruthy();
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

  it('personnalise immédiatement tout le logiciel après modification du nom de boutique', async () => {
    const initial = {
      id: 'branding-1', name: 'YaraPhone', logo_data: '',
      phone: '', email: '', address: '', tax_id: '', footer: '',
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url === '/api/shop/' && options?.method === 'PUT') {
        const edited = JSON.parse(options.body as string);
        return { ok: true, json: async () => ({ shop: { ...initial, ...edited, id: 'branding-2' }, updated: true }) };
      }
      if (url === '/api/shop/') return { ok: true, json: async () => ({ shop: initial }) };
      if (url === '/api/health/') return { ok: true, json: async () => ({ status: 'ok' }) };
      throw new Error('Unexpected URL: ' + url);
    }));
    render(<App/>);
    expect(await screen.findByRole('heading', { name: 'Bienvenue !' })).toBeTruthy();
    await waitFor(() => {
      expect(document.title).toBe('YaraPhone · Gestion de boutique');
      expect(screen.getAllByTitle('YaraPhone').length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Paramètres' })[0]);
    fireEvent.change(await screen.findByLabelText('Nom de la boutique *'), {
      target: { value: 'YaraPhone Premium' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l’identité de ma boutique' }));
    await waitFor(() => {
      expect(screen.getAllByTitle('YaraPhone Premium').length).toBeGreaterThanOrEqual(2);
      expect(document.title).toBe('YaraPhone Premium · Gestion de boutique');
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Tableau de bord' })[0]);
    expect(screen.getByRole('heading', { name: 'Bienvenue !' })).toBeTruthy();
    expect(screen.getAllByText(/Propulsé par PhoneStock Pro/).length).toBeGreaterThanOrEqual(1);
  });

  it('permet de changer le thème et mémorise le choix', async () => {
    render(<App/>);
    await screen.findByText('API connectée');
    fireEvent.click(screen.getByRole('button', { name: 'Changer le thème' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('phonestock-theme')).toBe('dark');
  });
});
