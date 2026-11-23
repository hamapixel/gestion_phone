import { FormEvent, useEffect, useState } from 'react';
import { Barcode, Boxes, Plus, Search, X } from 'lucide-react';

type Category = 'phone' | 'case' | 'other';
type Product = {
  id: string; name: string; category: Category; sku: string; brand: string; model: string;
  purchase_price: string; sale_price: string; quantity: number;
  low_stock_threshold: number; low_stock: boolean;
};
type Dialog =
  | { type: 'new' }
  | { type: 'imeis'; product: Product }
  | { type: 'stock'; product: Product };
type NewForm = {
  name: string; category: Category; sku: string; brand: string; model: string;
  purchase_price: string; sale_price: string; quantity: string;
  low_stock_threshold: string; imeis: string;
};
const fresh: NewForm = {
  name: '', category: 'case', sku: '', brand: '', model: '',
  purchase_price: '', sale_price: '', quantity: '0',
  low_stock_threshold: '3', imeis: '',
};
const labels: Record<Category, string> = { phone: 'Téléphone', case: 'Pochette', other: 'Divers' };
const xof = (value: string | number) => new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 2,
}).format(Number(value)) + ' FCFA';

function csrfCookie() {
  const token = document.cookie.split('; ').find((part) => part.startsWith('csrftoken='));
  return token ? decodeURIComponent(token.substring('csrftoken='.length)) : '';
}

function phonesFromText(text: string) {
  return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((line) => {
    const values = line.split(/[\s,;]+/).filter(Boolean);
    if (values.length > 2) throw new Error('Un téléphone par ligne : IMEI 1 et IMEI 2 facultatif.');
    if (values.some((n) => !/^\d{15}$/.test(n))) throw new Error('Les IMEI doivent contenir exactement 15 chiffres.');
    return { imei: values[0], ...(values[1] ? { imei2: values[1] } : {}) };
  });
}

