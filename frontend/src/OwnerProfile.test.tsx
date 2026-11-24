import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OwnerProfile from './OwnerProfile';

const initial = {
  username: '74980744', first_name: 'Hama', last_name: 'Traoré',
  display_name: 'Hama Traoré', email: 'owner@example.com',
  date_joined: '2026-11-01T08:00:00Z', last_login: '2026-11-24T09:00:00Z',
  role: 'Propriétaire',
};

describe('Compte du propriétaire', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=profile-csrf-token; path=/';
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url === '/api/account/profile/' && options?.method === 'PUT') {
        const input = JSON.parse(options.body as string);
        return { ok: true, json: async () => ({ profile: {
          ...initial, ...input, display_name: [input.first_name, input.last_name].filter(Boolean).join(' '),
        } }) };
      }
      if (url === '/api/account/profile/') return { ok: true, json: async () => ({ profile: initial }) };
      if (url === '/api/account/password/' && options?.method === 'POST')
        return { ok: true, json: async () => ({ updated: true, detail: 'Mot de passe modifié.' }) };
      throw new Error('Route inconnue: ' + url);
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('affiche le compte propriétaire, conserve l’identifiant et enregistre les champs avec CSRF', async () => {
    render(<OwnerProfile/>);
    expect(await screen.findByText('Hama Traoré')).toBeTruthy();
    expect((screen.getByLabelText('Identifiant de connexion') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Aminata' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer mon profil' }));
    await waitFor(() => {
      const write = vi.mocked(fetch).mock.calls.find(([url, options]) =>
        url === '/api/account/profile/' && options?.method === 'PUT'
      );
      expect(write).toBeTruthy();
      expect(JSON.parse(write![1]!.body as string)).toEqual({
        first_name: 'Aminata', last_name: 'Traoré', email: 'owner@example.com',
      });
      expect((write![1]!.headers as Record<string,string>)['X-CSRFToken']).toBe('profile-csrf-token');
    });
    expect(await screen.findByText('Aminata Traoré')).toBeTruthy();
  });

  it('refuse une confirmation différente avant l’appel serveur et vide les secrets après succès', async () => {
    render(<OwnerProfile/>);
    await screen.findByText('Hama Traoré');
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'AncienSecret!2026' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'NouveauSecret!2026' } });
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), { target: { value: 'AutreSecret!2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }));
    expect(screen.getByText(/La confirmation ne correspond pas/)).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/account/password/')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), { target: { value: 'NouveauSecret!2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe' }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => url === '/api/account/password/')).toBe(true));
    expect(await screen.findByText(/Votre session actuelle reste ouverte/)).toBeTruthy();
    expect((screen.getByLabelText('Mot de passe actuel') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Nouveau mot de passe') as HTMLInputElement).value).toBe('');
  });
});
