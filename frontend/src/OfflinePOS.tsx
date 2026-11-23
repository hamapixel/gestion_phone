import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CloudUpload, LockKeyhole, RefreshCw, Save, ShieldAlert, Smartphone, Trash2, WifiOff } from 'lucide-react';
import InvoiceModal from './InvoiceModal';
import { deletePending, hasVault, isUnlocked, listPending, lockVault, readCatalog,
  saveCatalog, savePending, unlockVault, type CatalogSnapshot, type OfflineProduct, type PendingSale,
  type OfflineSalePayload } from './offlineVault';
import { syncPendingSales } from './offlineSync';

type BasketLine = { key: string; product: OfflineProduct; quantity: number; price: string; imei: string };
type PaymentMode = 'all' | 'half' | 'other';
const money = (n: string | number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(n)) + ' FCFA';
const csrf = () => {
  const c = document.cookie.split('; ').find((s) => s.startsWith('csrftoken='));
  return c ? decodeURIComponent(c.substring(10)) : '';
};
function productLabel(p: OfflineProduct) {
  const lower = p.name.toLowerCase();
  return [p.name, p.brand && !lower.includes(p.brand.toLowerCase()) ? p.brand : '',
    p.model && !lower.includes(p.model.toLowerCase()) ? p.model : ''].filter(Boolean).join(' · ');
}
export default function OfflinePOS({ standalone = false, onBack }: {
  standalone?: boolean; onBack?: () => void;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(isUnlocked());
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const [pending, setPending] = useState<PendingSale[]>([]);
  const [cart, setCart] = useState<BasketLine[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPhone, setSelectedPhone] = useState<OfflineProduct | null>(null);
  const [phoneImei, setPhoneImei] = useState('');
  const [payMode, setPayMode] = useState<PaymentMode>('all');
  const [otherAmount, setOtherAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmedIds, setConfirmedIds] = useState<{ id: string; reference: string }[]>([]);
  const [invoiceSaleId, setInvoiceSaleId] = useState<string | null>(null);
  const [deleteChoice, setDeleteChoice] = useState<string | null>(null);

  const refresh = async () => {
    const [cached, records] = await Promise.all([readCatalog(), listPending()]);
    setCatalog(cached);
    setPending(records);
  };
  useEffect(() => {
    let mounted = true;
    hasVault().then((has) => { if (mounted) setConfigured(has); })
      .catch((err: unknown) => { if (mounted) { setConfigured(false); setError(err instanceof Error ? err.message : 'Stockage local indisponible.'); } });
    if (isUnlocked()) {
      void refresh().catch((err: unknown) => { if (mounted) setError(err instanceof Error ? err.message : 'Lecture des brouillons impossible.'); });
    }
    return () => { mounted = false; };
  }, []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (configured === false && passphrase !== repeat) {
      setError('Les deux phrases secrètes doivent être identiques.');
      return;
    }
    setBusy(true); setError('');
    try {
      await unlockVault(passphrase);
      setUnlocked(true); setConfigured(true);
      setPassphrase(''); setRepeat('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Déverrouillage impossible.');
    } finally { setBusy(false); }
  }

  const total = useMemo(() => cart.reduce((sum, x) => sum + Number(x.price) * x.quantity, 0), [cart]);
  const requested = payMode === 'all' ? total : payMode === 'half' ? Math.round(total / 2) : Number(otherAmount || '0');
  const paid = Number.isFinite(requested) ? requested : -1;
  const balance = total - paid;
  const reserved = (id: string) => pending.reduce((n, sale) => n +
    sale.payload.lines.reduce((m, line) => m + (line.product_id === id ? line.quantity : 0), 0), 0);
  const available = (p: OfflineProduct) => Math.max(0, p.quantity - reserved(p.id));
  const visibleProducts = catalog?.products.filter((p) => productLabel(p).toLowerCase().includes(search.toLowerCase())) ?? [];

  function addProduct(p: OfflineProduct) {
    if (busy || available(p) <= 0) return;
    if (p.category === 'phone') {
      setPhoneImei(''); setSelectedPhone(p); return;
    }
    setError('');
    setCart((current) => {
      const previous = current.find((line) => line.product.id === p.id && !line.imei);
      if (previous) {
        if (previous.quantity >= available(p)) return current;
        return current.map((line) => line.key === previous.key ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, { key: crypto.randomUUID(), product: p, quantity: 1, price: p.sale_price, imei: '' }];
    });
  }
  function addPhone(event: FormEvent) {
    event.preventDefault();
    if (!selectedPhone) return;
    const code = phoneImei.replace(/[\s-]/g, '');
    const used = cart.some((line) => line.imei === code) ||
      pending.some((entry) => entry.payload.lines.some((line) => line.imei === code));
    if (!/^[0-9]{15}$/.test(code) || used) {
      setError(used ? 'IMEI déjà utilisé dans un brouillon local.' : 'IMEI : 15 chiffres requis.');
      return;
    }
    if (cart.filter((line) => line.product.id === selectedPhone.id).length >= available(selectedPhone)) {
      setError('Quantité disponible insuffisante selon la dernière copie locale.');
      return;
    }
    setCart((prev) => [...prev, {
      key: crypto.randomUUID(), product: selectedPhone, quantity: 1,
      price: selectedPhone.sale_price, imei: code,
    }]);
    setSelectedPhone(null); setPhoneImei(''); setError('');
  }
  function qty(key: string, delta: number) {
    setCart((prev) => prev.map((line) => line.key === key ? {
      ...line, quantity: line.imei ? 1 : Math.max(1, Math.min(
        available(line.product), line.quantity + delta,
      )),
    } : line));
  }
  async function cacheCatalog() {
    setBusy(true); setError(''); setMessage('');
    try {
      const session = await fetch('/api/auth/session/', { credentials: 'same-origin' });
      if (!session.ok || !(await session.json() as {authenticated: boolean}).authenticated) {
        throw new Error('Connecte-toi au propriétaire avant de mettre le catalogue à jour.');
      }
      const response = await fetch('/api/products/?q=', { credentials: 'same-origin' });
      const data = await response.json() as { results?: OfflineProduct[]; detail?: string };
      if (!response.ok || !data.results) throw new Error(data.detail || 'Catalogue indisponible.');
      await saveCatalog({ updated_at: new Date().toISOString(), products: data.results.map((p) => ({
        id: p.id, name: p.name, brand: p.brand, model: p.model,
        category: p.category, condition: p.condition, quantity: p.quantity, sale_price: p.sale_price,
      })) });
      await refresh();
      setMessage(data.results.length + ' articles copiés et chiffrés. Les stocks sont indicatifs hors ligne.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mise à jour impossible.');
    } finally { setBusy(false); }
  }
  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (busy || !cart.length) return;
    if (cart.some((line) => !Number.isFinite(Number(line.price)) || Number(line.price) <= 0 ||
      Number(line.price) > 9999999999.99 || !/^\d+(\.\d{1,2})?$/.test(line.price))) {
      setError('Vérifie les prix de vente (2 décimales maximum).'); return;
    }
    if (!Number.isFinite(total) || total > 9999999999999.99 || paid < 0 || paid > total ||
      (payMode === 'other' && !/^\d+(\.\d{1,2})?$/.test(otherAmount))) {
      setError('Versement invalide ou supérieur au total.'); return;
    }
    if (balance > 0 && (!customerName.trim() || !customerPhone.trim())) {
      setError('Nom et téléphone obligatoires pour les ventes à crédit.'); return;
    }
    const client_ref = crypto.randomUUID();
    const payload: OfflineSalePayload = {
      client_ref,
      lines: cart.map((line) => ({
        product_id: line.product.id, quantity: line.quantity,
        unit_price: Number(line.price).toFixed(2), imei: line.imei,
      })),
      amount_paid: paid.toFixed(2), method,
      customer_name: customerName.trim(), customer_phone: customerPhone.trim(),
      due_date: dueDate || null,
    };
    setBusy(true); setError('');
    try {
      await savePending({
        id: client_ref, payload, created_at: new Date().toISOString(),
        status: 'pending', error: '',
      });
      setCart([]); setPayMode('all'); setOtherAmount('');
      setCustomerName(''); setCustomerPhone(''); setDueDate('');
      setMessage('Vente sauvegardée localement et chiffrée, EN ATTENTE de validation serveur. Ne délivre pas de facture définitive.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement local impossible.');
    } finally { setBusy(false); }
  }
  async function sync() {
    if (busy) return;
    setBusy(true); setError(''); setMessage(''); setConfirmedIds([]);
    try {
      const csr = await fetch('/api/auth/csrf/', { credentials: 'same-origin' });
      const session = await fetch('/api/auth/session/', { credentials: 'same-origin' });
      if (!csr.ok || !session.ok || !(await session.json() as {authenticated: boolean}).authenticated) {
        throw new Error('Connecte-toi au propriétaire avec une connexion active avant la synchronisation.');
      }
      const result = await syncPendingSales(
        pending,
        (payload) => fetch('/api/sales/', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
          body: JSON.stringify(payload),
        }),
        async (entry) => { await deletePending(entry.id); },
        async (entry, detail) => { await savePending({ ...entry, status: 'conflict', error: detail }); },
      );
      await refresh();
      setConfirmedIds(result.confirmed.filter((s): s is {id:string;reference:string} => Boolean(s)));
      setMessage(result.confirmed.length + ' vente(s) confirmée(s) par Django. ' +
        result.conflicts + ' conflit(s) à résoudre.' + (result.paused ? ' ' + result.paused : ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Synchronisation impossible. Les brouillons sont préservés.');
    } finally { setBusy(false); }
  }
  async function retry(entry: PendingSale) {
    setBusy(true); setError('');
    try { await savePending({ ...entry, status: 'pending', error: '' }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Impossible de préparer le nouvel essai.'); }
    finally { setBusy(false); }
  }
  async function discard(entry: PendingSale) {
    if (deleteChoice !== entry.id) { setDeleteChoice(entry.id); return; }
    setBusy(true);
    try {
      await deletePending(entry.id);
      setDeleteChoice(null); await refresh();
      setMessage('Proposition locale supprimée. Aucune vente serveur n’a été annulée.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Suppression impossible.'); }
    finally { setBusy(false); }
  }
  const offlineWarning = <p className="offline-safety">
    <ShieldAlert size={17}/> Hors connexion : le stock affiché peut avoir changé sur un autre appareil.
    Toute vente reste en attente jusqu’à la validation du serveur. Le reçu définitif n’est disponible qu’après confirmation.
  </p>;

  return (
    <section className="offline-page">
      <header className="offline-heading">
        <div><h3><WifiOff size={20}/> Caisse hors ligne sécurisée</h3>
          <p>Brouillons chiffrés sur cet appareil, sans accès à PostgreSQL hors réseau.</p></div>
        <div className="offline-top-actions">
          {unlocked && <button className="offline-secondary" onClick={() => {
            lockVault(); setUnlocked(false); setCart([]); setCatalog(null); setPending([]); setMessage('');
          }}><LockKeyhole size={15}/> Verrouiller</button>}
          {standalone && <button className="offline-secondary" onClick={() => window.location.reload()}>
            <RefreshCw size={15}/> Retenter la connexion
          </button>}
          {!standalone && onBack && <button className="offline-secondary" onClick={onBack}>Retour</button>}
        </div>
      </header>
      {error && <p className="pos-error" role="alert">{error}</p>}
      {message && <p className="offline-message" role="status">{message}</p>}
      {configured === null ? <p>Vérification du coffre local…</p> : !unlocked ? (
        <form className="offline-unlock" onSubmit={unlock}>
          <LockKeyhole size={29}/>
          <h4>{configured ? 'Déverrouiller le coffre' : 'Activer le coffre hors ligne'}</h4>
          <p>{configured
            ? 'Saisis la phrase secrète créée sur cet appareil. Elle n’est jamais envoyée au serveur.'
            : 'Choisis une phrase secrète d’au moins 8 caractères. Les brouillons seront chiffrés sur cet appareil.'}
          </p>
          <label>Phrase secrète locale
            <input aria-label="Phrase secrète locale" type="password" autoComplete="off"
              minLength={8} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} required/>
          </label>
          {!configured && <label>Confirmer la phrase secrète
            <input aria-label="Confirmer la phrase secrète" type="password" autoComplete="off"
              minLength={8} value={repeat} onChange={(e) => setRepeat(e.target.value)} required/>
          </label>}
          <small>Sans cette phrase, les brouillons chiffrés ne pourront pas être récupérés. Ne l’utilise pas comme mot de passe de connexion.</small>
          <button className="pos-submit" type="submit" disabled={busy}>
            {busy ? 'Chiffrement…' : configured ? 'Déverrouiller' : 'Activer le mode local'}
          </button>
        </form>
      ) : (
        <>
          {offlineWarning}
          <div className="offline-toolbar">
            <span>Catalogue : {catalog?.updated_at ? new Date(catalog.updated_at).toLocaleString('fr-FR') : 'non téléchargé'}</span>
            <button className="offline-secondary" disabled={busy} onClick={() => void cacheCatalog()}>
              <RefreshCw size={15}/> Mettre à jour le catalogue
            </button>
            <button className="offline-sync" disabled={busy || !pending.some((s) => s.status === 'pending')}
              onClick={() => void sync()}><CloudUpload size={15}/> Synchroniser les ventes
            </button>
          </div>
          <div className="offline-layout">
            <section className="offline-catalog">
              <h4>Articles disponibles selon la dernière copie</h4>
              <input className="offline-search" aria-label="Rechercher hors ligne" placeholder="Rechercher un article…"
                value={search} onChange={(e) => setSearch(e.target.value)}/>
              {!catalog && <p className="phase7-empty">Connecte-toi une fois et clique « Mettre à jour le catalogue » pour préparer une utilisation hors ligne.</p>}
              <div className="offline-products">
                {visibleProducts.map((p) => (
                  <article className="offline-product" key={p.id}>
                    <strong>{productLabel(p)}</strong><small>Stock mémorisé : {p.quantity} · Réservé localement : {reserved(p.id)}</small>
                    <div><b>{money(p.sale_price)}</b>
                      <button type="button" onClick={() => addProduct(p)} disabled={busy || available(p) <= 0}>Ajouter</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="offline-cart">
              <h4>Panier provisoire ({cart.length} ligne(s))</h4>
              {cart.length === 0 ? <p className="phase7-empty">Choisis un article dans le catalogue hors ligne.</p> :
                <div className="offline-cart-lines">
                  {cart.map((line) => (
                    <div className="offline-line" key={line.key}>
                      <strong>{productLabel(line.product)}</strong>
                      {line.imei && <small>IMEI : {line.imei}</small>}
                      <div className="offline-line-actions">
                        {!line.imei && <div>
                          <button type="button" disabled={busy || line.quantity <= 1} onClick={() => qty(line.key, -1)}>−</button>
                          <span>{line.quantity}</span>
                          <button type="button" disabled={busy || line.quantity >= available(line.product)} onClick={() => qty(line.key, 1)}>+</button>
                        </div>}
                        <label>Prix unitaire
                          <input aria-label={'Prix unitaire ' + line.product.name} type="number" min="1" step=".01"
                            value={line.price} disabled={busy} onChange={(e) => setCart((prev) => prev.map((x) =>
                              x.key === line.key ? { ...x, price: e.target.value } : x))}/>
                        </label>
                        <button type="button" className="offline-remove" disabled={busy} onClick={() => setCart((prev) => prev.filter((x) => x.key !== line.key))}>
                          <Trash2 size={15}/> Retirer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              }
              <form className="offline-checkout-form" onSubmit={saveDraft}>
                <div className="pos-total"><span>Total provisoire</span><strong>{money(total)}</strong></div>
                <div className="pos-pay-modes">
                  {([['all', 'Tout'], ['half', 'Moitié'], ['other', 'Autre montant']] as const).map(([id, label]) => (
                    <button key={id} type="button" disabled={busy} className={payMode === id ? 'selected' : ''}
                      onClick={() => setPayMode(id)}>{label}</button>
                  ))}
                </div>
                {payMode === 'other' && <label>Montant versé
                  <input type="number" aria-label="Montant versé hors ligne" min="0" step=".01" required value={otherAmount}
                    onChange={(e) => setOtherAmount(e.target.value)} disabled={busy}/>
                </label>}
                <label>Moyen de paiement
                  <select value={method} onChange={(e) => setMethod(e.target.value)} disabled={busy}>
                    <option value="cash">Espèces</option><option value="orange">Orange Money</option>
                    <option value="moov">Moov Money</option><option value="transfer">Virement</option>
                  </select>
                </label>
                <p className="offline-balance">Versement prévu : {money(Math.max(0, paid))} · Reste : {money(Math.max(0, balance))}</p>
                {balance > 0 && cart.length > 0 && <div className="offline-credit">
                  <label>Nom du client *
                    <input aria-label="Nom du client hors ligne" maxLength={160} required value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)} disabled={busy}/>
                  </label>
                  <label>Téléphone client *
                    <input aria-label="Téléphone client hors ligne" maxLength={30} required value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)} disabled={busy}/>
                  </label>
                  <label>Échéance (facultatif)
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={busy}/>
                  </label>
                </div>}
                <button type="submit" className="pos-submit" disabled={busy || cart.length === 0}>
                  <Save size={16}/> Enregistrer en attente (pas une vente confirmée)
                </button>
              </form>
            </section>
          </div>
          <section className="offline-queue">
            <h4>File de synchronisation ({pending.length})</h4>
            <p className="phase7-empty">Les ventes sont envoyées avec une référence stable et vérifiées par Django.
              En cas de conflit, aucune sortie de stock n’est validée.</p>
            {!pending.length && <p className="offline-empty">Aucune vente en attente sur cet appareil.</p>}
            <div className="offline-pending-grid">
              {pending.map((item) => (
                <article className="offline-pending-card" key={item.id}>
                  <strong>{item.status === 'conflict' ? 'À corriger — refusée par le serveur' : 'En attente de validation'}</strong>
                  <small>{new Date(item.created_at).toLocaleString('fr-FR')} · {item.id.slice(0,8)}</small>
                  <p>{item.payload.lines.length} ligne(s) · {money(item.payload.lines.reduce(
                    (sum, line) => sum + Number(line.unit_price) * line.quantity, 0
                  ))}</p>
                  {item.error && <p className="pos-error">{item.error}</p>}
                  <div>
                    {item.status === 'conflict' && <button className="offline-secondary" disabled={busy}
                      onClick={() => void retry(item)}>Réessayer sans modification</button>}
                    <button className="offline-secondary" disabled={busy} onClick={() => void discard(item)}>
                      {deleteChoice === item.id ? 'Confirmer la suppression locale' : 'Supprimer le brouillon'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {confirmedIds.length > 0 && <div className="offline-confirmed">
              <h4>Ventes confirmées par le serveur</h4>
              {confirmedIds.map((sale) => (
                <div key={sale!.id}><strong>{sale!.reference}</strong>
                  <button onClick={() => setInvoiceSaleId(sale!.id)}>Voir la facture</button></div>
              ))}
            </div>}
          </section>
          {selectedPhone && <div className="catalog-backdrop">
            <section className="catalog-modal offline-phone-modal" role="dialog" aria-modal="true" aria-labelledby="offline-phone-title">
              <div className="catalog-modal-header"><h3 id="offline-phone-title">IMEI du téléphone</h3>
                <button aria-label="Fermer" className="catalog-close" onClick={() => setSelectedPhone(null)}>×</button></div>
              <form className="catalog-form" onSubmit={addPhone}>
                <p className="phase7-empty">Saisis les 15 chiffres indiqués sur la boîte. Le serveur vérifiera ce téléphone à la synchronisation.</p>
                <label>IMEI *
                  <input aria-label="IMEI hors ligne" inputMode="numeric" required maxLength={20}
                    value={phoneImei} onChange={(e) => setPhoneImei(e.target.value)}/>
                </label>
                <div className="catalog-form-footer">
                  <button type="button" className="catalog-cancel" onClick={() => setSelectedPhone(null)}>Annuler</button>
                  <button className="catalog-primary" type="submit">Ajouter au panier provisoire</button>
                </div>
              </form>
            </section>
          </div>}
          {invoiceSaleId && <InvoiceModal saleId={invoiceSaleId} onClose={() => setInvoiceSaleId(null)}/>}
        </>
      )}
    </section>
  );
}
