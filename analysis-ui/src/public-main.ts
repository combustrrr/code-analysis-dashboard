import './landing-fonts.css';
import './document.css';
import './landing.css';
import './landing-dossier.css';
import './brand-landing.css';
import './auth.css';
import './landing-controls.css';
import './institutional-lockup.css';
import './landing-refinement.css';
import './landing-stripe-inspired.css';
import {landingShell} from './landing-shell';
import {beginGitHubSignIn,readSessionHandle} from './authClient';

const callback = new URLSearchParams(location.hash.slice(1));
const needsApplication = location.hash.startsWith('#/') || callback.has('analysis_auth') || callback.has('analysis_auth_error') || Boolean(readSessionHandle());

if (needsApplication) {
  void import('./main');
} else {
  const root = document.getElementById('root');
  if (!root) throw new Error('Application root is missing.');
  root.innerHTML = landingShell();
  const appearance = (() => { try { return localStorage.getItem('analysis-theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } })();
  const setAppearance = (value: 'dark'|'light') => {
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem('analysis-theme', value); } catch {}
    document.querySelectorAll<HTMLButtonElement>('[data-theme-value]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeValue === value)));
  };
  setAppearance(appearance);
  document.querySelectorAll<HTMLButtonElement>('[data-theme-value]').forEach(button => button.addEventListener('click', () => setAppearance(button.dataset.themeValue === 'light' ? 'light' : 'dark')));
  const endpoint = (() => { try { const value = new URL(import.meta.env.VITE_LAUNCH_ENDPOINT || ''); return value.protocol === 'https:' && value.pathname === '/' && !value.search && !value.hash && !value.username && !value.password ? value.origin : undefined; } catch { return undefined; } })();
  const status = document.querySelector<HTMLElement>('.landing-status');
  const actions = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-sign-in]'));
  const announce = (message: string, error = false) => { if (!status) return; status.className = `landing-status${error ? ' landing-error' : ''}`; status.setAttribute('role', error ? 'alert' : 'status'); status.textContent = message; };
  const setPending = (pending: boolean) => actions.forEach(action => { action.disabled = pending || !endpoint; action.textContent = pending ? 'Opening GitHub…' : action.classList.contains('landing-nav-cta') ? 'Sign in with GitHub' : action.closest('.assurance-copy') ? 'Open the workspace →' : 'Sign in with GitHub →'; });
  setPending(false);
  if (!endpoint) announce('GitHub sign-in is temporarily unavailable. Try again shortly.', true);
  const signIn = async () => {
    if (!endpoint) return;
    setPending(true);
    announce('Opening GitHub. Continue securely to confirm your identity.');
    try {
      await beginGitHubSignIn(endpoint);
    } catch {
      setPending(false);
      announce('GitHub sign-in could not start. Try again.', true);
    }
  };
  actions.forEach(action => action.addEventListener('click', () => { void signIn(); }));
}
