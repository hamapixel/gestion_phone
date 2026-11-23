import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

describe('PhoneStock Pro - phase 01', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ status: 'ok' }),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('affiche le tableau de bord', () => {
    render(<App/>);
    expect(screen.getByText('Bienvenue dans PhoneStock Pro')).toBeTruthy();
    expect(screen.getByText('Prochaines fonctionnalités')).toBeTruthy();
  });

  it('affiche les modules non disponibles sans fausse vente', () => {
    render(<App/>);
    fireEvent.click(screen.getAllByRole('button', { name: 'Caisse' })[0]);
    expect(screen.getByText('MODULE EN PRÉPARATION')).toBeTruthy();
  });

  it('n’affiche aucun module de gestion des utilisateurs', () => {
    render(<App/>);
    expect(screen.queryByRole('button', { name: 'Utilisateurs' })).toBeNull();
  });

  it('permet de changer le thème et mémorise le choix', () => {
    render(<App/>);
    fireEvent.click(screen.getByRole('button', { name: 'Changer le thème' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('phonestock-theme')).toBe('dark');
  });
});
