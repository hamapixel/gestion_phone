import { useEffect, useState } from 'react';
import App from './App';
import Login from './Login';
import OfflinePOS from './OfflinePOS';
import { hasVault, lockVault } from './offlineVault';

type Session = { authenticated: boolean; owner?: string };
type AuthState = 'loading' | 'logged-out' | 'logged-in' | 'offline';

function csrfCookie(): string {
  const value = document.cookie.split('; ').find((part) => part.startsWith('csrftoken='));
  return value ? decodeURIComponent(value.substring('csrftoken='.length)) : '';
}

async function prepareCsrf(signal?: AbortSignal) {
  const response = await fetch('/api/auth/csrf/', { credentials: 'same-origin', signal });
  if (!response.ok) throw new Error('Impossible de contacter le serveur.');
}

export default function AuthGate() {
  const [state, setState] = useState<AuthState>('loading');
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        await prepareCsrf(controller.signal);
        const response = await fetch('/api/auth/session/', {
          credentials: 'same-origin', signal: controller.signal,
        });
        if (!response.ok) throw new Error('Serveur indisponible.');
        const data = await response.json() as Session;
        if (!controller.signal.aborted) {
          setOwner(data.authenticated ? data.owner ?? '' : '');
          setState(data.authenticated ? 'logged-in' : 'logged-out');
        }
      } catch {
        if (!controller.signal.aborted) {
          // Only expose encrypted local drafts when this browser has already
          // prepared an offline vault. Never bypass Django for online access.
          const prepared = await hasVault().catch(() => false);
          if (controller.signal.aborted) return;
          setError(prepared
            ? 'Serveur indisponible. Seul le coffre local est accessible avec sa phrase secrète.'
            : 'Connexion au serveur impossible. Vérifie que Docker est démarré.');
          setState(prepared ? 'offline' : 'logged-out');
        }
      }
    })();
    return () => controller.abort();
  }, []);

  async function signIn(identifier: string, password: string) {
    setBusy(true);
    setError('');
    try {
      await prepareCsrf();
      const response = await fetch('/api/auth/login/', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfCookie() },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await response.json() as Session & { detail?: string };
      if (!response.ok || !data.authenticated) {
        setError(data.detail ?? 'Connexion impossible. Vérifie tes identifiants.');
        return;
      }
      setOwner(data.owner ?? '');
      setState('logged-in');
    } catch {
      setError('Serveur indisponible. Réessaie lorsque la connexion est rétablie.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      const response = await fetch('/api/auth/logout/', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'X-CSRFToken': csrfCookie() },
      });
      if (!response.ok) throw new Error('Déconnexion refusée');
      lockVault();
      setOwner('');
      setError('');
      setState('logged-out');
    } catch {
      setError('Déconnexion impossible : réessaie lorsque le serveur est accessible.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') {
    return <div className="auth-screen"><div className="auth-loading" role="status">
      <span className="auth-spinner"/>Vérification de votre session…
    </div></div>;
  }
  if (state === 'offline') {
    return <div className="offline-access">
      {error && <p className="offline-session-info">{error}</p>}
      <OfflinePOS standalone/>
    </div>;
  }
  if (state === 'logged-out') {
    return <Login onSubmit={signIn} disabled={busy} error={error}/>;
  }
  return (
    <>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <App ownerName={owner} onLogout={signOut}/>
    </>
  );
}
