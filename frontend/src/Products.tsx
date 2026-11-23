import { FormEvent, useEffect, useState } from 'react';
import { Barcode, Boxes, Plus, Search, Smartphone, X } from 'lucide-react';

type Category = 'phone' | 'case' | 'other';
type Product = {
  id: string; name: string; category: Category; sku: string; brand: string; model: string;
  purchase_price: string; sale_price: string; quantity: number;
  low_stock_threshold: number; low_stock: boolean;
};
type Dialog =
  | { type: 'new'; kind: 'phone' | 'other' }
  | { type: 'imeis'; product: Product }
  | { type: 'stock'; product: Product };
type NewForm = {
  name: string; model: string; purchase_price: string; sale_price: string; quantity: string; imeis: string;
};
const fresh: NewForm = {
  name: '', model: '', purchase_price: '', sale_price: '', quantity: '0', imeis: '',
};
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
    fetch('/api/products/?q=' + encodeURIComponent(query), {
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
  }, [query]);

  async function reload() {
    const response = await fetch('/api/products/?q=' + encodeURIComponent(query), { credentials: 'same-origin' });
    const payload = await parseResponse(response) as { results: Product[] };
    setProducts(payload.results);
  }

  function openNew(kind: 'phone' | 'other') {
    setForm({ ...fresh }); setError(''); setDialog({ type: 'new', kind });
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
          name: form.name,
          model: dialog.kind === 'phone' ? form.model : '',
          category: dialog.kind,
          purchase_price: form.purchase_price,
          sale_price: form.sale_price,
          quantity: dialog.kind === 'phone' ? 0 : Number(form.quantity),
          low_stock_threshold: 3,
          phones: dialog.kind === 'phone' ? phonesFromText(form.imeis) : [],
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
          <input aria-label="Rechercher un produit" placeholder="Nom, modèle ou IMEI…" value={query} onChange={(e) => setQuery(e.target.value)}/>
        </div>
        <button className="catalog-add" onClick={() => openNew('phone')}><Smartphone size={17}/> Ajouter un téléphone</button>
        <button className="catalog-action catalog-add-other" onClick={() => openNew('other')}><Plus size={17}/> Ajouter un article</button>
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
            <thead><tr><th>Produit</th><th>Prix d'achat</th><th>Prix de vente</th><th>Stock</th><th>Action</th></tr></thead>
            <tbody>{products.map((item) => (
              <tr key={item.id}>
                <td><span className="catalog-itemname">{item.name}</span>{item.model ? <span className="catalog-ref">Modèle : {item.model}</span> : null}</td>
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
              <div><h3 id="catalog-title">{dialog.type === 'new' ? (dialog.kind === 'phone' ? 'Ajouter un téléphone' : 'Ajouter un article') : dialog.type === 'imeis' ? 'Ajouter des téléphones' : 'Corriger le stock'}</h3>
                <p>{dialog.type === 'new' ? (dialog.kind === 'phone' ? 'Nom et modèle sont deux informations différentes.' : 'Pochette, chargeur ou autre article : saisie rapide.') : dialog.product.name}</p>
              </div>
              <button className="catalog-close" aria-label="Fermer" onClick={() => setDialog(null)}><X size={19}/></button>
            </div>
            <form className="catalog-form" onSubmit={submit}>
              {dialog.type === 'new' ? (
                <>
                  <div className="catalog-field">
                    <label htmlFor="product-name">Nom du produit *</label>
                    <input id="product-name" autoFocus required maxLength={160} value={form.name}
                      onChange={(e) => update('name', e.target.value)}
                      placeholder={dialog.kind === 'phone' ? 'Ex. Samsung' : 'Ex. Pochette Samsung A17'}/>
                  </div>
                  {dialog.kind === 'phone' && (
                    <div className="catalog-field">
                      <label htmlFor="product-model">Modèle *</label>
                      <input id="product-model" required maxLength={70} value={form.model}
                        onChange={(e) => update('model', e.target.value)} placeholder="Ex. Galaxy A17 128 Go"/>
                      <small>Nom du produit : Samsung · Modèle : Galaxy A17. Pas besoin de les répéter.</small>
                    </div>
                  )}
                  <div className="catalog-fields">
                    <div className="catalog-field"><label htmlFor="product-cost">Prix d'achat (FCFA)</label><input id="product-cost" type="number" min="0" step=".01" required value={form.purchase_price} onChange={(e) => update('purchase_price', e.target.value)}/></div>
                    <div className="catalog-field"><label htmlFor="product-price">Prix de vente (FCFA)</label><input id="product-price" type="number" min=".01" step=".01" required value={form.sale_price} onChange={(e) => update('sale_price', e.target.value)}/></div>
                  </div>
                  {dialog.kind === 'phone' ? (
                    <div className="catalog-field">
                      <label htmlFor="product-imeis"><Barcode size={15} style={{ verticalAlign: 'middle' }}/> IMEI (facultatif maintenant)</label>
                      <textarea id="product-imeis" value={form.imeis} onChange={(e) => update('imeis', e.target.value)} placeholder="Un IMEI principal par ligne"/>
                      <small>Scanner l'IMEI sur le téléphone ou son emballage. Il doit avoir 15 chiffres et une clé de contrôle valide. Tu peux créer le modèle puis ajouter l'IMEI ensuite.</small>
                    </div>
                  ) : (
                    <div className="catalog-field"><label htmlFor="product-qty">Quantité initiale</label><input id="product-qty" type="number" min="0" max="1000000" step="1" value={form.quantity} onChange={(e) => update('quantity', e.target.value)}/></div>
                  )}
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
