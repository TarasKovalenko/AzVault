import { useEffect, useState } from 'react';
import commandView from '../img/azvault-command-view.png';
import mainView from '../img/azvault-main-view.png';
import secretView from '../img/azvault-secret-view.png';
import appIcon from './assets/azvault-icon.png';
import { Icon } from './components/ui/Icon';

const REPOSITORY = 'https://github.com/TarasKovalenko/AzVault';
const RELEASES = `${REPOSITORY}/releases/latest`;

const views = [
  {
    id: 'explore',
    label: 'Vault explorer',
    detail: 'Browse vaults and resources',
    image: mainView,
    alt: 'AzVault desktop app showing an Azure Key Vault dashboard',
  },
  {
    id: 'secrets',
    label: 'Secret detail',
    detail: 'Inspect metadata safely',
    image: secretView,
    alt: 'AzVault secret details with metadata and version history',
  },
  {
    id: 'command',
    label: 'Command palette',
    detail: 'Move fast from the keyboard',
    image: commandView,
    alt: 'AzVault command palette open over the desktop interface',
  },
] as const;

const features = [
  {
    icon: <Icon name="lock" size={24} />,
    title: 'Secrets without the sprawl',
    text: 'Create, inspect, import, export, recover, and purge secrets from one focused workspace.',
    index: '01',
  },
  {
    icon: <Icon name="key" size={24} />,
    title: 'Keys in context',
    text: 'Move between tenants, subscriptions, and vaults without losing your place or your train of thought.',
    index: '02',
  },
  {
    icon: <Icon name="certificate" size={24} />,
    title: 'Certificates, clearly',
    text: 'See status and metadata at a glance in a dense interface built for real operational work.',
    index: '03',
  },
  {
    icon: <Icon name="search" size={24} />,
    title: 'Keyboard first',
    text: 'Open the command palette with ⌘K or Ctrl+K and get anywhere without hunting through menus.',
    index: '04',
  },
] as const;

