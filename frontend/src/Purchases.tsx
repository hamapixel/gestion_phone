import { FormEvent, useEffect, useState } from 'react';
import { Plus, Trash2, Truck, X } from 'lucide-react';

type Product = {
  id: string; name: string; brand: string; model: string;
  category: 'phone' | 'case' | 'other'; purchase_price: string; quantity: number;
};
type Supplier = { id: string; name: string; phone: string };
type Receipt = {
  id: string; client_ref: string; supplier: Supplier; total: string; created_at: string;
  lines: { product_id: string; product_name: string; quantity: number; unit_cost: string; total: string }[];
};
type PurchaseLine = { uid: string; product_id: string; quantity: string; unit_cost: string; imeis: string };
const formatXof = (v: string | number) => new Intl.NumberFormat('fr-FR').format(Number(v)) + ' FCFA';

function csrfCookie() {
  const token = document.cookie.split('; ').find((part) => part.startsWith('csrftoken='));
  return token ? decodeURIComponent(token.substring('csrftoken='.length)) : '';
}
function newId(): string {
  return crypto.randomUUID();
}
function parseImeis(text: string) {
  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const values = line.split(/[,;]+/).map((v) => v.trim().replace(/[\s-]/g, '')).filter(Boolean);
    if (!values.length || values.length > 2 || values.some((v) => !/^\d{15}$/.test(v)))
      throw new Error("Chaque téléphone doit avoir un IMEI complet de 15 chiffres (*#06#).");
    return { imei: values[0], ...(values[1] ? { imei2: values[1] } : {}) };
  });
}
async function readResponse(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail ?? "Opération impossible.");
  return result;
}

