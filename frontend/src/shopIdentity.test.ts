import { afterEach, describe, expect, it } from 'vitest';
import { applyBrowserIdentity, normalizedIdentity, shopInitials } from './shopIdentity';

describe('Identité boutique dans le navigateur', () => {
  afterEach(() => {
    document.querySelector('link[rel="icon"]')?.remove();
  });

  it('reprend le nom et le logo sur l’onglet, avec retour au logo neutre', () => {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = '/icon.svg';
    document.head.appendChild(link);

    const brand = normalizedIdentity({
      name: ' YaraPhone ',
      logo_data: 'data:image/png;base64,iVBORw0KGgo=',
    });
    applyBrowserIdentity(brand);
    expect(document.title).toBe('YaraPhone · Gestion de boutique');
    expect(link.href).toContain('data:image/png;base64,');
    expect(shopInitials('YaraPhone')).toBe('YP');

    applyBrowserIdentity({ name: '', logo_data: 'data:image/svg+xml;base64,PHN2Zz4=' });
    expect(document.title).toBe('PhoneStock Pro · Gestion de boutique');
    expect(link.href).toContain('/icon.svg');
  });
});
