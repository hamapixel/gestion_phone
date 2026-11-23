import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Products from './Products';

describe('PhoneStock - catalogue', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=demo-token; path=/';
    vi.stubGlobal('fetch', vi.fn(async (_url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') return { ok: true, json: async () => ({ product: { id: 'x' } }) };
      return { ok: true, json: async () => ({ results: [], limit: 200 }) };
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('affiche un catalogue vide sans produits fictifs', async () => {
    render(<Products/>);
    expect(await screen.findByText(/Aucun produit trouvé/)).toBeTruthy();
  });
  it('ajoute une pochette avec la requête authentifiée et CSRF', async () => {
    render(<Products/>);
    await screen.findByText(/Aucun produit trouvé/);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un article' }));
    fireEvent.change(screen.getByLabelText('Nom du produit *'), { target: { value: 'Pochette Samsung' } });
    fireEvent.change(screen.getByLabelText("Prix d'achat (FCFA)"), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Prix de vente (FCFA)'), { target: { value: '2500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([url, opts]) =>
        url === '/api/products/' &&
        opts?.method === 'POST' &&
        (opts.headers as Record<string,string>)['X-CSRFToken'] === 'demo-token'
      )).toBe(true);
    });
  });
});
