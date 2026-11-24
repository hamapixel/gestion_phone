import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthGate from './AuthGate';

describe('Phase 09 — démarrage natif Windows', () => {
  afterEach(() => {
    cleanup();
    delete window.__TAURI__;
    vi.unstubAllGlobals();
  });
  it('ouvre le coffre natif sans contacter une API Django indisponible', async () => {
    let initialized = false;
    let unlocked = false;
    const invoke = vi.fn(async (command: string) => {
      if (command === 'native_vault_status') return {
        initialized, unlocked, pending_count: 0, engine: 'SQLite',
      };
      if (command === 'native_unlock') {
        initialized = true; unlocked = true;
        return { initialized, unlocked, pending_count: 0, engine: 'SQLite' };
      }
      if (command === 'native_lock') {
        unlocked = false;
        return { initialized, unlocked, pending_count: 0, engine: 'SQLite' };
      }
      if (command === 'native_read_catalog') return null;
      if (command === 'native_list_drafts') return [];
      throw new Error('commande interdite');
    });
    window.__TAURI__ = { core: { invoke: invoke as unknown as <T>(command: string, args?: Record<string, unknown>) => Promise<T> } };
    const fetch = vi.fn(async () => { throw new Error('pas de serveur'); });
    vi.stubGlobal('fetch', fetch);
    render(<AuthGate/>);
    expect(await screen.findByText('Coffre SQLite sécurisé')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Phrase secrète locale'), {
      target: { value: 'Une phrase secrete longue' },
    });
    fireEvent.change(screen.getByLabelText('Confirmer la phrase secrète'), {
      target: { value: 'Une phrase secrete longue' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Initialiser le coffre' }));
    expect(await screen.findByText('Coffre SQLite déverrouillé')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Caisse locale' })).toBeTruthy();
    expect(screen.getByText(/Synchronisation non activée/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('native_unlock', {
      passphrase: 'Une phrase secrete longue',
    }));
    expect(screen.getByRole('button', { name: 'Importer depuis la version web' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Importer depuis la version web' }));
    expect(screen.getByLabelText('Fichier de transfert chiffré')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Verrouiller le coffre' }));
    expect(await screen.findByRole('button', { name: 'Déverrouiller' })).toBeTruthy();
  });
});
