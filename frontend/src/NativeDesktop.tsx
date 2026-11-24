import { FormEvent, useEffect, useState } from 'react';
import { Database, HardDrive, LockKeyhole, ShieldCheck, WifiOff } from 'lucide-react';

declare global {
  interface Window {
    __TAURI__?: {
      core: { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> };
    };
  }
}

type NativeStatus = {
  initialized: boolean; unlocked: boolean;
  pending_count: number; engine: string;
};
const call = <T,>(command: string, args?: Record<string, unknown>) => {
  if (!window.__TAURI__?.core.invoke) throw new Error('Cette fonction nécessite la version Windows.');
  return window.__TAURI__.core.invoke<T>(command, args);
};

export function isNativeWindows() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI__?.core?.invoke);
}

/** Phase 09.1/09.2 native foundation: deliberately NO unverified server sales. */
export default function NativeDesktop() {
  const [status, setStatus] = useState<NativeStatus | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    void call<NativeStatus>('native_vault_status')
      .then((value) => { if (alive) setStatus(value); })
      .catch((err: unknown) => { if (alive) setError(String(err)); });
    return () => { alive = false; };
  }, []);

  async function unlock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!status?.initialized && password !== confirmation) {
      setError('Les deux phrases secrètes doivent être identiques.');
      return;
    }
    setBusy(true); setError('');
    try {
      const result = await call<NativeStatus>('native_unlock', { passphrase: password });
      setStatus(result); setPassword(''); setConfirmation('');
    } catch (err) {
      setError(String(err));
    } finally { setBusy(false); }
  }
  async function lock() {
    setBusy(true); setError('');
    try {
      const result = await call<NativeStatus>('native_lock');
      setStatus(result);
    } catch (err) {
      setError(String(err));
    } finally { setBusy(false); }
  }
  return (
    <div className="native-root">
      <main className="native-shell">
        <header className="native-header">
          <div className="native-icon"><HardDrive size={25}/></div>
          <div><strong>YaraPhone</strong><small>Application Windows · Phase 09</small></div>
        </header>
        <section className="native-banner">
          <span><Database size={18}/> STOCKAGE LOCAL WINDOWS</span>
          <h1>Coffre SQLite sécurisé</h1>
          <p>Vos données locales sensibles sont chiffrées sur cet ordinateur.</p>
        </section>
        {error && <p role="alert" className="catalog-error">{error}</p>}
        {!status ? <p role="status">Vérification du coffre Windows…</p> : (
          <div className="native-grid">
            <article className="native-panel">
              <h2><LockKeyhole size={20}/> {status.unlocked ? 'Coffre déverrouillé' : 'Accès local'}</h2>
              {status.unlocked ? (
                <>
                  <p className="native-success"><ShieldCheck size={17}/> Base SQLite prête et déverrouillée.</p>
                  <div className="native-count"><span>Brouillons chiffrés conservés</span><strong>{status.pending_count}</strong></div>
                  <button type="button" className="native-primary" disabled={busy}
                    onClick={() => void lock()}>Verrouiller le coffre</button>
                </>
              ) : (
                <form className="native-form" onSubmit={unlock}>
                  <label>Phrase secrète locale
                    <input type="password" aria-label="Phrase secrète locale" minLength={12}
                      autoComplete="off" required value={password}
                      onChange={(e) => setPassword(e.target.value)}/>
                  </label>
                  {!status.initialized && <label>Confirmer la phrase secrète
                    <input type="password" aria-label="Confirmer la phrase secrète" minLength={12}
                      autoComplete="off" required value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}/>
                  </label>}
                  <button className="native-primary" disabled={busy} type="submit">
                    {busy ? 'Vérification…' : status.initialized ? 'Déverrouiller' : 'Initialiser le coffre'}
                  </button>
                  <small>Cette phrase n’est jamais envoyée au serveur. Sa perte rend le coffre irrécupérable.</small>
                </form>
              )}
            </article>
            <article className="native-panel">
              <h2><ShieldCheck size={20}/> Protections actives</h2>
              <div className="native-feature"><Database size={18}/><span>SQLite locale, migrations versionnées</span></div>
              <div className="native-feature"><LockKeyhole size={18}/><span>AES-256-GCM et clé dérivée par Argon2id</span></div>
              <div className="native-feature"><WifiOff size={18}/><span>Fonctionne sans Internet pour ouvrir le coffre</span></div>
              <p className="native-caution">Prototype Windows : la caisse, les factures définitives et la synchronisation avec Django seront reliées dans les étapes suivantes. Ne l’utilisez pas encore pour des ventes réelles.</p>
            </article>
          </div>
        )}
      </main>
    </div>
  );
}
