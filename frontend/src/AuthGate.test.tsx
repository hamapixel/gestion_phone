import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthGate from './AuthGate';

describe('PhoneStock Pro - propriétaire unique', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=test-csrf-cookie; path=/';
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url === '/api/auth/csrf/') return { ok: true, json: async () => ({ status: 'ok' }) };
      if (url === '/api/auth/session/') return { ok: true, json: async () => ({ authenticated: false }) };
      if (url === '/api/auth/login/') {
        const body = JSON.parse(options?.body as string);
        return body.password === 'StrongOwnerPass+2026'
          ? { ok: true, json: async () => ({ authenticated: true, owner: '74980744' }) }
          : { ok: false, json: async () => ({ detail: 'Identifiant ou mot de passe incorrect.' }) };
      }
      if (url === '/api/auth/logout/') return { ok: true, json: async () => ({ authenticated: false }) };
      if (url === '/api/health/') return { ok: true, json: async () => ({ status: 'ok' }) };
      throw new Error('Route inconnue');
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('protège le tableau de bord tant que le propriétaire est déconnecté', async () => {
    render(<AuthGate/>);
    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Bienvenue/ })).toBeNull();
  });

  it('affiche la connexion compacte et permet un login propriétaire', async () => {
    render(<AuthGate/>);
    await screen.findByRole('button', { name: 'Se connecter' });
    fireEvent.change(screen.getByLabelText('Téléphone ou email'), { target: { value: '74980744' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'StrongOwnerPass+2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('heading', { name: 'Bienvenue, 74980744 !' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy());
  });

  it('n’ouvre pas le tableau de bord avec un mauvais mot de passe', async () => {
    render(<AuthGate/>);
    await screen.findByRole('button', { name: 'Se connecter' });
    fireEvent.change(screen.getByLabelText('Téléphone ou email'), { target: { value: '74980744' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'incorrect' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Bienvenue/ })).toBeNull();
  });
});