async function parseResponse(response: Response) {
  const json = await response.json() as { detail?: string };
  if (!response.ok) throw new Error(json.detail ?? 'Opération impossible.');
  return json;
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [form, setForm] = useState<NewForm>({ ...fresh });
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [imeis, setImeis] = useState('');

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    fetch('/api/products/?q=' + encodeURIComponent(query) + '&category=' + encodeURIComponent(category), {
      credentials: 'same-origin', signal: abort.signal,
    })
      .then((response) => parseResponse(response))
      .then((payload) => {
        if (!abort.signal.aborted) {
          setProducts((payload as { results: Product[] }).results);
          setError('');
        }
      })
      .catch((err: unknown) => {
        if (!abort.signal.aborted) setError(err instanceof Error ? err.message : 'Chargement impossible.');
      })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [query, category]);

  async function reload() {
    const response = await fetch('/api/products/?q=' + encodeURIComponent(query) + '&category=' + encodeURIComponent(category), { credentials: 'same-origin' });
    const payload = await parseResponse(response) as { results: Product[] };
    setProducts(payload.results);
  }

  function openNew() {
    setForm({ ...fresh }); setError(''); setDialog({ type: 'new' });
  }
  function openAction(type: 'stock' | 'imeis', product: Product) {
    setDelta(''); setReason(''); setImeis(''); setError('');
    setDialog({ type, product });
  }
  async function apiPost(url: string, body: object) {
    return parseResponse(await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfCookie() },
      body: JSON.stringify(body),
    }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || busy) return;
    setBusy(true); setError('');
    try {
      if (dialog.type === 'new') {
        await apiPost('/api/products/', {
          ...form,
          quantity: form.category === 'phone' ? 0 : Number(form.quantity),
          low_stock_threshold: Number(form.low_stock_threshold),
          phones: form.category === 'phone' ? phonesFromText(form.imeis) : [],
        });
      } else if (dialog.type === 'imeis') {
        const phones = phonesFromText(imeis);
        if (!phones.length) throw new Error('Scanne ou saisis au moins un IMEI.');
        await apiPost('/api/products/' + dialog.product.id + '/imeis/', { phones });
      } else {
        await apiPost('/api/products/' + dialog.product.id + '/stock/', { delta: Number(delta), reason });
      }
      await reload();
      setDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }
  const update = (key: keyof NewForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const lowCount = products.filter((item) => item.low_stock).length;

  return (
    <div className="catalog-page">
      <div className="catalog-toolbar">
        <div className="catalog-search">
          <Search size={18}/>
          <input aria-label="Rechercher un produit" placeholder="Nom, marque, référence ou IMEI…" value={query} onChange={(e) => setQuery(e.target.value)}/>
        </div>
        <select aria-label="Filtrer par catégorie" className="catalog-category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Toutes catégories</option>
          <option value="phone">Téléphones</option>
          <option value="case">Pochettes</option>
          <option value="other">Divers</option>
        </select>
        <button className="catalog-add" onClick={openNew}><Plus size={17}/> Ajouter un article</button>
      </div>
      <div className="catalog-summary">
        <span><Boxes size={15} style={{ verticalAlign: 'middle', marginRight: 7 }}/><strong>{products.length}</strong> produits affichés</span>
        <span><strong>{lowCount}</strong> à surveiller (stock faible)</span>
      </div>
      {!dialog && error && <p role="alert" className="catalog-error">{error}</p>}
      <section className="catalog-card">
        {loading ? <p className="catalog-empty">Chargement des produits…</p> : products.length === 0 ? (
          <div className="catalog-empty">
            <Boxes size={35} style={{ marginBottom: 12 }}/>
            <p>Aucun produit trouvé. Ajoute ton premier article pour commencer.</p>
          </div>
        ) : (
          <table className="catalog-table">
            <thead><tr><th>Produit</th><th>Catégorie</th><th>Prix d'achat</th><th>Prix de vente</th><th>Stock</th><th>Action</th></tr></thead>
            <tbody>{products.map((item) => (
              <tr key={item.id}>
                <td><span className="catalog-itemname">{item.name}</span><span className="catalog-ref">{item.sku || [item.brand, item.model].filter(Boolean).join(' ') || 'Sans référence'}</span></td>
                <td>{labels[item.category]}</td>
                <td className="catalog-number">{xof(item.purchase_price)}</td>
                <td className="catalog-number">{xof(item.sale_price)}</td>
                <td><span className={'catalog-stock ' + (item.low_stock ? 'low' : '')}>{item.quantity} unité(s)</span></td>
                <td><button className="catalog-action" onClick={() => openAction(item.category === 'phone' ? 'imeis' : 'stock', item)}>
                  {item.category === 'phone' ? 'Ajouter IMEI' : 'Corriger stock'}
                </button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
      {dialog && (
        <div className="catalog-backdrop" role="presentation">
          <section className="catalog-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-title">
            <div className="catalog-modal-header">
              <div><h3 id="catalog-title">{dialog.type === 'new' ? 'Ajouter un article' : dialog.type === 'imeis' ? 'Ajouter des téléphones' : 'Corriger le stock'}</h3>
                <p>{dialog.type === 'new' ? 'Quelques champs, puis ton produit est prêt.' : dialog.product.name}</p>
              </div>
              <button className="catalog-close" aria-label="Fermer" onClick={() => setDialog(null)}><X size={19}/></button>
            </div>
            <form className="catalog-form" onSubmit={submit}>
              {dialog.type === 'new' ? (
                <>
                  <div className="catalog-fields">
                    <div className="catalog-field">
                      <label htmlFor="product-category">Catégorie</label>
                      <select id="product-category" value={form.category} onChange={(e) => update('category', e.target.value)}>
                        <option value="case">Pochette</option><option value="phone">Téléphone</option><option value="other">Autre article</option>
                      </select>
                    </div>
                    <div className="catalog-field"><label htmlFor="product-name">Nom du produit *</label><input id="product-name" autoFocus required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Ex. Pochette Samsung A15"/></div>
                  </div>
                  <div className="catalog-fields">
                    <div className="catalog-field"><label htmlFor="product-sku">Référence (facultatif)</label><input id="product-sku" value={form.sku} onChange={(e) => update('sku', e.target.value)} placeholder="REF-001"/></div>
                    <div className="catalog-field"><label htmlFor="product-brand">Marque (facultatif)</label><input id="product-brand" value={form.brand} onChange={(e) => update('brand', e.target.value)} placeholder="Samsung"/></div>
                  </div>
                  {form.category === 'phone' && <div className="catalog-field"><label htmlFor="product-model">Modèle</label><input id="product-model" value={form.model} onChange={(e) => update('model', e.target.value)} placeholder="Galaxy A15, 128 Go"/></div>}
                  <div className="catalog-fields">
                    <div className="catalog-field"><label htmlFor="product-cost">Prix d'achat (FCFA)</label><input id="product-cost" type="number" min="0" step=".01" required value={form.purchase_price} onChange={(e) => update('purchase_price', e.target.value)}/></div>
                    <div className="catalog-field"><label htmlFor="product-price">Prix de vente (FCFA)</label><input id="product-price" type="number" min=".01" step=".01" required value={form.sale_price} onChange={(e) => update('sale_price', e.target.value)}/></div>
                  </div>
                  <div className="catalog-fields">
                    {form.category !== 'phone' ? <div className="catalog-field"><label htmlFor="product-qty">Quantité initiale</label><input id="product-qty" type="number" min="0" max="1000000" step="1" value={form.quantity} onChange={(e) => update('quantity', e.target.value)}/></div> : <div className="catalog-field"><label>Stock téléphones</label><small>Calculé à partir des IMEI uniques saisis ci-dessous.</small></div>}
                    <div className="catalog-field"><label htmlFor="product-threshold">Alerte stock à partir de</label><input id="product-threshold" type="number" min="0" max="1000" step="1" value={form.low_stock_threshold} onChange={(e) => update('low_stock_threshold', e.target.value)}/></div>
                  </div>
                  {form.category === 'phone' && <div className="catalog-field">
                    <label htmlFor="product-imeis"><Barcode size={15} style={{ verticalAlign: 'middle' }}/> IMEI (un téléphone par ligne)</label>
                    <textarea id="product-imeis" value={form.imeis} onChange={(e) => update('imeis', e.target.value)} placeholder="IMEI principal, IMEI secondaire facultatif"/>
                    <small>Scanner USB ou saisie manuelle. Une ligne par téléphone ; IMEI secondaire séparé par une virgule. Possibilité d'ajouter des IMEI plus tard.</small>
                  </div>}
                </>
              ) : dialog.type === 'imeis' ? (
                <div className="catalog-field">
                  <label htmlFor="batch-imeis">IMEI des téléphones *</label>
                  <textarea id="batch-imeis" autoFocus required value={imeis} onChange={(e) => setImeis(e.target.value)} placeholder="Un IMEI par ligne"/>
                  <small><Barcode size={13}/> Chaque téléphone doit avoir un IMEI valide et unique ; second IMEI facultatif séparé par virgule.</small>
                </div>
              ) : (
                <>
                  <div className="catalog-field">
                    <label htmlFor="stock-delta">Variation de quantité *</label>
                    <input id="stock-delta" type="number" required step="1" placeholder="Ex. -2 ou +5" value={delta} onChange={(e) => setDelta(e.target.value)}/>
                    <small>Pour un achat fournisseur, le module « Achats & fournisseurs » sera développé en Phase 04.</small>
                  </div>
                  <div className="catalog-field">
                    <label htmlFor="stock-reason">Motif de la correction *</label>
                    <input id="stock-reason" required maxLength={240} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. correction après inventaire"/>
                  </div>
                </>
              )}
              {error && <p role="alert" className="catalog-error">{error}</p>}
              <div className="catalog-form-footer">
                <button type="button" className="catalog-cancel" onClick={() => setDialog(null)}>Annuler</button>
                <button type="submit" className="catalog-primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
