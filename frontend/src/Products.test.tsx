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
    expect(screen.queryByLabelText('Catégorie')).toBeNull();
    expect(screen.queryByLabelText(/Référence/)).toBeNull();
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

  it('sépare nom et modèle pour un téléphone sans catégorie ni référence', async () => {
    render(<Products/>);
    await screen.findByText(/Aucun produit trouvé/);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un téléphone' }));
    expect(screen.queryByLabelText('Catégorie')).toBeNull();
    expect(screen.queryByLabelText(/Référence/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Nom du produit *'), { target: { value: 'Téléphone' } });
    fireEvent.change(screen.getByLabelText('Marque *'), { target: { value: 'Samsung' } });
    fireEvent.change(screen.getByLabelText('État *'), { target: { value: 'used' } });
    fireEvent.change(screen.getByLabelText('Modèle *'), { target: { value: 'Galaxy A17, 128 Go' } });
    fireEvent.change(screen.getByLabelText("Prix d'achat (FCFA)"), { target: { value: '85000' } });
    fireEvent.change(screen.getByLabelText('Prix de vente (FCFA)'), { target: { value: '95000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([url, opts]) => url === '/api/products/' && opts?.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(call![1]!.body as string);
      expect(body.name).toBe('Téléphone');
      expect(body.brand).toBe('Samsung');
      expect(body.condition).toBe('used');
      expect(body.model).toBe('Galaxy A17, 128 Go');
      expect(body.category).toBe('phone');
      expect(body.phones).toEqual([]);
      expect(body.sku).toBeUndefined();
    });
  });


  it('affiche les détails et IMEI puis ouvre la modification', async () => {
    const product = {
      id: 'phone-1', name: 'Téléphone', category: 'phone', sku: '',
      brand: 'Samsung', model: 'Galaxy A17', condition: 'new',
      purchase_price: '85000.00', sale_price: '95000.00',
      quantity: 1, low_stock_threshold: 3, low_stock: true,
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url === '/api/products/?q=') return {
        ok: true, json: async () => ({ results: [product] }),
      };
      if (url === '/api/products/phone-1/' && !options?.method) return {
        ok: true, json: async () => ({
          product, phones: [{ id: 'unit-1', sold: false, imeis: [{ slot: 1, imei: '490154203237518' }] }],
          movements: [{ delta: 1, reason: 'Enregistrement IMEI', note: '', created_at: '2026-11-23T10:00:00Z' }],
          changes: [], phones_truncated: false,
        }),
      };
      if (url === '/api/products/phone-1/' && options?.method === 'PATCH') return {
        ok: true, json: async () => ({ product: { ...product, sale_price: '97000.00' }, updated: true }),
      };
      throw new Error('Route inattendue : ' + url);
    }));
    render(<Products/>);
    expect(await screen.findByText('Samsung · Galaxy A17 · Neuf')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Détails' }));
    expect(await screen.findByText('IMEI 1 : 490154203237518')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' }).at(-1)!);
    expect(screen.getByLabelText('Marque *')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Prix de vente (FCFA)'), { target: { value: '97000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => {
      const write = vi.mocked(fetch).mock.calls.find(([url, opts]) =>
        url === '/api/products/phone-1/' && opts?.method === 'PATCH'
      );
      expect(write).toBeTruthy();
      const body = JSON.parse(write![1]!.body as string);
      expect(body.sale_price).toBe('97000');
      expect(body.quantity).toBeUndefined();
      expect(body.imeis).toBeUndefined();
    });
  });

  it('explique un IMEI incomplet et propose le dernier chiffre calculé', async () => {
    render(<Products/>);
    await screen.findByText(/Aucun produit trouvé/);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un téléphone' }));
    fireEvent.change(screen.getByLabelText('IMEI (facultatif maintenant)'), {
      target: { value: '49015420323751' },
    });
    expect(screen.getByText(/14 chiffres saisis/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Compléter les 15 chiffres' }));
    expect((screen.getByLabelText('IMEI (facultatif maintenant)') as HTMLTextAreaElement).value)
      .toBe('490154203237518');
    expect(screen.getByText(/contrôle valide/)).toBeTruthy();
  });
});
