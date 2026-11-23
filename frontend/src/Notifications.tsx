import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, Box, RefreshCw, Wallet } from 'lucide-react';
type Notice = {
  id: string; kind: 'stock' | 'debt'; level: 'info' | 'warning';
  title: string; description: string; target: 'products' | 'debts';
};
type AlertList = { results: Notice[]; count: number; limit: number; generated_at: string; mode: string };
export default function Notifications({ onNavigate }: { onNavigate: (page: 'products' | 'debts') => void }) {
  const [list, setList] = useState<AlertList | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/notifications/', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as AlertList & { detail?: string };
        if (!response.ok) throw new Error(data.detail || 'Notifications indisponibles.');
        if (!controller.signal.aborted) { setList(data); setError(''); }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Erreur serveur.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  return (
    <section className="phase7-page notification-page">
      <div className="phase7-section-heading">
        <div><h3><Bell size={20}/> Alertes de la boutique</h3>
          <p>Stocks faibles et créances en retard ou proches de leur échéance.</p></div>
        <button className="phase7-secondary" onClick={() => setRefresh((old) => old + 1)}>
          <RefreshCw size={16}/> Actualiser
        </button>
      </div>
      <p className="phase7-disclaimer">Les alertes sont calculées à l'ouverture et à chaque actualisation. Elles ne sont pas des notifications poussées lorsque l'application est fermée.</p>
      {error && <p className="catalog-error" role="alert">{error}</p>}
      {loading ? <p className="catalog-empty">Chargement des alertes…</p> :
        list && (list.results.length ? (
          <div className="phase7-alert-grid">
            {list.results.map((item) => (
              <article className={'phase7-alert-card ' + item.level} key={item.id}>
                <div className="phase7-alert-icon">{item.kind === 'stock' ? <Box size={20}/> : <Wallet size={20}/>}</div>
                <div><strong>{item.title}</strong><p>{item.description}</p></div>
                <button type="button" className="phase7-secondary" onClick={() => onNavigate(item.target)}>
                  Voir {item.target === 'products' ? 'le stock' : 'la créance'}
                </button>
              </article>
            ))}
          </div>
        ) : <div className="phase7-empty-panel"><AlertTriangle size={22}/> Aucune alerte active.</div>)}
      {list && <small className="phase7-alert-caption">{list.count} alerte(s) · Maximum {list.limit} affichées</small>}
    </section>
  );
}
