import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import AuthGate from './AuthGate';
import { hasVault } from './offlineVault';

vi.mock('./offlineVault', () => ({
  hasVault: vi.fn(async () => true),
  lockVault: vi.fn(),
  isUnlocked: vi.fn(() => false),
}));
vi.mock('./OfflinePOS', () => ({
  default: () => <section aria-label="Coffre local">Coffre local chiffré seulement</section>,
}));

describe('Authentification lorsque le serveur est hors ligne', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Network request failed');
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('donne accès uniquement au coffre local après une préparation préalable', async () => {
    vi.mocked(hasVault).mockResolvedValue(true);
    render(<AuthGate/>);
    expect(await screen.findByText('Coffre local chiffré seulement')).toBeTruthy();
    expect(screen.queryByText('Bienvenue dans PhoneStock Pro')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Valider la vente' })).toBeNull();
  });

  it('ne contourne pas l’authentification si le coffre n’a jamais été configuré', async () => {
    vi.mocked(hasVault).mockResolvedValue(false);
    render(<AuthGate/>);
    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeTruthy();
    expect(screen.queryByText('Coffre local chiffré seulement')).toBeNull();
  });
});