export default function Purchases() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [clientRef, setClientRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    const [p, s, r] = await Promise.all([
      fetch('/api/products/', { credentials: 'same-origin' }),
      fetch('/api/suppliers/', { credentials: 'same-origin' }),
      fetch('/api/purchases/', { credentials: 'same-origin' }),
    ]);
    const [pd, sd, rd] = await Promise.all([readResponse(p), readResponse(s), readResponse(r)]);
    setProducts((pd as { results: Product[] }).results);
    setSuppliers((sd as { results: Supplier[] }).results);
    setReceipts((rd as { results: Receipt[] }).results);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetch('/api/products/', { credentials: 'same-origin' }),
      fetch('/api/suppliers/', { credentials: 'same-origin' }),
      fetch('/api/purchases/', { credentials: 'same-origin' }),
    ]).then(async ([p, s, r]) => {
      const [pd, sd, rd] = await Promise.all([readResponse(p), readResponse(s), readResponse(r)]);
      if (active) {
        setProducts((pd as { results: Product[] }).results);
        setSuppliers((sd as { results: Supplier[] }).results);
        setReceipts((rd as { results: Receipt[] }).results);
      }
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Chargement impossible.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function start() {
    setSupplierName(''); setSupplierPhone(''); setError(''); setSuccess('');
    setLines([{ uid: newId(), product_id: '', quantity: '1', unit_cost: '', imeis: '' }]);
    setClientRef(newId()); setOpen(true);
  }
  function updateLine(uid: string, changes: Partial<PurchaseLine>) {
    setLines((prev) => prev.map((line) => line.uid === uid ? { ...line, ...changes } : line));
  }
  function chooseProduct(line: PurchaseLine, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateLine(line.uid, { product_id: productId, unit_cost: product?.purchase_price ?? '', imeis: '' });
  }
  function addLine() {
    setLines((prev) => [...prev, { uid: newId(), product_id: '', quantity: '1', unit_cost: '', imeis: '' }]);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(''); setBusy(true);
    try {
      const selection = lines.map((line) => {
        const product = products.find((p) => p.id === line.product_id);
        if (!product) throw new Error('Sélectionne un produit sur chaque ligne.');
        const quantity = Number(line.quantity);
        if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Quantité invalide.');
        const phones = product.category === 'phone' ? parseImeis(line.imeis) : [];
        if (product.category === 'phone' && phones.length !== quantity) {
          throw new Error('Il faut un IMEI par téléphone réceptionné.');
        }
        return { product_id: line.product_id, quantity, unit_cost: line.unit_cost, phones };
      });
      const response = await fetch('/api/purchases/', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfCookie() },
        body: JSON.stringify({
          client_ref: clientRef,
          supplier: { name: supplierName.trim(), phone: supplierPhone.trim() },
          lines: selection,
        }),
      });
      const result = await readResponse(response) as { receipt: Receipt; replayed: boolean };
      await load();
      setOpen(false); setSuccess(
        'Réception ' + (result.replayed ? 'retrouvée' : 'validée') +
        ' : stock mis à jour, total ' + formatXof(result.receipt.total) + '.'
      );
    } catch (err) {
      // Keep the same clientRef on errors; retries cannot double-add stock.
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }
  const costTotal = lines.reduce((sum, line) => sum + Math.max(0, Number(line.unit_cost) || 0) * Math.max(0, Number(line.quantity) || 0), 0);

  return (
    <div className="purchase-page">
      <div className="catalog-toolbar">
        <div className="purchase-intro"><strong>Réapprovisionnements</strong><span>Un fournisseur, plusieurs articles, mise à jour automatique du stock.</span></div>
        <button className="catalog-add" disabled={!products.length} onClick={start}><Plus size={16}/> Nouvel achat</button>
      </div>
      {error && !open && <p className="catalog-error" role="alert">{error}</p>}
      {success && <p className="purchase-success" role="status">{success}</p>}
      {loading ? <p className="catalog-empty">Chargement des achats…</p> : (
        <>
          {!products.length && <p className="catalog-empty">Ajoute d'abord un produit dans « Produits & stock ».</p>}
          <section className="catalog-card">
            {receipts.length ? (
              <table className="catalog-table">
                <thead><tr><th>Date</th><th>Fournisseur</th><th>Articles</th><th>Montant d'achat</th></tr></thead>
                <tbody>{receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td>{new Date(receipt.created_at).toLocaleString('fr-FR')}</td>
                    <td>{receipt.supplier.name}</td>
                    <td>{receipt.lines.map((line) => line.product_name + ' × ' + line.quantity).join(', ')}</td>
                    <td className="catalog-number">{formatXof(receipt.total)}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="catalog-empty">Aucun achat fournisseur enregistré pour le moment.</p>}
          </section>
        </>
      )}
      {open && (
        <div className="catalog-backdrop">
          <section className="catalog-modal purchase-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-title">
            <div className="catalog-modal-header">
              <div><h3 id="purchase-title">Nouvel achat fournisseur</h3><p>Une réception validée augmente le stock.</p></div>
              <button className="catalog-close" aria-label="Fermer" onClick={() => setOpen(false)}><X size={19}/></button>
            </div>
            <form className="catalog-form" onSubmit={submit}>
              <div className="catalog-fields">
                <div className="catalog-field">
                  <label htmlFor="supplier-name">Fournisseur *</label>
                  <input id="supplier-name" list="known-suppliers" value={supplierName}
                    onChange={(event) => setSupplierName(event.target.value)} placeholder="Nom du fournisseur" required maxLength={160}/>
                  <datalist id="known-suppliers">{suppliers.map((s) => <option key={s.id} value={s.name}/>)}</datalist>
                </div>
                <div className="catalog-field">
                  <label htmlFor="supplier-phone">Téléphone (facultatif)</label>
                  <input id="supplier-phone" value={supplierPhone} maxLength={30}
                    onChange={(event) => setSupplierPhone(event.target.value)} placeholder="Numéro du fournisseur"/>
                </div>
              </div>
              {lines.map((line, index) => {
                const selected = products.find((p) => p.id === line.product_id);
                return (
                  <div className="purchase-line" key={line.uid}>
                    <div className="purchase-line-top"><strong>Article {index + 1}</strong>
                      {lines.length > 1 && <button type="button" className="catalog-action" aria-label={'Retirer article ' + (index + 1)}
                        onClick={() => setLines((prev) => prev.filter((l) => l.uid !== line.uid))}><Trash2 size={15}/></button>}
                    </div>
                    <div className="catalog-field">
                      <label htmlFor={'p-product-' + line.uid}>Produit *</label>
                      <select id={'p-product-' + line.uid} required value={line.product_id}
                        onChange={(event) => chooseProduct(line, event.target.value)}>
                        <option value="">Choisir un produit</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name} {p.brand} {p.model} (stock : {p.quantity})</option>
                        ))}
                      </select>
                    </div>
                    <div className="catalog-fields">
                      <div className="catalog-field"><label htmlFor={'p-qty-' + line.uid}>Quantité *</label>
                        <input id={'p-qty-' + line.uid} type="number" min="1" step="1" required value={line.quantity}
                          onChange={(event) => updateLine(line.uid, { quantity: event.target.value })}/>
                      </div>
                      <div className="catalog-field"><label htmlFor={'p-cost-' + line.uid}>Prix d'achat unitaire *</label>
                        <input id={'p-cost-' + line.uid} type="number" min="0" step=".01" required value={line.unit_cost}
                          onChange={(event) => updateLine(line.uid, { unit_cost: event.target.value })}/>
                      </div>
                    </div>
                    {selected?.category === 'phone' && (
                      <div className="catalog-field">
                        <label htmlFor={'p-imeis-' + line.uid}>IMEI des téléphones *</label>
                        <textarea id={'p-imeis-' + line.uid} required value={line.imeis}
                          onChange={(event) => updateLine(line.uid, { imeis: event.target.value })}
                          placeholder="Un téléphone par ligne : IMEI principal, second facultatif"/>
                        <small>Chaque téléphone doit avoir son IMEI réel (15 chiffres, *#06#). Le nombre de lignes doit égaler la quantité.</small>
                      </div>
                    )}
                  </div>
                );
              })}
              <button type="button" className="purchase-add-line" onClick={addLine}><Plus size={16}/> Ajouter une ligne</button>
              <div className="purchase-total"><span>Total de l'achat</span><strong>{formatXof(costTotal)}</strong></div>
              <p className="purchase-note"><Truck size={16}/> Le stock augmente une seule fois à la validation ; les anciens mouvements sont conservés.</p>
              {error && <p className="catalog-error" role="alert">{error}</p>}
              <div className="catalog-form-footer">
                <button type="button" className="catalog-cancel" onClick={() => setOpen(false)}>Annuler</button>
                <button type="submit" className="catalog-primary" disabled={busy}>{busy ? 'Validation…' : 'Valider la réception'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
