import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Login from './Login';

describe('Connexion sous la marque de la boutique', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/shop/identity/') {
        return { ok: true, json: async () => ({
          identity: { name: 'YaraPhone', logo_data: '' },
        }) };
      }
      throw new Error('URL inconnue');
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('utilise le nom réel de la boutique sans exposer les paramètres privés', async () => {
    render(<Login onSubmit={vi.fn()} disabled={false} error=""/>);
    expect(await screen.findByText('YaraPhone')).toBeTruthy();
    expect(screen.getByText(/Connectez-vous à votre espace YaraPhone/)).toBeTruthy();
    expect(document.title).toBe('YaraPhone · Gestion de boutique');
    expect(screen.getByText(/Propulsé par PhoneStock Pro/)).toBeTruthy();
  });

  it('garde une marque neutre si le serveur ne répond pas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    render(<Login onSubmit={vi.fn()} disabled={false} error=""/>);
    expect(screen.getByText('PhoneStock Pro')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy();
  });
});
