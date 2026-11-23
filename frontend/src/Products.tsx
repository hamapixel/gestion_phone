import { FormEvent, useEffect, useState } from 'react';
import { Barcode, Boxes, Eye, Pencil, Plus, Search, Smartphone, X } from 'lucide-react';

type Category = 'phone' | 'case' | 'other';
type Product = {
  id: string; name: string; category: Category; sku: string; brand: string; model: string; condition: 'new' | 'used';
  purchase_price: string; sale_price: string; quantity: number;
  low_stock_threshold: number; low_stock: boolean;
};
type Dialog =
  | { type: 'new'; kind: 'phone' | 'other' }
  | { type: 'imeis'; product: Product }
  | { type: 'stock'; product: Product }
  | { type: 'edit'; product: Product }
  | { type: 'details'; product: Product };
type NewForm = {
  name: string; brand: string; model: string; condition: 'new' | 'used'; purchase_price: string; sale_price: string; quantity: string; imeis: string;
};
type ProductDetail = {
  product: Product;
  phones: { id: string; sold: boolean; imeis: { slot: number; imei: string }[] }[];
  movements: { delta: number; reason: string; note: string; created_at: string }[];
  changes: { changes: Record<string, { avant: string; apres: string }>; created_at: string }[];
  phones_truncated: boolean;
};
const propertyLabels: Record<string,string> = {
  name: 'Nom', brand: 'Marque', model: 'Modèle', condition: 'État',
  purchase_price: 'Prix d’achat', sale_price: 'Prix de vente', low_stock_threshold: 'Seuil d’alerte'
};
function isPhoneForm(dialog: Dialog): boolean {
  return dialog.type === 'new' ? dialog.kind === 'phone' : dialog.type === 'edit' && dialog.product.category === 'phone';
}
const fresh: NewForm = {
  name: '', brand: '', model: '', condition: 'new', purchase_price: '', sale_price: '', quantity: '0', imeis: '',
};
const xof = (value: string | number) => new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 2,
}).format(Number(value)) + ' FCFA';

function csrfCookie() {
  const token = document.cookie.split('; ').find((part) => part.startsWith('csrftoken='));
  return token ? decodeURIComponent(token.substring('csrftoken='.length)) : '';
}

