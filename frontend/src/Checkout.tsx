import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Barcode, Minus, Plus, ReceiptText, Search, ShoppingBasket, Smartphone, Trash2, X } from 'lucide-react';
import InvoiceModal from './InvoiceModal';

type Product = {
  id: string; name: string; brand: string; model: string;
  category: 'phone' | 'case' | 'other'; condition: 'new' | 'used';
  quantity: number; sale_price: string; purchase_price: string;
};
type CartLine = {
  key: string; product: Product; quantity: number; unit_price: string; imei: string;
};
type Sale = {
  id: string; reference: string; client_ref: string; created_at: string;
  status: 'paid' | 'credit'; method: string;
  customer_name: string; customer_phone: string; due_date: string | null;
  total: string; amount_paid: string; balance: string; gross_profit: string;
  lines: { product_id: string; product_name: string; imei: string; quantity: number; unit_price: string }[];
};
type SaleList = {
  results: Sale[];
  today: { total: string; cash_collected: string; balance: string; gross_profit: string };
};
type PhoneDetail = {
  phones: { id: string; sold: boolean; imeis: { slot: number; imei: string }[] }[];
};
type PayMode = 'all' | 'half' | 'custom';
const money = (value: number | string) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(value)) + ' FCFA';
const unique = () => crypto.randomUUID();
const token = () => {
  const part = document.cookie.split('; ').find((item) => item.startsWith('csrftoken='));
  return part ? decodeURIComponent(part.substring('csrftoken='.length)) : '';
};
const toMoney = (n: number) => n.toFixed(2);
const productLabel = (p: Product) => {
  const parts = [p.name];
  const lower = p.name.toLocaleLowerCase('fr');
  if (p.brand && !lower.includes(p.brand.toLocaleLowerCase('fr'))) parts.push(p.brand);
  if (p.model && !lower.includes(p.model.toLocaleLowerCase('fr'))) parts.push(p.model);
  return parts.join(' · ');
};
async function readJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail ?? 'Opération impossible.');
  return data;
}

