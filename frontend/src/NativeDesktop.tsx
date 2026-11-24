import { FormEvent, useEffect, useState } from 'react';
import { Database, Download, HardDrive, LockKeyhole, ShieldCheck, WifiOff } from 'lucide-react';
import OfflinePOS from './OfflinePOS';
import { listPending, lockNativeVault, openPortableTransfer, readCatalog, saveCatalog,
  savePending, setNativeVaultState, unlockVault } from './offlineVault';

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

/** Local native workflow; remote sales/receipt confirmation is intentionally disabled. */
export default function NativeDesktop() {
  const [status, setStatus] = useState<NativeStatus | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [transferPhrase, setTransferPhrase] = useState('');
  const [transferFile, setTransferFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refreshStatus() {
    const value = await call<NativeStatus>('native_vault_status');
    setNativeVaultState(value.unlocked);
    setStatus(value);
  }
  useEffect(() => {
    let alive = true;
    void call<NativeStatus>('native_vault_status')
      .then((value) => {
        if (!alive) return;
        setNativeVaultState(value.unlocked);
        setStatus(value);
      })
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
      await unlockVault(password);
      await refreshStatus();
      setPassword(''); setConfirmation('');
    } catch (err) {
      setError(String(err));
    } finally { setBusy(false); }
  }

  async function lock() {
    setBusy(true); setError('');
    try {
      await lockNativeVault();
      await refreshStatus();
      setTransferPhrase(''); setTransferFile(null); setImportMessage('');
    } catch (err) {
      setError(String(err));
    } finally { setBusy(false); }
  }

  async function importBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (importing || !transferFile) return;
    setError(''); setImportMessage(''); setImporting(true);
    try {
      if (transferFile.size > 10_000_000) throw new Error('Fichier de transfert trop volumineux.');
      const transfer = await openPortableTransfer(await transferFile.text(), transferPhrase);
      const existingCatalog = await readCatalog();
      const existingDrafts = await listPending();
      // An existing catalog is protected against silent replacement.
      if (existingCatalog && transfer.catalog &&
          JSON.stringify(existingCatalog) !== JSON.stringify(transfer.catalog)) {
        throw new Error('Catalogue Windows déjà présent. Le remplacement automatique est désactivé.');
      }
      let imported = 0;
      // Writes are idempotent. Source file and source browser remain unchanged.
      for (const item of transfer.drafts) {
        if (!existingDrafts.some((draft) => draft.id === item.id)) imported++;
        await savePending(item);
      }
      if (!existingCatalog && transfer.catalog) await saveCatalog(transfer.catalog);
      await refreshStatus();
      setReload((current) => current + 1);
      setImportMessage('Import chiffré terminé · ' + imported + ' nouveau(x) brouillon(s). Les ventes restent en attente.');
      setTransferPhrase(''); setTransferFile(null); setImportOpen(false);
    } catch (err) {
      setError(String(err) + ' Les données web ne sont jamais supprimées.');
    } finally { setImporting(false); }
  }

  return (
    <div className="native-root">
      <main className={'native-shell ' + (status?.unlocked ? 'native-shell--active' : '')}>
        <header className="native-header">
          <div className="native-icon"><HardDrive size={25}/></div>
          <div><strong>YaraPhone</strong><small>Application Windows · Stockage sécurisé</small></div>
          {status?.unlocked && <button className="native-header-lock" type="button"
            disabled={busy || importing} onClick={() => void lock()}>
            <LockKeyhole size={16}/> Verrouiller le coffre
          </button>}
        </header>
        {error && <p role="alert" className="catalog-error">{error}</p>}
        {!status ? <p role="status">Vérification du coffre Windows…</p> : !status.unlocked ? (
          <>
            <section className="native-banner">
              <span><Database size={18}/> STOCKAGE LOCAL WINDOWS</span>
              <h1>Coffre SQLite sécurisé</h1>
              <p>Vos données locales sensibles sont chiffrées sur cet ordinateur.</p>
            </section>
            <div className="native-grid">
              <article className="native-panel">
                <h2><LockKeyhole size={20}/> Accès local</h2>
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
              </article>
              <article className="native-panel">
                <h2><ShieldCheck size={20}/> Protections actives</h2>
                <div className="native-feature"><Database size={18}/><span>SQLite locale, migrations versionnées</span></div>
                <div className="native-feature"><LockKeyhole size={18}/><span>AES-256-GCM et clé dérivée par Argon2id</span></div>
                <div className="native-feature"><WifiOff size={18}/><span>Fonctionne sans Internet pour ouvrir le coffre</span></div>
                <p className="native-caution">Les brouillons restent locaux : la synchronisation avec Django et les factures définitives ne sont pas encore activées.</p>
              </article>
            </div>
          </>
        ) : (
          <section className="native-active" aria-label="Caisse native Windows">
            <div className="native-active-toolbar">
              <div className="native-live-status">
                <ShieldCheck size={17}/>
                <span>Coffre SQLite déverrouillé</span>
                <strong>{status.pending_count} brouillon(s)</strong>
              </div>
              <button className="offline-secondary" type="button" disabled={importing}
                onClick={() => setImportOpen((v) => !v)}>
                <Download size={16}/> Importer depuis la version web
              </button>
            </div>
            {importMessage && <p role="status" className="offline-message">{importMessage}</p>}
            {importOpen && <form className="native-import-panel" onSubmit={importBackup}>
              <strong>Importer un transfert YaraPhone chiffré</strong>
              <p>Depuis Hors connexion dans la version web, exporte le fichier chiffré.
                Aucun brouillon web n’est supprimé. Enregistre d’abord ton panier Windows avant d’importer.</p>
              <div className="native-import-fields">
                <label>Fichier de transfert chiffré (.json)
                  <input aria-label="Fichier de transfert chiffré" type="file" required accept=".json,application/json"
                    onChange={(e) => setTransferFile(e.target.files?.[0] ?? null)}/>
                </label>
                <label>Phrase du transfert
                  <input aria-label="Phrase du transfert" type="password" required minLength={12}
                    autoComplete="off" value={transferPhrase} onChange={(e) => setTransferPhrase(e.target.value)}/>
                </label>
              </div>
              <button className="native-primary" type="submit" disabled={importing || busy}>
                {importing ? 'Importation chiffrée…' : 'Importer dans SQLite'}
              </button>
            </form>}
            <OfflinePOS key={reload} onDraftChanged={() => void refreshStatus()}/>
          </section>
        )}
      </main>
    </div>
  );
}
