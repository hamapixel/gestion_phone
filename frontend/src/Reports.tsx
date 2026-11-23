import { useEffect, useState } from 'react';
import { BarChart3, Printer, TrendingUp } from 'lucide-react';
import PeriodFilter, { localDay, periodQuery, type PeriodRange } from './PeriodFilter';

type Report = {
  period: string; start: string; end: string;
  summary: {
    sales_count: number; revenue: string; purchase_cost_of_sold_items: string;
    gross_profit: string; expenses: string; operating_result: string;
    collected: string; receivable_from_period_sales: string;
  };
  products: { product_id: string; product_name: string; quantity: number; revenue: string; gross_profit: string }[];
  daily: { date: string; revenue: string; gross_profit: string }[];
};
const money = (value: string | number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(value)) + ' FCFA';
const initial = (): PeriodRange => ({ period: 'month', start: localDay(), end: localDay() });
async function parse(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Rapport indisponible.');
  return data as Report;
}
export default function Reports() {
  const [range, setRange] = useState<PeriodRange>(initial);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (range.period === 'custom' && (!range.start || !range.end || range.start > range.end)) return;
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/reports/?' + periodQuery(range), { credentials: 'same-origin', signal: controller.signal })
      .then(parse).then((data) => {
        if (!controller.signal.aborted) { setReport(data); setError(''); }
      }).catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Erreur de rapport.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [range]);

  const s = report?.summary;
  const cards = [
    ['Ventes', s?.revenue, 'Chiffre d’affaires, même si une partie reste à payer'],
    ['Encaissements', s?.collected, 'Argent réellement reçu pendant cette période'],
    ['Marge brute', s?.gross_profit, 'Ventes moins coût historique des articles vendus'],
    ['Dépenses', s?.expenses, 'Charges enregistrées sur cette période'],
    ['Résultat indicatif', s?.operating_result, 'Marge brute moins dépenses (hors impôts et autres charges non saisies)'],
    ['À recevoir', s?.receivable_from_period_sales, 'Solde actuel des ventes de cette période'],
  ] as const;

  return (
    <section className="phase7-page reports-page" aria-label="Rapports des ventes">
      <header className="phase7-section-heading">
        <div><h3><BarChart3 size={21}/> Rapports commerciaux</h3>
          <p>Ventes, bénéfices et encaissements : chaque montant a son propre sens.</p></div>
        <button className="phase7-secondary phase7-print" type="button" disabled={!report} onClick={() => window.print()}>
          <Printer size={16}/> Imprimer / PDF
        </button>
      </header>
      <PeriodFilter value={range} onChange={setRange}/>
      {error && <p className="catalog-error" role="alert">{error}</p>}
      {loading ? <p className="catalog-empty">Chargement des rapports…</p> : report && (
        <>
          <p className="phase7-period-caption">Du {report.start} au {report.end} · {report.summary.sales_count} vente(s)</p>
          <div className="phase7-kpis">
            {cards.map(([label, value, help]) => (
              <article key={label} className="phase7-kpi">
                <span>{label}</span><strong>{money(value ?? '0')}</strong><small>{help}</small>
              </article>
            ))}
          </div>
          <div className="phase7-panel">
            <h4><TrendingUp size={18}/> Marchandises vendues ({report.products.length} lignes)</h4>
            {report.products.length ? (
              <div className="phase7-product-grid">
                {report.products.map((item, index) => (
                  <article className="phase7-product-card" key={item.product_id + '-' + item.product_name + index}>
                    <strong>{item.product_name}</strong>
                    <div><span>Quantité</span><b>{item.quantity}</b></div>
                    <div><span>Montant vendu</span><b>{money(item.revenue)}</b></div>
                    <div><span>Marge brute</span><b>{money(item.gross_profit)}</b></div>
                  </article>
                ))}
              </div>
            ) : <p className="phase7-empty">Aucune marchandise vendue sur la période.</p>}
          </div>
          <div className="phase7-panel">
            <h4>Évolution des ventes par jour</h4>
            {report.daily.length ? (
              <div className="phase7-day-grid">
                {report.daily.map((day) => (
                  <div className="phase7-day" key={day.date}>
                    <strong>{day.date}</strong><span>{money(day.revenue)}</span>
                    <small>Marge : {money(day.gross_profit)}</small>
                  </div>
                ))}
              </div>
            ) : <p className="phase7-empty">Aucune vente enregistrée sur la période.</p>}
          </div>
          <p className="phase7-disclaimer">Les achats de stock ne sont pas des dépenses de fonctionnement : leur coût est déduit lors de la vente dans la marge brute. Le résultat affiché n'est pas un bénéfice comptable ou fiscal définitif.</p>
        </>
      )}
    </section>
  );
}
