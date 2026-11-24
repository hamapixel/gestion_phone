import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Mail, Save, ShieldCheck, UserRound } from 'lucide-react';

type Owner = {
  username: string; first_name: string; last_name: string;
  display_name: string; email: string; date_joined: string;
  last_login: string | null; role: string;
};
function csrf(): string {
  const part = document.cookie.split('; ').find((item) => item.startsWith('csrftoken='));
  return part ? decodeURIComponent(part.slice('csrftoken='.length)) : '';
}
async function result(response: Response) {
  const data = await response.json() as { detail?: string; profile?: Owner; updated?: boolean };
  if (!response.ok) throw new Error(data.detail || 'Opération impossible.');
  return data;
}
const shortDate = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  : 'Non disponible';

export default function OwnerProfile() {
  const [profile, setProfile] = useState<Owner | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [saved, setSaved] = useState('');
  const [passwordSaved, setPasswordSaved] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/account/profile/', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(result)
      .then((data) => {
        if (controller.signal.aborted || !data.profile) return;
        setProfile(data.profile);
        setFirstName(data.profile.first_name);
        setLastName(data.profile.last_name);
        setEmail(data.profile.email);
      }).catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Profil indisponible.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(''); setSaved('');
    try {
      const response = await fetch('/api/account/profile/', {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
        body: JSON.stringify({
          first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim(),
        }),
      });
      const data = await result(response);
      if (!data.profile) throw new Error('Le serveur n’a pas renvoyé le profil.');
      setProfile(data.profile);
      setFirstName(data.profile.first_name); setLastName(data.profile.last_name); setEmail(data.profile.email);
      setSaved('Informations de votre compte enregistrées.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally { setSaving(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changing) return;
    setPasswordSaved(''); setPasswordError('');
    if (newPassword !== confirmation) {
      setPasswordError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    setChanging(true);
    try {
      const response = await fetch('/api/account/password/', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      await result(response);
      setCurrentPassword(''); setNewPassword(''); setConfirmation('');
      setPasswordSaved('Mot de passe modifié. Votre session actuelle reste ouverte.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Modification refusée.');
    } finally { setChanging(false); }
  }

  return (
    <section className="account-page" aria-label="Mon profil de propriétaire">
      {loading && <p className="catalog-empty">Chargement du compte propriétaire…</p>}
      {!loading && !profile && <p role="alert" className="catalog-error">{error || 'Le profil est indisponible.'}</p>}
      {profile && (
        <>
          <div className="account-identity">
            <div className="account-monogram"><UserRound size={29}/></div>
            <div>
              <span className="account-eyebrow"><ShieldCheck size={14}/> COMPTE UNIQUE ET SÉCURISÉ</span>
              <h3>{profile.display_name}</h3>
              <p><strong>{profile.role}</strong> · Identifiant : {profile.username}</p>
              <small>Compte créé le {shortDate(profile.date_joined)}</small>
            </div>
          </div>
          <div className="account-grid">
            <form className="account-panel" onSubmit={save}>
              <header className="account-panel-heading"><UserRound size={20}/>
                <div><h4>Mes informations</h4><p>Les coordonnées du propriétaire, distinctes de celles de la boutique.</p></div>
              </header>
              <label>Identifiant de connexion
                <input aria-label="Identifiant de connexion" type="text" value={profile.username} disabled/>
              </label>
              <div className="account-two-col">
                <label>Prénom
                  <input aria-label="Prénom" maxLength={150} autoComplete="given-name"
                    value={firstName} disabled={saving} onChange={(e) => setFirstName(e.target.value)}/>
                </label>
                <label>Nom
                  <input aria-label="Nom" maxLength={150} autoComplete="family-name"
                    value={lastName} disabled={saving} onChange={(e) => setLastName(e.target.value)}/>
                </label>
              </div>
              <label><span><Mail size={14}/> Email du compte</span>
                <input aria-label="Email du compte" type="email" maxLength={254} autoComplete="email"
                  value={email} disabled={saving} onChange={(e) => setEmail(e.target.value)}/>
              </label>
              <p className="account-note">Le nom de votre boutique et le logo se règlent séparément dans Paramètres. Votre identifiant de connexion reste inchangé.</p>
              {error && <p className="catalog-error" role="alert">{error}</p>}
              {saved && <p className="account-success" role="status"><CheckCircle2 size={16}/>{saved}</p>}
              <button className="account-primary" type="submit" disabled={saving}>
                <Save size={17}/>{saving ? 'Enregistrement…' : 'Enregistrer mon profil'}
              </button>
            </form>
            <form className="account-panel" onSubmit={changePassword}>
              <header className="account-panel-heading"><KeyRound size={20}/>
                <div><h4>Sécurité du compte</h4><p>Modifiez votre mot de passe sans créer de deuxième compte.</p></div>
              </header>
              <label>Mot de passe actuel
                <input aria-label="Mot de passe actuel" type={visible ? 'text' : 'password'}
                  autoComplete="current-password" required value={currentPassword}
                  disabled={changing} onChange={(e) => setCurrentPassword(e.target.value)}/>
              </label>
              <label>Nouveau mot de passe
                <input aria-label="Nouveau mot de passe" type={visible ? 'text' : 'password'}
                  autoComplete="new-password" minLength={12} required value={newPassword}
                  disabled={changing} onChange={(e) => setNewPassword(e.target.value)}/>
              </label>
              <label>Confirmer le nouveau mot de passe
                <input aria-label="Confirmer le nouveau mot de passe" type={visible ? 'text' : 'password'}
                  autoComplete="new-password" minLength={12} required value={confirmation}
                  disabled={changing} onChange={(e) => setConfirmation(e.target.value)}/>
              </label>
              <button type="button" className="account-reveal" aria-pressed={visible}
                onClick={() => setVisible((x) => !x)}>
                {visible ? <EyeOff size={16}/> : <Eye size={16}/>}
                {visible ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
              </button>
              <p className="account-note">Choisissez au moins 12 caractères. Le serveur vérifie le mot de passe actuel et applique les règles de sécurité Django.</p>
              {passwordError && <p className="catalog-error" role="alert">{passwordError}</p>}
              {passwordSaved && <p className="account-success" role="status"><CheckCircle2 size={16}/>{passwordSaved}</p>}
              <button className="account-primary" type="submit" disabled={changing}>
                <ShieldCheck size={17}/>{changing ? 'Vérification…' : 'Changer le mot de passe'}
              </button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