function App() {
  const [activeView, setActiveView] = useState<(typeof views)[number]['id']>('explore');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const selectedView = views.find((view) => view.id === activeView) ?? views[0];

  useEffect(() => {
    const closeMenu = () => setMobileMenuOpen(false);
    window.addEventListener('resize', closeMenu);
    return () => window.removeEventListener('resize', closeMenu);
  }, []);

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="AzVault home">
          <img src={appIcon} alt="" />
          <span>AzVault</span>
        </a>
        <button
          className="menu-button"
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
        <nav className={mobileMenuOpen ? 'nav-links nav-links--open' : 'nav-links'}>
          <a href="#features">Features</a>
          <a href="#security">Security</a>
          <a href="#workflow">How it works</a>
          <a className="nav-github" href={REPOSITORY} target="_blank" rel="noreferrer">
            <Icon name="code" size={20} /> GitHub
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> Azure Key Vault, without the portal maze</div>
            <h1>Your vaults.<br /><em>One clear view.</em></h1>
            <p className="hero-lede">
              A fast, open-source desktop explorer for Azure Key Vault. Browse secrets, keys,
              and certificates with the Azure CLI identity you already use.
            </p>
            <div className="hero-actions">
              <a className="button button--primary" href={RELEASES}>
                <Icon name="download" size={24} /> Download AzVault
              </a>
              <a className="text-link" href={REPOSITORY} target="_blank" rel="noreferrer">
                View source <Icon name="arrow-right" size={20} />
              </a>
            </div>
            <div className="platform-line">
              <span><Icon name="desktop" size={15} /> macOS</span>
              <span>Windows</span>
              <span>Linux</span>
              <span className="platform-line__note">Free · MIT licensed</span>
            </div>
          </div>

          <div className="hero-product">
            <div className="window-shadow" />
            <div className="app-window">
              <div className="window-bar">
                <div className="traffic-lights"><i /><i /><i /></div>
                <span>AzVault — Production</span>
                <div className="window-status"><i /> CLI connected</div>
              </div>
              <img src={mainView} alt="AzVault desktop explorer showing a vault dashboard" />
            </div>
            <aside className="safety-note">
              <Icon name="shield" size={24} />
              <div><strong>Local by design</strong><span>No refresh tokens stored.</span></div>
            </aside>
          </div>
        </section>

        <section className="signal-strip" aria-label="Product principles">
          <p><span>01</span> Native desktop speed</p>
          <p><span>02</span> Azure CLI authentication</p>
          <p><span>03</span> Built in the open</p>
        </section>

        <section className="product-story" id="features">
          <div className="section-heading">
            <p className="kicker">Built for the work between deployments</p>
            <h2>Less portal.<br />More <em>control.</em></h2>
          </div>
          <p className="section-intro">
            AzVault turns a multi-step cloud workflow into a quiet, focused desktop tool. No
            browser tabs. No context switching. Just the resources you came to manage.
          </p>

          <div className="feature-grid">
            {features.map((feature) => (
              <article className="feature" key={feature.title}>
                <div className="feature-top"><span>{feature.icon}</span><small>{feature.index}</small></div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="showcase" aria-labelledby="showcase-title">
          <div className="showcase-copy">
            <p className="kicker">One workspace, every resource</p>
            <h2 id="showcase-title">Designed to stay<br />out of your way.</h2>
            <div className="view-tabs" role="tablist" aria-label="Application views">
              {views.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  role="tab"
                  aria-selected={activeView === view.id}
                  className={activeView === view.id ? 'view-tab view-tab--active' : 'view-tab'}
                  onClick={() => setActiveView(view.id)}
                >
                  <span>{view.label}</span>
                  <small>{view.detail}</small>
                  <Icon name="arrow-right" size={20} />
                </button>
              ))}
            </div>
          </div>
          <div className="showcase-screen" role="tabpanel">
            <div className="screen-label"><i /> LIVE PRODUCT VIEW</div>
            <img key={selectedView.id} src={selectedView.image} alt={selectedView.alt} />
          </div>
        </section>

        <section className="security" id="security">
          <div className="security-mark" aria-hidden="true"><Icon name="lock" size={44} /></div>
          <div className="security-copy">
            <p className="kicker">Security is the product</p>
            <h2>Trust the identity<br />you already have.</h2>
            <p>
              AzVault authenticates through your local Azure CLI session and asks Azure for
              short-lived access tokens. Secret values and refresh tokens are never persisted by
              the app.
            </p>
            <a className="text-link text-link--light" href={`${REPOSITORY}/blob/main/SECURITY.md`}>
              Read the security model <Icon name="external" size={18} />
            </a>
          </div>
          <ul className="security-list">
            <li><Icon name="check" size={20} /><span><strong>Short-lived access</strong>Tokens come directly from Azure CLI.</span></li>
            <li><Icon name="check" size={20} /><span><strong>Sanitized audit trail</strong>Useful local history without secret values.</span></li>
            <li><Icon name="check" size={20} /><span><strong>Explicit reveal</strong>Sensitive values stay hidden until requested.</span></li>
            <li><Icon name="check" size={20} /><span><strong>Open-source core</strong>Inspect the code and threat model yourself.</span></li>
          </ul>
        </section>

        <section className="workflow" id="workflow">
          <div className="section-heading">
            <p className="kicker">From login to vault in three steps</p>
            <h2>Keep your<br /><em>existing flow.</em></h2>
          </div>
          <ol className="steps">
            <li>
              <span>01</span><Icon name="terminal" size={24} />
              <div><h3>Sign in with Azure CLI</h3><code>az login</code></div>
            </li>
            <li>
              <span>02</span><Icon name="code" size={24} />
              <div><h3>Open AzVault</h3><p>Connect with the active CLI session.</p></div>
            </li>
            <li>
              <span>03</span><Icon name="lock" size={24} />
              <div><h3>Choose a vault</h3><p>Start browsing. Nothing else to configure.</p></div>
            </li>
          </ol>
        </section>

        <section className="download">
          <img src={appIcon} alt="AzVault app icon" />
          <div><p className="kicker">Open source · cross-platform</p><h2>Your vaults are<br />ready when you are.</h2></div>
          <a className="button button--light" href={RELEASES}><Icon name="download" size={24} /> Get AzVault</a>
        </section>
      </main>

      <footer>
        <a className="brand brand--footer" href="#top"><img src={appIcon} alt="" /><span>AzVault</span></a>
        <p>Built in Ukraine. Made for Azure operators everywhere.</p>
        <div><a href={`${REPOSITORY}/blob/main/PRIVACY_POLICY.md`}>Privacy</a><a href={`${REPOSITORY}/blob/main/LICENSE`}>License</a><a href={REPOSITORY}>GitHub</a></div>
      </footer>
    </div>
  );
}

export default App;
