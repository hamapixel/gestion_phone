import { FormEvent, useEffect, useState } from 'react';
import { DEFAULT_SHOP, applyBrowserIdentity, normalizedIdentity, type ShopIdentity } from './shopIdentity';
import { Eye, EyeOff, ShieldCheck, Smartphone } from 'lucide-react';

type Props = {
  onSubmit: (identifier: string, password: string) => Promise<void>;
  error: string;
  disabled: boolean;
};

export default function Login({ onSubmit, error, disabled }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [identity, setIdentity] = useState<ShopIdentity>(DEFAULT_SHOP);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/shop/identity/', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Identité indisponible');
        return await response.json() as { identity?: ShopIdentity };
      })
      .then((data) => {
        if (!controller.signal.aborted && data.identity) {
          const next = normalizedIdentity(data.identity);
          setIdentity(next);
          applyBrowserIdentity(next);
        }
      })
      .catch(() => { /* Default branding is kept if the backend is offline. */ });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identifier.trim() || !password || disabled) return;
    await onSubmit(identifier.trim(), password);
  }

  return (
    <div className="auth-screen">
      <section className="auth-card" aria-label="Connexion propriétaire">
        <div className="auth-brand">
          <span className="auth-logo">{identity.logo_data
            ? <img src={identity.logo_data} alt={'Logo ' + identity.name} />
            : <Smartphone size={25}/>}</span>
          <span className="auth-brand-name"><strong>{identity.name}</strong><small>ESPACE BOUTIQUE SÉCURISÉ</small></span>
        </div>
        <h1>Bon retour 👋</h1>
        <p className="auth-subtitle">Connectez-vous à votre espace {identity.name} en toute sécurité.</p>
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-field">
            <label htmlFor="owner-id">Téléphone ou email</label>
            <input id="owner-id" autoComplete="username" value={identifier} maxLength={254}
              onChange={(event) => setIdentifier(event.target.value)} required placeholder="Votre identifiant"/>
          </div>
          <div className="auth-field">
            <label htmlFor="owner-password">Mot de passe</label>
            <div className="auth-password">
              <input id="owner-password" type={reveal ? 'text' : 'password'} value={password}
                onChange={(event) => setPassword(event.target.value)} autoComplete="current-password"
                required placeholder="Votre mot de passe"/>
              <button type="button" onClick={() => setReveal((value) => !value)}
                title={reveal ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                aria-label={reveal ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                {reveal ? <EyeOff size={19}/> : <Eye size={19}/>}
              </button>
            </div>
          </div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={disabled}>
            {disabled ? 'Connexion en cours…' : 'Se connecter'}
          </button>
        </form>
        <p className="auth-help"><ShieldCheck size={13} style={{ verticalAlign: 'middle' }}/> Un seul compte propriétaire par boutique.</p>
        <p className="auth-powered">Propulsé par PhoneStock Pro</p>
      </section>
    </div>
  );
}