function imeiLastDigit(first14: string): string {
  let total = 0;
  for (let index = 0; index < first14.length; index += 1) {
    let digit = Number(first14[index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    total += digit;
  }
  return String((10 - total % 10) % 10);
}

function imeiHint(text: string): { suggested?: string; message: string } | null {
  const raw = text.trim();
  if (!raw || raw.includes('\n') || raw.includes(',') || raw.includes(';')) return null;
  const digits = raw.replace(/[\s-]+/g, '');
  if (!/^\d+$/.test(digits)) return { message: "L'IMEI ne doit contenir que des chiffres." };
  if (digits.length === 14) {
    const suggested = digits + imeiLastDigit(digits);
    return { suggested, message: "14 chiffres saisis : le 15e chiffre calculé est " + suggested[14] + ". Vérifie avec *#06# avant de l'utiliser." };
  }
  if (digits.length !== 15) return { message: digits.length + "/15 chiffres. Affiche l'IMEI complet avec *#06#." };
  if (imeiLastDigit(digits.slice(0, 14)) !== digits[14]) return { message: "L'IMEI a 15 chiffres mais le dernier semble incorrect. Vérifie avec *#06#." };
  return { message: "IMEI complet : 15 chiffres, contrôle valide." };
}

function phonesFromText(text: string) {
  return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((line) => {
    const values = line.split(/[,;]+/).map((n) => n.replace(/[\s-]+/g, '')).filter(Boolean);
    if (values.length > 2) throw new Error('Un téléphone par ligne : IMEI 1 et IMEI 2 facultatif.');
    if (values.some((n) => !/^\d{15}$/.test(n))) throw new Error("IMEI incomplet : saisis les 15 chiffres du téléphone (compose *#06#).");
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
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
    setForm({ ...fresh, name: kind === 'phone' ? 'Téléphone' : '' }); setError(''); setDialog({ type: 'new', kind });
  }
  function openEdit(product: Product) {
    setError('');
    setDetail(null);
    setForm({
      name: product.name, brand: product.brand, model: product.model,
      condition: product.condition, purchase_price: product.purchase_price,
      sale_price: product.sale_price, quantity: String(product.quantity), imeis: '',
    });
    setDialog({ type: 'edit', product });
  }
  async function openDetails(product: Product) {
    setDialog({ type: 'details', product }); setError(''); setDetail(null);
    setDetailLoading(true);
    try {
      const response = await fetch('/api/products/' + product.id + '/', { credentials: 'same-origin' });
      const result = await parseResponse(response) as ProductDetail;
      setDetail(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Détails indisponibles.');
    } finally {
      setDetailLoading(false);
    }
  }
  function openAction(type: 'stock' | 'imeis', product: Product) {
    setDelta(''); setReason(''); setImeis(''); setError('');
    setDialog({ type, product });
  }
  async function apiPost(url: string, body: object, method: 'POST' | 'PATCH' = 'POST') {
    return parseResponse(await fetch(url, {
      method, credentials: 'same-origin',
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
          brand: dialog.kind === 'phone' ? form.brand : '',
          model: dialog.kind === 'phone' ? form.model : '',
          condition: dialog.kind === 'phone' ? form.condition : 'new',
          category: dialog.kind,
          purchase_price: form.purchase_price,
          sale_price: form.sale_price,
          quantity: dialog.kind === 'phone' ? 0 : Number(form.quantity),
          low_stock_threshold: 3,
          phones: dialog.kind === 'phone' ? phonesFromText(form.imeis) : [],
        });
      } else if (dialog.type === 'edit') {
        await apiPost('/api/products/' + dialog.product.id + '/', {
          name: form.name, brand: isPhoneForm(dialog) ? form.brand : '',
          model: isPhoneForm(dialog) ? form.model : '',
          condition: isPhoneForm(dialog) ? form.condition : 'new',
          purchase_price: form.purchase_price, sale_price: form.sale_price,
        }, 'PATCH');
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
                <td><span className="catalog-itemname">{item.name}</span>{item.model ? <span className="catalog-ref">{[item.brand, item.model, item.condition === 'used' ? 'Occasion' : 'Neuf'].filter(Boolean).join(' · ')}</span> : null}</td>
                <td className="catalog-number">{xof(item.purchase_price)}</td>
                <td className="catalog-number">{xof(item.sale_price)}</td>
                <td><span className={'catalog-stock ' + (item.low_stock ? 'low' : '')}>{item.quantity} unité(s)</span></td>
                <td><div className="catalog-row-actions">
                  <button className="catalog-action" onClick={() => void openDetails(item)}><Eye size={14}/> Détails</button>
                  <button className="catalog-action" onClick={() => openEdit(item)}><Pencil size={14}/> Modifier</button>
                  <button className="catalog-action" onClick={() => openAction(item.category === 'phone' ? 'imeis' : 'stock', item)}>
                    {item.category === 'phone' ? 'Ajouter IMEI' : 'Corriger stock'}
                  </button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
      {dialog && (
        <div className="catalog-backdrop" role="presentation">
          <section className="catalog-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-title">
            <div className="catalog-modal-header">
              <div><h3 id="catalog-title">{dialog.type === 'new' ? (dialog.kind === 'phone' ? 'Ajouter un téléphone' : 'Ajouter un article') : dialog.type === 'edit' ? 'Modifier le produit' : dialog.type === 'details' ? 'Détails du produit' : dialog.type === 'imeis' ? 'Ajouter des téléphones' : 'Corriger le stock'}</h3>
                <p>{dialog.type === 'new' ? (dialog.kind === 'phone' ? 'Nom, marque, modèle et état, sans référence ni catégorie.' : 'Pochette, chargeur ou autre article : saisie rapide.') : dialog.type === 'edit' ? 'Modifier les informations sans toucher au stock ni aux IMEI.' : dialog.product.name}</p>
              </div>
              <button className="catalog-close" aria-label="Fermer" onClick={() => setDialog(null)}><X size={19}/></button>
            </div>
            {dialog.type === 'details' ? (
              <div className="catalog-details">
                {detailLoading && <p>Chargement des informations…</p>}
                {error && <p className="catalog-error" role="alert">{error}</p>}
                {detail && (
                  <>
                    <div className="catalog-detail-list">
                      <div><span>Produit</span><strong>{detail.product.name}</strong></div>
                      {detail.product.category === 'phone' && (
                        <>
                          <div><span>Marque</span><strong>{detail.product.brand}</strong></div>
                          <div><span>Modèle</span><strong>{detail.product.model}</strong></div>
                          <div><span>État</span><strong>{detail.product.condition === 'used' ? 'Occasion' : 'Neuf'}</strong></div>
                        </>
                      )}
                      <div><span>Prix d'achat</span><strong>{xof(detail.product.purchase_price)}</strong></div>
                      <div><span>Prix de vente</span><strong>{xof(detail.product.sale_price)}</strong></div>
                      <div><span>Stock disponible</span><strong>{detail.product.quantity} unité(s)</strong></div>
                    </div>
                    {detail.product.category === 'phone' && (
                      <section className="catalog-detail-section">
                        <h4>Téléphones enregistrés et IMEI</h4>
                        {detail.phones.length ? detail.phones.map((phone) => (
                          <div className="catalog-imei-row" key={phone.id}>
                            <span>{phone.sold ? 'Vendu' : 'En stock'}</span>
                            <strong>{phone.imeis.map((item) => 'IMEI ' + item.slot + ' : ' + item.imei).join(' · ')}</strong>
                          </div>
                        )) : <p>Aucun téléphone identifié pour ce modèle.</p>}
                        {detail.phones_truncated && <p>Seuls les 200 téléphones les plus récents sont affichés.</p>}
                      </section>
                    )}
                    <section className="catalog-detail-section">
                      <h4>Historique du stock</h4>
                      {detail.movements.length ? detail.movements.map((movement, index) => (
                        <div className="catalog-history-row" key={index}>
                          <span>{new Date(movement.created_at).toLocaleDateString('fr-FR')} · {movement.reason}</span>
                          <strong>{movement.delta > 0 ? '+' : ''}{movement.delta}</strong>
                          {movement.note && <small>{movement.note}</small>}
                        </div>
                      )) : <p>Aucun mouvement enregistré.</p>}
                    </section>
                    <section className="catalog-detail-section">
                      <h4>Modifications du produit</h4>
                      {detail.changes.length ? detail.changes.map((event, index) => (
                        <div className="catalog-history-row" key={index}>
                          <span>{new Date(event.created_at).toLocaleString('fr-FR')}</span>
                          {Object.entries(event.changes).map(([field, diff]) => (
                            <small key={field}>{propertyLabels[field] || field} : {diff.avant} → {diff.apres}</small>
                          ))}
                        </div>
                      )) : <p>Pas encore de modifications enregistrées.</p>}
                    </section>
                    <div className="catalog-form-footer">
                      <button className="catalog-cancel" onClick={() => setDialog(null)}>Fermer</button>
                      <button className="catalog-primary" onClick={() => openEdit(detail.product)}><Pencil size={15}/> Modifier</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
            <form className="catalog-form" onSubmit={submit}>
              {(dialog.type === 'new' || dialog.type === 'edit') ? (
                <>
                  <div className="catalog-field">
                    <label htmlFor="product-name">Nom du produit *</label>
                    <input id="product-name" autoFocus required maxLength={160} value={form.name}
                      onChange={(e) => update('name', e.target.value)}
                      placeholder={isPhoneForm(dialog) ? 'Ex. Téléphone' : 'Ex. Pochette Samsung A17'}/>
                  </div>
                  {isPhoneForm(dialog) && (
                    <>
                      <div className="catalog-fields">
                        <div className="catalog-field">
                          <label htmlFor="product-brand">Marque *</label>
                          <input id="product-brand" required maxLength={70} value={form.brand}
                            onChange={(e) => update('brand', e.target.value)} placeholder="Samsung"/>
                        </div>
                        <div className="catalog-field">
                          <label htmlFor="product-condition">État *</label>
                          <select id="product-condition" value={form.condition} onChange={(e) => update('condition', e.target.value)}>
                            <option value="new">Neuf</option><option value="used">Occasion</option>
                          </select>
                        </div>
                      </div>
                      <div className="catalog-field">
                        <label htmlFor="product-model">Modèle *</label>
                        <input id="product-model" required maxLength={70} value={form.model}
                          onChange={(e) => update('model', e.target.value)} placeholder="Galaxy A17 128 Go"/>
                        <small>Exemple : Nom « Téléphone » · Marque « Samsung » · Modèle « Galaxy A17 ».</small>
                      </div>
                    </>
                  )}
                  <div className="catalog-fields">
                    <div className="catalog-field"><label htmlFor="product-cost">Prix d'achat (FCFA)</label><input id="product-cost" type="number" min="0" step=".01" required value={form.purchase_price} onChange={(e) => update('purchase_price', e.target.value)}/></div>
                    <div className="catalog-field"><label htmlFor="product-price">Prix de vente (FCFA)</label><input id="product-price" type="number" min=".01" step=".01" required value={form.sale_price} onChange={(e) => update('sale_price', e.target.value)}/></div>
                  </div>
                  {isPhoneForm(dialog) && dialog.type === 'new' ? (
                    <div className="catalog-field">
                      <label htmlFor="product-imeis"><Barcode size={15} style={{ verticalAlign: 'middle' }}/> IMEI (facultatif maintenant)</label>
                      <textarea id="product-imeis" value={form.imeis} onChange={(e) => update('imeis', e.target.value)} placeholder="Un IMEI principal par ligne"/>
                      <small>L'IMEI complet apparaît avec *#06# sur le téléphone. Il est possible de créer le modèle sans IMEI, mais le stock restera à zéro jusqu'à son ajout.</small>
                      {imeiHint(form.imeis) && <div className="catalog-imei-guide">
                        <span>{imeiHint(form.imeis)?.message}</span>
                        {imeiHint(form.imeis)?.suggested && <button type="button" className="catalog-action" onClick={() => update('imeis', imeiHint(form.imeis)!.suggested!)}>Compléter les 15 chiffres</button>}
                      </div>}
                    </div>
                  ) : dialog.type === 'new' ? (
                    <div className="catalog-field"><label htmlFor="product-qty">Quantité initiale</label><input id="product-qty" type="number" min="0" max="1000000" step="1" value={form.quantity} onChange={(e) => update('quantity', e.target.value)}/></div>
                  ) : (
                    <p className="catalog-edit-note">Pour modifier le stock, utilise le bouton « Corriger stock » ou « Ajouter IMEI ».</p>
                  )}
                </>
              ) : dialog.type === 'imeis' ? (
                <div className="catalog-field">
                  <label htmlFor="batch-imeis">IMEI des téléphones *</label>
                  <textarea id="batch-imeis" autoFocus required value={imeis} onChange={(e) => setImeis(e.target.value)} placeholder="Un IMEI par ligne"/>
                  <small><Barcode size={13}/> Pour connaître l'IMEI complet, compose *#06#. Le second IMEI est facultatif et se sépare par une virgule.</small>
                  {imeiHint(imeis) && <div className="catalog-imei-guide">
                    <span>{imeiHint(imeis)?.message}</span>
                    {imeiHint(imeis)?.suggested && <button type="button" className="catalog-action" onClick={() => setImeis(imeiHint(imeis)!.suggested!)}>Compléter les 15 chiffres</button>}
                  </div>}
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
            )}
          </section>
        </div>
      )}
    </div>
  );
}