export default function Checkout() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [phoneProduct, setPhoneProduct] = useState<Product | null>(null);
  const [phoneChoices, setPhoneChoices] = useState<string[]>([]);
  const [phoneImei, setPhoneImei] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [payMode, setPayMode] = useState<PayMode>('all');
  const [customPaid, setCustomPaid] = useState('');
  const [method, setMethod] = useState('cash');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [salesData, setSalesData] = useState<SaleList | null>(null);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [invoiceSaleId, setInvoiceSaleId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const requestRef = useRef(unique());

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    fetch('/api/products/?q=' + encodeURIComponent(query), {
      credentials: 'same-origin', signal: controller.signal,
    }).then(readJson).then((data: { results: Product[] }) => {
      if (!controller.signal.aborted) setProducts(data.results);
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Catalogue indisponible.');
    }).finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [query]);

  async function refreshSales() {
    const response = await fetch('/api/sales/', { credentials: 'same-origin' });
    setSalesData(await readJson(response) as SaleList);
  }
  useEffect(() => {
    let mounted = true;
    fetch('/api/sales/', { credentials: 'same-origin' })
      .then(readJson)
      .then((data: SaleList) => { if (mounted) setSalesData(data); })
      .catch((err: unknown) => { if (mounted) setError(err instanceof Error ? err.message : 'Ventes indisponibles.'); });
    return () => { mounted = false; };
  }, []);

  const total = useMemo(() => cart.reduce((sum, line) => sum + Number(line.unit_price) * line.quantity, 0), [cart]);
  const requestedPaid = payMode === 'all' ? total : payMode === 'half' ? Math.round(total / 2) : Number(customPaid || 0);
  const paid = Number.isFinite(requestedPaid) ? requestedPaid : 0;
  const balance = Math.max(0, total - paid);
  const freeze = busy || uncertain;

  function addAccessory(product: Product) {
    if (freeze || product.quantity === 0) return;
    setError('');
    setCart((current) => {
      const old = current.find((line) => line.product.id === product.id && !line.imei);
      if (old) {
        if (old.quantity >= product.quantity) return current;
        return current.map((line) => line.key === old.key ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, { key: unique(), product, quantity: 1, unit_price: product.sale_price, imei: '' }];
    });
  }
  async function choosePhone(product: Product) {
    if (freeze || product.quantity === 0) return;
    setPhoneProduct(product); setPhoneError(''); setPhoneImei(''); setPhoneChoices([]); setPhoneLoading(true);
    try {
      const response = await fetch('/api/products/' + product.id + '/', { credentials: 'same-origin' });
      const data = await readJson(response) as PhoneDetail;
      const choices = data.phones.filter((unit) => !unit.sold).flatMap((unit) =>
        unit.imeis.filter((item) => item.slot === 1).map((item) => item.imei)
      );
      setPhoneChoices(choices);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'IMEI indisponibles.');
    } finally {
      setPhoneLoading(false);
    }
  }
  function addPhoneToCart() {
    if (!phoneProduct || freeze) return;
    const imei = phoneImei.trim().replace(/[\s-]+/g, '');
    if (!/^\d{15}$/.test(imei)) {
      setPhoneError("Saisis les 15 chiffres de l'IMEI de la boîte (ou *#06#).");
      return;
    }
    if (cart.some((line) => line.imei === imei)) {
      setPhoneError('Ce téléphone est déjà dans le panier.');
      return;
    }
    setCart((prev) => [...prev, { key: unique(), product: phoneProduct, quantity: 1, unit_price: phoneProduct.sale_price, imei }]);
    setPhoneProduct(null); setPhoneImei(''); setPhoneError('');
  }
  function updateQty(key: string, change: number) {
    if (freeze) return;
    setCart((prev) => prev.map((line) => {
      if (line.key !== key || line.imei) return line;
      return { ...line, quantity: Math.max(1, Math.min(line.product.quantity, line.quantity + change)) };
    }));
  }
  function updatePrice(key: string, value: string) {
    if (freeze) return;
    setCart((prev) => prev.map((line) => line.key === key ? { ...line, unit_price: value } : line));
  }
  function removeLine(key: string) {
    if (!freeze) setCart((prev) => prev.filter((line) => line.key !== key));
  }
  function clearForNextSale() {
    setCart([]); setPayMode('all'); setCustomPaid('');
    setCustomerName(''); setCustomerPhone(''); setDueDate('');
    setMethod('cash'); setError(''); setUncertain(false); setLastSale(null);
    requestRef.current = unique();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || cart.length === 0) return;
    setError('');
    if (cart.some((line) => !Number.isFinite(Number(line.unit_price)) || Number(line.unit_price) <= 0 || Number(line.unit_price) > 9999999999.99)) {
      setError('Vérifie les prix de vente du panier.');
      return;
    }
    if (paid < 0 || paid > total) {
      setError('Le versement ne peut pas dépasser le total de la vente.');
      return;
    }
    if (balance > 0 && (!customerName.trim() || !customerPhone.trim())) {
      setError('Nom et téléphone obligatoires pour une vente à crédit.');
      return;
    }
    const payload = {
      client_ref: requestRef.current,
      lines: cart.map(({ product, quantity, unit_price, imei }) => ({
        product_id: product.id, quantity, unit_price, imei,
      })),
      amount_paid: toMoney(paid), method,
      customer_name: customerName.trim(), customer_phone: customerPhone.trim(),
      due_date: dueDate || null,
    };
    setBusy(true);
    let receivedResponse = false;
    try {
      const response = await fetch('/api/sales/', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': token() },
        body: JSON.stringify(payload),
      });
      receivedResponse = true;
      const data = await readJson(response) as { sale: Sale; replayed: boolean };
      setUncertain(false);
      setLastSale(data.sale);
      setCart([]); setPayMode('all'); setCustomPaid(''); setCustomerName('');
      setCustomerPhone(''); setDueDate('');
      requestRef.current = unique();
      try { await refreshSales(); } catch { /* Sale already confirmed; avoid retrying it. */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vente impossible.');
      if (!receivedResponse) {
        setUncertain(true);
        setError("Réponse serveur inconnue. Réessaie la même vente sans modifier le panier pour éviter un doublon.");
      } else {
        setUncertain(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pos-page">
      {lastSale && (
        <section className="pos-success" role="status">
          <BadgeCheck size={23}/>
          <div>
            <strong>Vente {lastSale.reference} enregistrée</strong>
            <p>Total {money(lastSale.total)} · Versé {money(lastSale.amount_paid)} · Reste {money(lastSale.balance)}</p>
            <small>Facture prête : impression A4, A5 ou ticket.</small>
          </div>
          <button type="button" className="pos-new-button" onClick={() => setInvoiceSaleId(lastSale.id)}>
            <ReceiptText size={16}/> Facture / reçu
          </button>
          <button type="button" className="pos-new-button" onClick={clearForNextSale}>Nouvelle vente</button>
        </section>
      )}
      <section className="pos-stats" aria-label="Totaux du jour">
        <div><span>Ventes du jour</span><strong>{money(salesData?.today.total ?? '0')}</strong></div>
        <div><span>Encaissé aujourd'hui</span><strong>{money(salesData?.today.cash_collected ?? '0')}</strong></div>
        <div><span>À recevoir sur ventes du jour</span><strong>{money(salesData?.today.balance ?? '0')}</strong></div>
        <div><span>Marge brute du jour</span><strong>{money(salesData?.today.gross_profit ?? '0')}</strong></div>
      </section>
      <div className="pos-layout">
        <section className="pos-products" aria-label="Choix des articles">
          <div className="pos-section-title"><h3>Articles disponibles</h3><span>Choisir rapidement et ajouter au panier</span></div>
          <div className="catalog-search pos-search">
            <Search size={18}/>
            <input aria-label="Rechercher pour la caisse" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un téléphone, une pochette, un IMEI…"/>
          </div>
          {catalogLoading ? <p className="catalog-empty">Chargement des articles…</p> :
            products.length === 0 ? <p className="catalog-empty">Aucun article disponible.</p> :
            <div className="pos-product-grid">
              {products.map((product) => (
                <article className="pos-product-card" key={product.id}>
                  <div className="pos-product-top">
                    <span className="pos-product-icon">{product.category === 'phone' ? <Smartphone size={20}/> : <ShoppingBasket size={20}/>}</span>
                    <span className={'pos-stock-pill ' + (product.quantity === 0 ? 'empty' : '')}>
                      {product.quantity} en stock
                    </span>
                  </div>
                  <strong>{productLabel(product)}</strong>
                  {product.category === 'phone' && <small>{product.condition === 'used' ? 'Occasion' : 'Neuf'} · IMEI obligatoire</small>}
                  <div className="pos-product-bottom">
                    <b>{money(product.sale_price)}</b>
                    <button disabled={freeze || product.quantity === 0}
                      aria-label={'Ajouter ' + productLabel(product)}
                      onClick={() => product.category === 'phone' ? void choosePhone(product) : addAccessory(product)}>
                      <Plus size={16}/> Ajouter
                    </button>
                  </div>
                </article>
              ))}
            </div>
          }
        </section>
        <section className="pos-cart" aria-label="Panier et encaissement">
          <div className="pos-cart-heading">
            <h3><ShoppingBasket size={20}/> Panier <span>{cart.reduce((n, line) => n + line.quantity, 0)} article(s)</span></h3>
            <span>{cart.length} ligne(s)</span>
          </div>
          {cart.length === 0 ? <p className="pos-empty-cart">Ton panier est vide. Choisis un produit pour commencer une vente.</p> :
            <div className="pos-cart-lines">
              {cart.map((line) => (
                <div className="pos-cart-line" key={line.key}>
                  <div className="pos-cart-line-title">
                    <div><strong>{productLabel(line.product)}</strong>
                      {line.imei && <small>IMEI : {line.imei}</small>}</div>
                    <button type="button" aria-label={'Retirer ' + productLabel(line.product)} disabled={freeze} onClick={() => removeLine(line.key)}><Trash2 size={17}/></button>
                  </div>
                  <div className="pos-cart-line-bottom">
                    {line.imei ? <span className="pos-qty-fixed">1 téléphone</span> :
                      <div className="pos-qty">
                        <button type="button" disabled={freeze || line.quantity <= 1} aria-label={'Diminuer ' + line.product.name} onClick={() => updateQty(line.key, -1)}><Minus size={16}/></button>
                        <span>{line.quantity}</span>
                        <button type="button" disabled={freeze || line.quantity >= line.product.quantity} aria-label={'Augmenter ' + line.product.name} onClick={() => updateQty(line.key, 1)}><Plus size={16}/></button>
                      </div>}
                    <label className="pos-price">Prix unitaire
                      <input aria-label={'Prix unitaire ' + line.product.name + (line.imei ? ' ' + line.imei : '')}
                        type="number" min="1" max="9999999999" step=".01" value={line.unit_price}
                        disabled={freeze} onChange={(event) => updatePrice(line.key, event.target.value)}/>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          }
          <form className="pos-pay-form" onSubmit={submit}>
            <div className="pos-total"><span>Total à payer</span><strong>{money(total)}</strong></div>
            <div className="pos-pay-modes" aria-label="Choix du versement">
              {([['all', 'Tout'], ['half', 'Moitié'], ['custom', 'Autre montant']] as const).map(([id, label]) => (
                <button type="button" key={id} className={payMode === id ? 'selected' : ''}
                  disabled={freeze} onClick={() => setPayMode(id)}>{label}</button>
              ))}
            </div>
            <div className="pos-payment-fields">
              <label>Montant versé (FCFA)
                <input type="number" min="0" step=".01" aria-label="Montant versé"
                  disabled={freeze || payMode !== 'custom'} required
                  value={payMode === 'custom' ? customPaid : toMoney(paid)}
                  onChange={(event) => setCustomPaid(event.target.value)}/>
              </label>
              <label>Moyen de paiement
                <select value={method} disabled={freeze} onChange={(event) => setMethod(event.target.value)}>
                  <option value="cash">Espèces</option>
                  <option value="orange">Orange Money</option>
                  <option value="moov">Moov Money</option>
                  <option value="transfer">Virement</option>
                </select>
              </label>
            </div>
            <div className="pos-balance"><span>Reste à payer</span><strong>{money(balance)}</strong></div>
            {balance > 0 && cart.length > 0 && (
              <div className="pos-credit-fields">
                <strong>Vente à crédit — informations client</strong>
                <label>Nom du client *
                  <input value={customerName} maxLength={160} required disabled={freeze}
                    onChange={(event) => setCustomerName(event.target.value)} placeholder="Nom complet"/>
                </label>
                <label>Téléphone du client *
                  <input value={customerPhone} maxLength={30} required disabled={freeze}
                    onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Numéro du client"/>
                </label>
                <label>Échéance (facultatif)
                  <input type="date" disabled={freeze} value={dueDate} onChange={(event) => setDueDate(event.target.value)}/>
                </label>
                <small>Le suivi des versements et les relances WhatsApp seront ajoutés en Phase 07.</small>
              </div>
            )}
            {error && <p className="pos-error" role="alert">{error}</p>}
            <button className="pos-submit" type="submit" disabled={busy || cart.length === 0 || !Number.isFinite(total)}>
              {busy ? 'Enregistrement…' : uncertain ? 'Réessayer la même vente' : 'Valider la vente'}
            </button>
          </form>
        </section>
      </div>
      <section className="pos-recent">
        <h3>Dernières ventes</h3>
        {!salesData?.results.length ? <p>Aucune vente enregistrée.</p> :
          <div className="pos-recent-list">
            {salesData.results.slice(0, 8).map((sale) => (
              <article key={sale.id} className="pos-recent-card">
                <div><strong>{sale.reference}</strong><small>{new Date(sale.created_at).toLocaleString('fr-FR')}</small></div>
                <div><strong>{money(sale.total)}</strong><small>{sale.status === 'credit' ? 'Créance : ' + money(sale.balance) : 'Payée'}</small></div>
                <button className="pos-invoice-button" onClick={() => setInvoiceSaleId(sale.id)}><ReceiptText size={15}/> Facture</button>
              </article>
            ))}
          </div>
        }
      </section>
      {invoiceSaleId && <InvoiceModal saleId={invoiceSaleId} onClose={() => setInvoiceSaleId(null)}/>}
      {phoneProduct && (
        <div className="catalog-backdrop" role="presentation">
          <section className="catalog-modal pos-phone-modal" role="dialog" aria-modal="true" aria-labelledby="pos-phone-title">
            <div className="catalog-modal-header">
              <div><h3 id="pos-phone-title">Choisir l'IMEI du téléphone</h3><p>{productLabel(phoneProduct)}</p></div>
              <button className="catalog-close" aria-label="Fermer" onClick={() => setPhoneProduct(null)}><X size={18}/></button>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); addPhoneToCart(); }} className="catalog-form">
              <div className="catalog-field">
                <label htmlFor="pos-imei"><Barcode size={15}/> IMEI du téléphone *</label>
                <input id="pos-imei" autoFocus inputMode="numeric" maxLength={20} list="pos-imei-options"
                  value={phoneImei} onChange={(event) => setPhoneImei(event.target.value)}
                  placeholder="Scanner ou saisir les 15 chiffres" required/>
                <datalist id="pos-imei-options">{phoneChoices.filter((code) => !cart.some((line) => line.imei === code))
                  .map((code) => <option key={code} value={code}/>)}</datalist>
                <small>Téléphone neuf éteint : l'IMEI est imprimé sur la boîte. Tu peux aussi le scanner avec un lecteur compatible.</small>
                {phoneLoading && <small>Recherche des IMEI disponibles…</small>}
                {phoneChoices.length > 0 && <small>{phoneChoices.length} IMEI proposé(s), ou scanne directement celui de ton téléphone.</small>}
              </div>
              {phoneError && <p role="alert" className="pos-error">{phoneError}</p>}
              <div className="catalog-form-footer">
                <button type="button" className="catalog-cancel" onClick={() => setPhoneProduct(null)}>Annuler</button>
                <button className="catalog-primary" type="submit" disabled={phoneLoading}>Ajouter au panier</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
