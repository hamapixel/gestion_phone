import { FormEvent, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, CreditCard, ReceiptText, Search, Wallet, X } from 'lucide-react';
import InvoiceModal from './InvoiceModal';

type Payment = { id: string; client_ref: string | null; amount: string; method: string; created_at: string };
type Debt = {
  id: string; reference: string; created_at: string; customer_name: string; customer_phone: string;
  due_date: string | null; overdue: boolean; total: string; amount_paid: string;
  balance: string; status: 'credit' | 'paid'; payments: Payment[];
};
type DebtPayment = Payment & {
  sale_id: string; reference: string; customer_name: string; customer_phone: string;
  kind: 'initial' | 'repayment';
};
type DebtPaymentList = { results: DebtPayment[]; limit: number };
type DebtList = {
  results: Debt[];
  summary: { outstanding: string; open_count: number; overdue_count: number };
};
type Filter = 'open' | 'overdue' | 'paid' | 'all';
type PaymentMode = 'all' | 'half' | 'other';
const money = (v: string | number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(v)) + ' FCFA';
const methods: Record<string, string> = { cash: 'Espèces', orange: 'Orange Money', moov: 'Moov Money', transfer: 'Virement' };
function csrf() {
  const value = document.cookie.split('; ').find((item) => item.startsWith('csrftoken='));
  return value ? decodeURIComponent(value.substring('csrftoken='.length)) : '';
}
async function readResponse(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail ?? 'Opération impossible.');
  return result;
}
function formattedDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR');
}
export default function Debts() {
  const [list, setList] = useState<DebtList | null>(null);
  const [payments, setPayments] = useState<DebtPaymentList | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsError, setPaymentsError] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Debt | null>(null);
  const [mode, setMode] = useState<PaymentMode>('all');
  const [otherAmount, setOtherAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState('');
  const [documentSale, setDocumentSale] = useState<string | null>(null);
  const [documentPayment, setDocumentPayment] = useState<string | null>(null);
  const [reminder, setReminder] = useState<Debt | null>(null);
  const [reminderTone, setReminderTone] = useState<'polite' | 'firm'>('polite');
  const [reminderText, setReminderText] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/debts/?status=' + filter + '&q=' + encodeURIComponent(query), {
      credentials: 'same-origin', signal: controller.signal,
    })
      .then(readResponse).then((data: DebtList) => {
        if (!controller.signal.aborted) { setList(data); setError(''); }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Chargement impossible.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, query, notice]);

  useEffect(() => {
    const controller = new AbortController();
    setPaymentsLoading(true);
    fetch('/api/debt-payments/?q=' + encodeURIComponent(query), {
      credentials: 'same-origin', signal: controller.signal,
    })
      .then(readResponse)
      .then((data: DebtPaymentList) => {
        if (!controller.signal.aborted) { setPayments(data); setPaymentsError(''); }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setPaymentsError(
          err instanceof Error ? err.message : 'Paiements indisponibles.'
        );
      })
      .finally(() => { if (!controller.signal.aborted) setPaymentsLoading(false); });
    return () => controller.abort();
  }, [query, notice]);

  function openPayment(debt: Debt) {
    if (Number(debt.balance) <= 0) return;
    setSelected(debt);
    setMode('all'); setOtherAmount(''); setMethod('cash'); setError(''); setUncertain(false);
    setReference(crypto.randomUUID());
  }
  const rest = Number(selected?.balance ?? 0);
  const current = mode === 'all' ? rest : mode === 'half' ? Math.round(rest / 2) : Number(otherAmount || 0);
  const amount = Number.isFinite(current) ? current : -1;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy || amount <= 0 || amount > rest) {
      setError('Le versement doit être supérieur à zéro et ne pas dépasser le reste à payer.');
      return;
    }
    setBusy(true); setError('');
    let responded = false;
    try {
      const response = await fetch('/api/debts/' + selected.id + '/payments/', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
        body: JSON.stringify({ client_ref: reference, amount: amount.toFixed(2), method }),
      });
      responded = true;
      const result = await readResponse(response) as { debt: Debt; replayed: boolean };
      setSelected(null); setUncertain(false);
      setNotice((result.replayed ? 'Versement retrouvé' : 'Versement enregistré') +
        ' : ' + money(amount) + ' pour ' + result.debt.customer_name + '.');
    } catch (err) {
      if (!responded) {
        setUncertain(true);
        setError('Réponse inconnue. Réessaie le même versement sans changer les montants, pour éviter un doublon.');
      } else {
        setError(err instanceof Error ? err.message : 'Versement refusé.');
      }
    } finally {
      setBusy(false);
    }
  }
  function closePayment() {
    if (uncertain) {
      setError('Réessaie le même versement ou vérifie la créance après le rétablissement du réseau.');
      return;
    }
    setSelected(null); setError('');
  }
  function messageFor(debt: Debt, tone: 'polite' | 'firm') {
    const subject = debt.reference + ' — ' + money(debt.balance) + ' restant à régler' +
      (debt.due_date ? ', échéance ' + formattedDate(debt.due_date + 'T00:00:00') : '');
    return tone === 'polite'
      ? 'Bonjour ' + debt.customer_name + ', petit rappel concernant votre achat ' + subject +
        '. Merci pour votre règlement. Bien cordialement.'
      : 'Bonjour ' + debt.customer_name + ', nous vous rappelons que le paiement lié à ' +
        subject + ' est toujours attendu. Merci de régulariser votre situation rapidement.';
  }
  function openReminder(debt: Debt) {
    setReminder(debt);
    setReminderTone('polite');
    setReminderText(messageFor(debt, 'polite'));
  }
  function openWhatsApp() {
    if (!reminder) return;
    const phone = reminder.customer_phone.replace(/[^\d]/g, '');
    if (!phone) return;
    const destination = phone.startsWith('223') ? phone : '223' + phone;
    window.open('https://wa.me/' + destination + '?text=' + encodeURIComponent(reminderText),
      '_blank', 'noopener,noreferrer');
    setReminder(null);
  }

  return (
    <section className="debt-page">
      <div className="debt-summary">
        <article><span>Total à recevoir</span><strong>{money(list?.summary.outstanding ?? 0)}</strong></article>
        <article><span>Créances en cours</span><strong>{list?.summary.open_count ?? 0}</strong></article>
        <article><span>Échéances dépassées</span><strong>{list?.summary.overdue_count ?? 0}</strong></article>
      </div>
      <div className="debt-toolbar">
        <div className="catalog-search">
          <Search size={17}/>
          <input aria-label="Rechercher une créance" placeholder="Client ou téléphone…" value={query}
            onChange={(event) => setQuery(event.target.value)}/>
        </div>
        <div className="debt-filters" role="group" aria-label="Filtrer les créances">
          {([['open','En cours'], ['overdue','En retard'], ['paid','Payées'], ['all','Toutes']] as const).map(([key,label]) => (
            <button type="button" key={key} className={filter === key ? 'selected' : ''}
              onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
      </div>
      {notice && <p className="debt-notice" role="status"><CheckCircle2 size={16}/>{notice}</p>}
      {!selected && error && <p role="alert" className="catalog-error">{error}</p>}
      {loading && <p className="catalog-empty">Chargement des créances…</p>}
      {!loading && list && (list.results.length ? (
        <div className="debt-grid">
          {list.results.map((debt) => (
            <article className="debt-card" key={debt.id}>
              <div className="debt-card-heading">
                <div><h3>{debt.customer_name}</h3>
                  <span>{debt.customer_phone} · {debt.reference}</span></div>
                <span className={'debt-status ' + (Number(debt.balance) === 0 ? 'paid' : debt.overdue ? 'overdue' : '')}>
                  {Number(debt.balance) === 0 ? 'Payée' : debt.overdue ? 'En retard' : 'En cours'}
                </span>
              </div>
              <div className="debt-values">
                <div><span>Total facture</span><strong>{money(debt.total)}</strong></div>
                <div><span>Déjà versé</span><strong>{money(debt.amount_paid)}</strong></div>
                <div className="debt-due"><span>Reste dû</span><strong>{money(debt.balance)}</strong></div>
              </div>
              <div className="debt-meta"><CalendarClock size={14}/>
                {debt.due_date ? 'Échéance : ' + formattedDate(debt.due_date) : 'Aucune échéance définie'}
                <span>· Vente du {formattedDate(debt.created_at)}</span>
              </div>
              <details className="debt-payments">
                <summary>Historique des versements ({debt.payments.length})</summary>
                {debt.payments.length ? debt.payments.map((payment) => (
                  <div key={payment.id} className="debt-payment-line">
                    <span>{formattedDate(payment.created_at)} · {methods[payment.method] || payment.method}</span>
                    <strong>{money(payment.amount)}</strong>
                    <button className="debt-document" onClick={() => setDocumentPayment(payment.id)}>Reçu</button>
                  </div>
                )) : <p>Aucun versement.</p>}
              </details>
              <div className="debt-actions">
                <button className="debt-remind" onClick={() => setDocumentSale(debt.id)}>
                  <ReceiptText size={16}/> Facture
                </button>
                {Number(debt.balance) > 0 && <button className="debt-pay" onClick={() => openPayment(debt)}>
                  <CreditCard size={16}/> Encaisser
                </button>}
                {Number(debt.balance) > 0 && <button className="debt-remind" onClick={() => openReminder(debt)}>
                  Relancer WhatsApp
                </button>}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="debt-empty"><Wallet size={32}/><p>Aucune créance pour ce filtre.</p>
        <small>Les ventes à crédit enregistrées dans la caisse apparaissent automatiquement ici.</small>
      </div>)}
      <section className="debt-payment-history" aria-labelledby="debt-history-heading">
        <div className="debt-history-heading">
          <div>
            <h3 id="debt-history-heading">Liste des paiements de créances</h3>
            <p>Acomptes et remboursements enregistrés, y compris les dettes entièrement payées.</p>
          </div>
          {payments && <span>{payments.results.length} paiement(s) affiché(s)</span>}
        </div>
        {paymentsLoading && <p className="catalog-empty">Chargement des paiements…</p>}
        {paymentsError && <p className="catalog-error" role="alert">{paymentsError}</p>}
        {!paymentsLoading && payments && (payments.results.length > 0 ?
          <div className="debt-history-grid">
            {payments.results.map((payment) => (
              <article className="debt-history-card" key={payment.id}>
                <div className="debt-history-client">
                  <strong>{payment.customer_name}</strong>
                  <small>{payment.reference} · {payment.customer_phone}</small>
                </div>
                <div className="debt-history-details">
                  <span>{formattedDate(payment.created_at)}</span>
                  <span>{methods[payment.method] || payment.method}</span>
                  <span className="debt-history-kind">{payment.kind === 'initial' ? 'Acompte initial' : 'Remboursement'}</span>
                </div>
                <div className="debt-history-bottom">
                  <strong>{money(payment.amount)}</strong>
                  <button type="button" className="debt-document"
                    aria-label={'Reçu du paiement ' + payment.id}
                    onClick={() => setDocumentPayment(payment.id)}>
                    <ReceiptText size={15}/> Reçu
                  </button>
                </div>
              </article>
            ))}
          </div> :
          <p className="debt-history-empty">Aucun paiement de créance enregistré pour cette recherche.</p>
        )}
      </section>
      {documentSale && <InvoiceModal saleId={documentSale} onClose={() => setDocumentSale(null)}/>}
      {documentPayment && <InvoiceModal paymentId={documentPayment} onClose={() => setDocumentPayment(null)}/>}
      {reminder && (
        <div className="catalog-backdrop">
          <section role="dialog" aria-modal="true" aria-labelledby="reminder-modal-title" className="catalog-modal debt-reminder-modal">
            <div className="catalog-modal-header">
              <div><h3 id="reminder-modal-title">Relance WhatsApp</h3>
                <p>{reminder.customer_name} · {money(reminder.balance)} à recevoir</p></div>
              <button className="catalog-close" aria-label="Fermer la relance" onClick={() => setReminder(null)}><X size={18}/></button>
            </div>
            <div className="catalog-form">
              <div className="debt-modes">
                <button type="button" className={reminderTone === 'polite' ? 'selected' : ''}
                  onClick={() => { setReminderTone('polite'); setReminderText(messageFor(reminder, 'polite')); }}>Poli</button>
                <button type="button" className={reminderTone === 'firm' ? 'selected' : ''}
                  onClick={() => { setReminderTone('firm'); setReminderText(messageFor(reminder, 'firm')); }}>Ferme</button>
              </div>
              <div className="catalog-field">
                <label htmlFor="reminder-text">Message à personnaliser</label>
                <textarea id="reminder-text" rows={6} maxLength={1200} value={reminderText}
                  onChange={(event) => setReminderText(event.target.value)}/>
              </div>
              <p className="debt-reminder-note">WhatsApp s'ouvrira avec le message préparé. Tu choisis ensuite si tu veux l'envoyer.</p>
              <div className="catalog-form-footer">
                <button className="catalog-cancel" onClick={() => setReminder(null)}>Annuler</button>
                <button className="catalog-primary" disabled={!reminderText.trim()} onClick={openWhatsApp}>Ouvrir WhatsApp</button>
              </div>
            </div>
          </section>
        </div>
      )}
      {selected && (
        <div className="catalog-backdrop">
          <section role="dialog" aria-modal="true" aria-labelledby="debt-modal-title" className="catalog-modal debt-modal">
            <div className="catalog-modal-header">
              <div><h3 id="debt-modal-title">Encaisser une créance</h3>
                <p>{selected.customer_name} · {selected.reference}</p></div>
              <button aria-label="Fermer" className="catalog-close" onClick={closePayment}><X size={18}/></button>
            </div>
            <form className="catalog-form" onSubmit={submit}>
              <div className="debt-remaining"><span>Reste à payer</span><strong>{money(rest)}</strong></div>
              <div className="debt-modes">
                {([['all','Tout'], ['half','Moitié'], ['other','Autre montant']] as const).map(([key,label]) => (
                  <button type="button" disabled={busy || uncertain} key={key}
                    className={mode === key ? 'selected' : ''} onClick={() => setMode(key)}>{label}</button>
                ))}
              </div>
              <div className="catalog-fields">
                <div className="catalog-field"><label htmlFor="debt-amount">Montant à encaisser</label>
                  <input id="debt-amount" type="number" min="0.01" step="0.01" required
                    value={mode === 'other' ? otherAmount : amount.toFixed(2)}
                    onChange={(event) => setOtherAmount(event.target.value)}
                    disabled={busy || uncertain || mode !== 'other'}/>
                </div>
                <div className="catalog-field"><label htmlFor="debt-method">Moyen de paiement</label>
                  <select id="debt-method" value={method} disabled={busy || uncertain}
                    onChange={(event) => setMethod(event.target.value)}>
                    <option value="cash">Espèces</option><option value="orange">Orange Money</option>
                    <option value="moov">Moov Money</option><option value="transfer">Virement</option>
                  </select>
                </div>
              </div>
              <div className="debt-after"><span>Reste après versement</span><strong>{money(Math.max(0,rest-amount))}</strong></div>
              {error && <p className="catalog-error" role="alert">{error}</p>}
              <div className="catalog-form-footer">
                <button type="button" className="catalog-cancel" onClick={closePayment}>Annuler</button>
                <button type="submit" className="catalog-primary" disabled={busy || amount <= 0 || amount > rest}>
                  {busy ? 'Enregistrement…' : uncertain ? 'Réessayer ce versement' : 'Confirmer le versement'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
