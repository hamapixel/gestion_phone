import { FormEvent, useState } from 'react';
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identifier.trim() || !password || disabled) return;
    await onSubmit(identifier.trim(), password);
  }

  return (
    <div className="auth-screen">
      <section className="auth-card" aria-label="Connexion propriétaire">
        <div className="auth-brand">
          <span className="auth-logo"><Smartphone size={25}/></span>
          <span><strong>PhoneStock <em>Pro</em></strong><small>GESTION COMMERCIALE</small></span>
        </div>
        <h1>Bon retour 👋</h1>
        <p className="auth-subtitle">Connectez-vous à votre boutique en toute sécurité.</p>
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
      </section>
    </div>
  );
}
