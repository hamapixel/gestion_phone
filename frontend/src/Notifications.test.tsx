import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Notifications from './Notifications';

describe('PhoneStock — notifications réelles', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/notifications/') return {
        ok: true, json: async () => ({
          results: [
            { id: 'stock-a', kind: 'stock', level: 'warning', title: 'Stock faible',
              description: 'Pochette : 2 unités', target: 'products' },
            { id: 'debt-a', kind: 'debt', level: 'warning', title: 'Créance en retard',
              description: 'Awa — 5 000 FCFA', target: 'debts' },
          ],
          count: 2, limit: 100, mode: 'consultation', generated_at: '2026-11-23T14:00:00Z',
        }),
      };
      throw new Error('Route inattendue : ' + url);
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it('affiche les alertes et permet la navigation sans notification fictive', async () => {
    const go = vi.fn();
    render(<Notifications onNavigate={go}/>);
    expect(await screen.findByText('Créance en retard')).toBeTruthy();
    expect(screen.getByText('Stock faible')).toBeTruthy();
    expect(document.querySelectorAll('.phase7-alert-card').length).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Voir la créance' }));
    expect(go).toHaveBeenCalledWith('debts');
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
