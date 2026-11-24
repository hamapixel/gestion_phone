/** The visible app identity is owned by the boutique, never a hard-coded demo name. */
export type ShopIdentity = { name: string; logo_data: string };
export const DEFAULT_SHOP: ShopIdentity = { name: 'PhoneStock Pro', logo_data: '' };

export function normalizedIdentity(input: Partial<ShopIdentity> | null | undefined): ShopIdentity {
  return {
    name: typeof input?.name === 'string' && input.name.trim()
      ? input.name.trim() : DEFAULT_SHOP.name,
    // Backend only accepts signed-looking raster data URLs. Never insert arbitrary HTML or SVG.
    logo_data: typeof input?.logo_data === 'string' &&
      /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(input.logo_data)
      ? input.logo_data : '',
  };
}

/** Update browser tab and favicon without disclosing branding via localStorage. */
export function applyBrowserIdentity(input: Partial<ShopIdentity> | null | undefined): void {
  if (typeof document === 'undefined') return;
  const shop = normalizedIdentity(input);
  document.title = shop.name + ' · Gestion de boutique';
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) link.href = shop.logo_data || '/icon.svg';
}

export function shopInitials(name: string): string {
  return (name.replace(/([a-zà-ÿ])([A-Z])/g, '$1 $2').split(/\s+/)
    .filter(Boolean).slice(0, 2).map((part) => part[0]).join('') || 'PS').toUpperCase();
}
