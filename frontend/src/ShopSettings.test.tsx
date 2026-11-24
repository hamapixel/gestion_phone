import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShopSettings from './ShopSettings';

describe('Paramètres de facturation', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=invoice-test; path=/';
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'PUT') {
        const values = JSON.parse(options.body as string);
        return { ok: true, json: async () => ({ shop: { ...values, id: 'version-2' }, updated: true }) };
      }
      return { ok: true, json: async () => ({ shop: {
        id: 'version-1', name: 'PhoneStock Pro', phone: '', email: '',
        address: '', tax_id: '', footer: '', logo_data: '',
      } }) };
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('charge et modifie la boutique sans demander catégorie ou rôles', async () => {
    const onSaved = vi.fn();
    render(<ShopSettings onSaved={onSaved}/>);
    expect(await screen.findByDisplayValue('PhoneStock Pro')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nom de la boutique *'), { target: { value: 'Boutique Seydou' } });
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '74980744' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l’identité de ma boutique' }));
    await waitFor(() => {
      const found = vi.mocked(fetch).mock.calls.find(([url, opts]) => url === '/api/shop/' && opts?.method === 'PUT');
      expect(found).toBeTruthy();
      const data = JSON.parse(found![1]!.body as string);
      expect(data.name).toBe('Boutique Seydou');
      expect(data.phone).toBe('74980744');
      expect((found![1]!.headers as Record<string, string>)['X-CSRFToken']).toBe('invoice-test');
    });
    expect(await screen.findByText(/Identité enregistrée/)).toBeTruthy();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Boutique Seydou', phone: '74980744' }));
  });
});
