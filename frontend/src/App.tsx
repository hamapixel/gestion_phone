import { useEffect, useState } from 'react';
import {
  Bell, Boxes, ChartNoAxesCombined, CheckCircle2, ChevronRight, Cloud,
  CreditCard, LayoutDashboard, Menu, Moon, PackagePlus, ReceiptText,
  Settings2, ShieldCheck, ShoppingCart, Smartphone, Sun, Wallet,
  WifiOff, LogOut, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Products from './Products';

type Page = 'dashboard' | 'checkout' | 'products' | 'purchases' | 'debts' | 'reports' | 'expenses' | 'notifications' | 'settings';
type ApiState = 'connecting' | 'online' | 'offline';
type NavItem = { id: Page; label: string; icon: LucideIcon; description: string };

const nav: NavItem[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, description: 'Les informations essentielles de votre boutique.' },
  { id: 'checkout', label: 'Caisse', icon: ShoppingCart, description: 'Panier intelligent et vente rapide.' },
  { id: 'products', label: 'Produits & stock', icon: Boxes, description: 'Téléphones, pochettes et produits divers.' },
  { id: 'purchases', label: 'Achats & fournisseurs', icon: PackagePlus, description: 'Réapprovisionnements et gestion du stock.' },
  { id: 'debts', label: 'Créances', icon: Wallet, description: 'Suivi des montants à recevoir.' },
  { id: 'reports', label: 'Rapports', icon: ChartNoAxesCombined, description: 'Ventes, bénéfices et périodes.' },
  { id: 'expenses', label: 'Dépenses', icon: ReceiptText, description: 'Suivi simple des charges.' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alertes et événements importants.' },
  { id: 'settings', label: 'Paramètres', icon: Settings2, description: 'Factures, préférences et apparence.' },
];

const goals = [
  { icon: ShieldCheck, title: 'Connexion sécurisée', subtitle: 'Phase 02 · Accès sécurisé actif' },
  { icon: Boxes, title: 'Produits & IMEI', subtitle: 'Phase 03 · Catalogue et stock' },
  { icon: ShoppingCart, title: 'Panier intelligent', subtitle: 'Phase 05 · Caisse et ventes' },
  { icon: CreditCard, title: 'Factures & créances', subtitle: 'Phases 06–07 · Suivi des paiements' },
];

const preferredTheme = (): boolean => {
  try { return localStorage.getItem('phonestock-theme') === 'dark'; }
  catch { return false; }
};

export default function App({ ownerName, onLogout }: { ownerName?: string; onLogout?: () => void }) {
  const [page, setPage] = useState<Page>('dashboard');
  const [dark, setDark] = useState(preferredTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [api, setApi] = useState<ApiState>('connecting');

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('phonestock-theme', dark ? 'dark' : 'light'); }
    catch { /* stockage local non disponible */ }
  }, [dark]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health/', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('API indisponible');
        return response.json() as Promise<{ status: string }>;
      })
      .then((body) => setApi(body.status === 'ok' ? 'online' : 'offline'))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setApi('offline');
      });
    return () => controller.abort();
  }, []);

  function navigate(destination: Page) {
    setPage(destination);
    setMenuOpen(false);
  }

  const selected = nav.find((item) => item.id === page)!;
  const ActiveIcon = selected.icon;

  return (
    <div className="shell">
      {menuOpen && <button className="backdrop" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />}
      <aside className={'sidebar ' + (collapsed ? 'collapsed ' : '') + (menuOpen ? 'open' : '')}>
        <div className="brand">
          <div className="brand-mark"><Smartphone size={23}/></div>
          <div className="brand-name"><strong>PhoneStock <em>Pro</em></strong><small>GESTION COMMERCIALE</small></div>
          <button className="close-menu" aria-label="Fermer" onClick={() => setMenuOpen(false)}><X size={19}/></button>
        </div>
        <div className="menu-divider"/>
        <p className="menu-label">MENU PRINCIPAL</p>
        <nav className="sidebar-nav" aria-label="Navigation principale">
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} title={label} className={'nav-item ' + (page === id ? 'active' : '')} onClick={() => navigate(id)}>
              <Icon size={19} strokeWidth={1.8}/><span>{label}</span>
              {page === id && <ChevronRight size={15} className="nav-arrow"/>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="menu-divider"/>
          <button className="collapse-control" onClick={() => setCollapsed((value) => !value)}><Menu size={19}/><span>Réduire le menu</span></button>
          <p>PhoneStock Pro · Phase 01</p>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <div className="top-left">
            <button className="icon-btn hamburger" aria-label="Ouvrir le menu" onClick={() => setMenuOpen(true)}><Menu size={21}/></button>
            <div><span className="top-eyebrow">ESPACE DE GESTION</span><h1>{selected.label}</h1></div>
          </div>
          <div className="top-actions">
            <div className={'connection ' + (api === 'online' ? 'connected' : 'disconnected')}>
              {api === 'online' ? <Cloud size={15}/> : <WifiOff size={15}/>}
              <span>{api === 'online' ? 'API connectée' : api === 'connecting' ? 'Connexion…' : 'API indisponible'}</span>
            </div>
            <button className="icon-btn" aria-label="Changer le thème" title="Mode jour/nuit" onClick={() => setDark((value) => !value)}>{dark ? <Sun size={20}/> : <Moon size={20}/>}</button>
            <button className="icon-btn" aria-label="Notifications" title="Notifications" onClick={() => navigate('notifications')}><Bell size={20}/></button>
            {onLogout ? (
              <button className="logout-button" title="Se déconnecter" aria-label="Se déconnecter" onClick={onLogout}>
                <LogOut size={18}/><span>Déconnexion</span>
              </button>
            ) : null}
            <div className="avatar" aria-label={ownerName ? 'Connecté : ' + ownerName : 'Profil de démonstration'}>PS</div>
          </div>
        </header>
        <main className="workspace">
          <div className="page-title">
            <div><span className="tag">PHASE 03 · PRODUITS & STOCK</span>
              <h2>{page === 'dashboard' ? 'Bienvenue dans PhoneStock Pro' : selected.label}</h2>
              <p>{page === 'dashboard' ? 'Le logiciel personnel de gestion de votre boutique commence ici.' : selected.description}</p>
            </div>
            <span className="phase-pill"><CheckCircle2 size={15}/> Catalogue actif</span>
          </div>
          {page === 'products' ? (
            <Products />
          ) : page === 'dashboard' ? (
            <>
              <section className="hero">
                <div className="hero-text">
                  <span>UN PROPRIÉTAIRE · PC ET TÉLÉPHONE</span>
                  <h3>Une boutique mieux organisée, <em>sans complexité.</em></h3>
                  <p>Téléphones, pochettes, ventes et créances dans une application élégante. Votre espace est désormais protégé par un compte propriétaire. Les fonctions commerciales arriveront phase par phase.</p>
                  <button onClick={() => navigate('checkout')}>Découvrir la caisse <ChevronRight size={17}/></button>
                </div>
                <Smartphone className="hero-phone" size={136} strokeWidth={1}/>
              </section>
              <div className="section-heading"><h3>Prochaines fonctionnalités</h3><span>Feuille de route du développement</span></div>
              <div className="feature-grid">
                {goals.map(({ icon: Icon, title, subtitle }) => (
                  <article className="feature-card" key={title}><div className="feature-icon"><Icon size={22}/></div><h4>{title}</h4><p>{subtitle}</p></article>
                ))}
              </div>
              <section className="note"><CheckCircle2 size={20}/><div><strong>Accès propriétaire sécurisé</strong><p>L'accès au tableau de bord nécessite une connexion. Les ventes et stocks seront ajoutés dans les phases suivantes.</p></div></section>
            </>
          ) : (
            <section className="placeholder">
              <div className="placeholder-icon"><ActiveIcon size={32}/></div>
              <span className="tag">MODULE EN PRÉPARATION</span>
              <h3>{selected.label}</h3>
              <p>{selected.description} Cette fonctionnalité sera disponible après développement et validation de ses tests.</p>
              <button onClick={() => navigate('dashboard')}>Retour au tableau de bord</button>
            </section>
          )}
        </main>
        <footer>© PhoneStock Pro · Phase 03 — Développement local</footer>
      </div>
      <nav className="bottom-nav" aria-label="Navigation mobile">
        {([
          { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
          { id: 'checkout', label: 'Caisse', icon: ShoppingCart },
          { id: 'products', label: 'Produits', icon: Boxes },
          { id: 'debts', label: 'Créances', icon: Wallet },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} className={page === id ? 'selected' : ''} onClick={() => navigate(id)}><Icon size={21}/><span>{label}</span></button>
        ))}
        <button onClick={() => setMenuOpen(true)}><Menu size={21}/><span>Plus</span></button>
      </nav>
    </div>
  );
}
