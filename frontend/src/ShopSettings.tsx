import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { ImagePlus, Save, Settings2, ShieldCheck, Trash2 } from 'lucide-react';

export type Shop = {
  id: string; name: string; phone: string; email: string;
  address: string; tax_id: string; footer: string; logo_data: string;
};
const empty: Shop = { id: '', name: '', phone: '', email: '', address: '', tax_id: '', footer: '', logo_data: '' };
const csrf = () => {
  const cookie = document.cookie.split('; ').find((part) => part.startsWith('csrftoken='));
  return cookie ? decodeURIComponent(cookie.substring('csrftoken='.length)) : '';
};
export default function ShopSettings({ onSaved }: { onSaved?: (shop: Shop) => void }) {
  const [form, setForm] = useState<Shop>({ ...empty });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/shop/', { credentials: 'same-origin', signal: controller.signal })
      .then(async (res) => {
        const result = await res.json() as { shop?: Shop; detail?: string };
        if (!res.ok || !result.shop) throw new Error(result.detail || 'Chargement impossible.');
        if (!controller.signal.aborted) setForm(result.shop);
      }).catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Erreur serveur.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  function edit(field: keyof Shop, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
    setSaved('');
  }

  function readLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choisis un logo PNG, JPEG ou WebP.');
      return;
    }
    if (file.size > 90000) {
      setError('Le logo doit peser au maximum 90 Ko. Compresse-le avant de l’ajouter.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') edit('logo_data', reader.result);
    };
    reader.onerror = () => setError('Impossible de lire le logo.');
    reader.readAsDataURL(file);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(''); setSaved('');
    try {
      const { id: _id, ...values } = form;
      void _id;
      const response = await fetch('/api/shop/', {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
        body: JSON.stringify(values),
      });
      const result = await response.json() as { shop?: Shop; detail?: string };
      if (!response.ok || !result.shop) throw new Error(result.detail || 'Enregistrement impossible.');
      setForm(result.shop);
      onSaved?.(result.shop);
      setSaved('Identité enregistrée ! Le nom et le logo s’affichent désormais dans le logiciel, ainsi que sur toutes les factures et tous les reçus.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }
  const field = (id: keyof Shop, label: string, placeholder: string, type = 'text') => (
    <div className="catalog-field">
      <label htmlFor={'shop-' + id}>{label}</label>
      <input id={'shop-' + id} type={type} maxLength={id === 'address' || id === 'footer' ? 240 : 160}
        value={form[id]} placeholder={placeholder} required={id === 'name'}
        onChange={(event) => edit(id, event.target.value)}/>
    </div>
  );

  return (
    <section className="shop-settings">
      <div className="shop-form-card">
        <div className="shop-heading"><Settings2 size={21}/>
          <div><h3>Identité de ma boutique</h3>
            <p>Le nom et le logo sont repris dans le logiciel, à la connexion et sur les documents.</p></div>
        </div>
        {loading ? <p className="catalog-empty">Chargement des paramètres…</p> : (
          <form className="catalog-form" onSubmit={save}>
            <div className="shop-identity-note">
              <strong>Une seule identité, partout.</strong>
              <span>Changez le nom ici, enregistrez : votre menu, votre tableau de bord et vos factures sont immédiatement personnalisés.</span>
            </div>
            {field('name', 'Nom de la boutique *', 'Ex. YaraPhone')}
            <div className="catalog-fields">
              {field('phone', 'Téléphone', '+223 …')}
              {field('email', 'Email', 'boutique@example.com', 'email')}
            </div>
            {field('address', 'Adresse', 'Bamako, Mali')}
            {field('tax_id', 'NIF / RCCM (facultatif)', 'Référence commerciale')}
            {field('footer', 'Message en bas de facture', 'Merci pour votre confiance !')}
            <div className="catalog-field">
              <label htmlFor="shop-logo">Logo de la boutique (facultatif)</label>
              <div className="shop-logo-controls">
                <label className="shop-file-label" htmlFor="shop-logo"><ImagePlus size={16}/> Choisir une image
                  <input id="shop-logo" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={readLogo}/>
                </label>
                {form.logo_data && <button type="button" className="catalog-cancel"
                  onClick={() => edit('logo_data', '')}><Trash2 size={14}/> Retirer</button>}
              </div>
              <small>PNG, JPEG ou WebP · maximum 90 Ko pour garder le logiciel rapide.</small>
            </div>
            {error && <p className="catalog-error" role="alert">{error}</p>}
            {saved && <p className="shop-saved" role="status">{saved}</p>}
            <button className="catalog-primary shop-save" type="submit" disabled={saving}>
              <Save size={17}/>{saving ? 'Enregistrement…' : 'Enregistrer l’identité de ma boutique'}
            </button>
          </form>
        )}
      </div>
      <aside className="shop-preview-card">
        <div className="shop-heading"><ShieldCheck size={19}/><div><h3>Aperçu de votre identité</h3><p>Le même nom et le même logo dans toute votre boutique.</p></div></div>
        <div className="shop-identity-preview">
          <span className="shop-preview-label">APERÇU DANS LE LOGICIEL</span>
          <div className="shop-mini-brand">
            <span className="shop-mini-mark">{form.logo_data ? <img src={form.logo_data} alt="" /> : '✦'}</span>
            <span><strong>{form.name || 'Votre boutique'}</strong><small>ESPACE BOUTIQUE</small></span>
          </div>
        </div>
        <div className="shop-letterhead-preview">
          {form.logo_data && <img src={form.logo_data} alt="Logo boutique"/>}
          <h3>{form.name || 'Nom de la boutique'}</h3>
          {form.address && <p>{form.address}</p>}
          {form.phone && <p>Tél. {form.phone}</p>}
          {form.email && <p>{form.email}</p>}
          {form.tax_id && <small>{form.tax_id}</small>}
          <div className="shop-preview-separator"/>
          <p>FACTURE DE VENTE</p>
          <small>{form.footer || 'Merci pour votre confiance.'}</small>
        </div>
      </aside>
    </section>
  );
}
