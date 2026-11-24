import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Clock3, HandCoins, RefreshCw,
  TrendingUp, Wallet, ReceiptText,
} from 'lucide-react';
import PeriodFilter, { localDay, periodQuery, type PeriodRange } from './PeriodFilter';
import { PaymentDoughnut, ProductsBarChart, SalesLineChart } from './DashboardCharts';

export type BusinessReport = {
  period: string; start: string; end: string;
  summary: {
    sales_count: number; revenue: string; purchase_cost_of_sold_items: string;
    gross_profit: string; expenses: string; operating_result: string;
    collected: string; receivable_from_period_sales: string;
  };
  products: { product_id: string; product_name: string; quantity: number; revenue: string; gross_profit: string }[];
  daily: { date: string; revenue: string; gross_profit: string }[];
};

const money = (value: number | string) => new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 2,
}).format(Number(value)) + ' FCFA';

export function settledSaleAmounts(summary: BusinessReport['summary']) {
  // These two parts refer to sales CREATED in the chosen period.
  // Do not mix in payments received for older sales during this period.
  const turnover = Math.max(0, Number(summary.revenue) || 0);
  const outstanding = Math.min(turnover, Math.max(0, Number(summary.receivable_from_period_sales) || 0));
  return { settled: Math.max(0, turnover - outstanding), outstanding, turnover };
}

const defaultRange = (): PeriodRange => ({ period: 'month', start: localDay(), end: localDay() });

export default function DashboardOverview({ dark }: { dark: boolean }) {
  const [range, setRange] = useState<PeriodRange>(defaultRange);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<BusinessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (range.period === 'custom' && (!range.start || !range.end || range.start > range.end)) {
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    fetch('/api/reports/?' + periodQuery(range), {
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
    })
      .then(async (response) => {
        const json = await response.json() as BusinessReport & { detail?: string };
        if (!response.ok || !json.summary || !Array.isArray(json.products) || !Array.isArray(json.daily)) {
          throw new Error(json.detail || 'Les données financières ne sont pas disponibles.');
        }
        return json;
      })
      .then((report) => { if (!controller.signal.aborted) setData(report); })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Rapports indisponibles.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [range, reload]);

  const amounts = useMemo(() => data ? settledSaleAmounts(data.summary) : null, [data]);
  const stats = data ? [
    { name: 'Chiffre d’affaires', value: data.summary.revenue,
      note: 'Montant des ventes réalisées pendant la période', Icon: ArrowUpRight, tone: 'blue' },
    { name: 'Encaissements réels', value: data.summary.collected,
      note: 'Paiements reçus pendant la période, y compris d’anciennes créances', Icon: HandCoins, tone: 'green' },
    { name: 'À recevoir sur ces ventes', value: data.summary.receivable_from_period_sales,
      note: 'Solde restant à percevoir des ventes de la période', Icon: Wallet, tone: 'orange' },
    { name: 'Marge brute', value: data.summary.gross_profit,
      note: 'Ventes moins coût d’achat historique des articles vendus', Icon: TrendingUp, tone: 'purple' },
    { name: 'Dépenses', value: data.summary.expenses,
      note: 'Charges saisies pour la période (sans les achats de stock)', Icon: ArrowDownLeft, tone: 'red' },
    { name: 'Résultat indicatif', value: data.summary.operating_result,
      note: 'Marge brute moins dépenses ; hors charges et impôts non saisis', Icon: ReceiptText, tone: 'teal' },
  ] : [];

  return (
    <section className="live-dashboard" aria-labelledby="live-dashboard-title">
      <header className="live-dashboard-heading">
        <h3 id="live-dashboard-title">Aperçu financier</h3>
        <button type="button" className="live-dashboard-refresh" disabled={loading}
          onClick={() => setReload((value) => value + 1)}>
          <RefreshCw size={16}/> Actualiser
        </button>
      </header>
      <PeriodFilter value={range} onChange={setRange}/>
      {error && <p className="catalog-error" role="alert">{error}</p>}
      {loading && <div className="live-dashboard-loading" role="status">Chargement des données financières réelles…</div>}
      {!loading && !error && !data &&
        <p className="phase7-empty">Choisissez une période valide pour afficher vos indicateurs.</p>}
      {!loading && data && (
        <>
          <p className="live-period-caption">
            <Clock3 size={14}/> Du {data.start} au {data.end} · {data.summary.sales_count} vente(s) sur la période
          </p>
          <div className="live-kpi-grid">
            {stats.map(({ name, value, note, Icon, tone }) => (
              <article key={name} className={'live-kpi-card live-kpi-' + tone}>
                <div className="live-kpi-top"><span>{name}</span><i><Icon size={19}/></i></div>
                <strong>{money(value)}</strong>
                <small>{note}</small>
              </article>
            ))}
          </div>
          <div className="live-charts-grid">
            <article className="live-chart-panel live-doughnut-panel">
              <header><h4>État des règlements</h4>
                <p>Répartition des ventes de la période, selon les paiements déjà effectués.</p></header>
              {amounts && amounts.turnover > 0 ?
                <>
                  <div className="live-doughnut-wrapper">
                    <PaymentDoughnut settled={amounts.settled} outstanding={amounts.outstanding} dark={dark}/>
                    <div className="live-doughnut-center" aria-hidden="true">
                      <small>Ventes</small><strong>{money(amounts.turnover)}</strong>
                    </div>
                  </div>
                  <div className="live-legend">
                    <div><span className="live-legend-dot live-legend-blue"/><span>Déjà réglé sur ces ventes</span><b>{money(amounts.settled)}</b></div>
                    <div><span className="live-legend-dot live-legend-orange"/><span>Reste à recevoir</span><b>{money(amounts.outstanding)}</b></div>
                  </div>
                </> : <p className="live-chart-empty">Aucune vente sur cette période. Le diagramme apparaîtra après une vente.</p>}
            </article>
            <article className="live-chart-panel live-trend-panel">
              <header><h4>Évolution des ventes</h4>
                <p>Ventes et marge brute par jour, d’après les transactions enregistrées.</p></header>
              {data.daily.length ?
                <div className="live-chart-canvas live-line-canvas">
                  <SalesLineChart daily={data.daily} dark={dark}/>
                </div>
                : <p className="live-chart-empty">Aucune vente sur cette période.</p>}
            </article>
            <article className="live-chart-panel live-products-panel">
              <header><h4>Marchandises les plus vendues</h4>
                <p>Top 5 par montant vendu, et non par nombre d’articles.</p></header>
              {data.products.length ?
                <div className="live-chart-canvas live-bars-canvas">
                  <ProductsBarChart products={data.products} dark={dark}/>
                </div>
                : <p className="live-chart-empty">Aucune marchandise vendue sur cette période.</p>}
            </article>
          </div>
          <p className="live-dashboard-disclaimer">
            Chiffre d’affaires et encaissements ne sont pas interchangeables. Le diagramme « déjà réglé »
            concerne les ventes de la période, même si leur paiement a été encaissé plus tard.
            Le résultat présenté reste indicatif et ne constitue pas un bilan fiscal.
          </p>
        </>
      )}
    </section>
  );
}
