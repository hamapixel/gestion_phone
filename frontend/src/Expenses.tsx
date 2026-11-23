import { FormEvent, useEffect, useState } from 'react';
import { Plus, Receipt, X } from 'lucide-react';
import PeriodFilter, { localDay, periodQuery, type PeriodRange } from './PeriodFilter';

type Expense = { id: string; client_ref: string; label: string; amount: string; spent_on: string; note: string; created_at: string };
type ExpenseList = { results: Expense[]; total: string; period: string; start: string; end: string };
const initial = (): PeriodRange => ({ period: 'month', start: localDay(), end: localDay() });
const money = (value: number | string) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(value)) + ' FCFA';
const csrf = () => {
  const token = document.cookie.split('; ').find((item) => item.startsWith('csrftoken='));
  return token ? decodeURIComponent(token.substring('csrftoken='.length)) : '';
};
export default function Expenses() {
  const [range, setRange] = useState<PeriodRange>(initial);
  const [list, setList] = useState<ExpenseList | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [day, setDay] = useState(localDay());
  const [clientRef, setClientRef] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);

  useEffect(() => {
    if (range.period === 'custom' && (!range.start || !range.end || range.start > range.end)) return;
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/expenses/?' + periodQuery(range), { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as ExpenseList & { detail?: string };
        if (!response.ok) throw new Error(data.detail || 'Chargement impossible.');
        if (!controller.signal.aborted) { setList(data); setError(''); }
      }).catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Dépenses indisponibles.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [range, notice]);

  function start() {
    setLabel(''); setAmount(''); setNote(''); setDay(localDay());
    setClientRef(crypto.randomUUID()); setOpen(true); setError(''); setUncertain(false);
  }
  function close() {
    if (uncertain) {
      setError('Réessaie cette même dépense sans modifier les champs si la réponse réseau est inconnue.');
      return;
    }
    setOpen(false); setError('');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return;
    setBusy(true); setError('');
    let responded = false;
    try {
      const response = await fetch('/api/expenses/', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
        body: JSON.stringify({ client_ref: clientRef, label: label.trim(), amount, spent_on: day, note: note.trim() }),
      });
      responded = true;
      const result = await response.json() as { expense?: Expense; detail?: string; replayed?: boolean };
      if (!response.ok || !result.expense) throw new Error(result.detail || 'Enregistrement impossible.');
      setOpen(false); setUncertain(false);
      setNotice((result.replayed ? 'Dépense retrouvée' : 'Dépense enregistrée') + ' : ' + money(result.expense.amount));
    } catch (err) {
      setError(responded ? (err instanceof Error ? err.message : 'Dépense refusée.') :
        'Réponse inconnue. Réessaie cette même dépense, sans modifier les champs pour éviter un doublon.');
      if (!responded) setUncertain(true);
    } finally { setBusy(false); }
  }

  return (
    <section className="phase7-page expenses-page">
      <header className="phase7-section-heading">
        <div><h3><Receipt size={20}/> Dépenses de boutique</h3>
          <p>Transport, loyer, réparation, électricité… saisie rapide.</p></div>
        <button className="catalog-add" onClick={start}><Plus size={16}/> Ajouter une dépense</button>
      </header>
      <PeriodFilter value={range} onChange={setRange}/>
      {notice && <p className="debt-notice" role="status">{notice}</p>}
      {!open && error && <p className="catalog-error" role="alert">{error}</p>}
      {loading ? <p className="catalog-empty">Chargement des dépenses…</p> : list && (
        <>
          <div className="phase7-expense-total"><span>Total des dépenses de la période</span><strong>{money(list.total)}</strong></div>
          {list.results.length ? <div className="phase7-expense-grid">
            {list.results.map((item) => (
              <article className="phase7-expense-card" key={item.id}>
                <div><strong>{item.label}</strong><small>{item.spent_on}</small></div>
                <b>{money(item.amount)}</b>
                {item.note && <p>{item.note}</p>}
              </article>
            ))}
          </div> : <div className="phase7-empty-panel">Aucune dépense enregistrée sur cette période.</div>}
        </>
      )}
      {open && (
        <div className="catalog-backdrop">
          <section className="catalog-modal phase7-expense-modal" role="dialog" aria-modal="true" aria-labelledby="new-expense-title">
            <div className="catalog-modal-header">
              <div><h3 id="new-expense-title">Nouvelle dépense</h3><p>Une ligne suffit.</p></div>
              <button aria-label="Fermer" className="catalog-close" onClick={close}><X size={18}/></button>
            </div>
            <form className="catalog-form" onSubmit={submit}>
              <div className="catalog-field">
                <label htmlFor="expense-label">Motif de la dépense *</label>
                <input id="expense-label" maxLength={160} required autoFocus value={label}
                  placeholder="Ex. Transport marchandises" disabled={busy || uncertain}
                  onChange={(event) => setLabel(event.target.value)}/>
              </div>
              <div className="catalog-fields">
                <div className="catalog-field">
                  <label htmlFor="expense-amount">Montant (FCFA) *</label>
                  <input id="expense-amount" type="number" step=".01" min=".01" required value={amount}
                    disabled={busy || uncertain} onChange={(event) => setAmount(event.target.value)}/>
                </div>
                <div className="catalog-field">
                  <label htmlFor="expense-day">Date</label>
                  <input id="expense-day" type="date" required value={day} disabled={busy || uncertain}
                    onChange={(event) => setDay(event.target.value)}/>
                </div>
              </div>
              <div className="catalog-field">
                <label htmlFor="expense-note">Note (facultatif)</label>
                <textarea id="expense-note" rows={2} maxLength={240} value={note} disabled={busy || uncertain}
                  onChange={(event) => setNote(event.target.value)} placeholder="Quelques détails si nécessaire"/>
              </div>
              <small>Les achats destinés au stock sont à enregistrer dans « Achats & fournisseurs » et non ici.</small>
              {error && <p className="catalog-error" role="alert">{error}</p>}
              <div className="catalog-form-footer">
                <button type="button" className="catalog-cancel" onClick={close}>Annuler</button>
                <button type="submit" className="catalog-primary" disabled={busy || !label.trim() || !(Number(amount) > 0)}>
                  {busy ? 'Enregistrement…' : uncertain ? 'Réessayer cette dépense' : 'Enregistrer la dépense'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
