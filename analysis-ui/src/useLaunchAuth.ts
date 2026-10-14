import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const VERIFIER_KEY = 'analysis-auth-verifier';
const RETURN_KEY = 'analysis-auth-return';
const ENDPOINT_KEY = 'analysis-auth-endpoint';

function randomVerifier() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function challengeFor(verifier: string) {
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function pendingAuthDestination() {
  try { return sessionStorage.getItem(RETURN_KEY) || undefined; } catch { return undefined; }
}
function pendingAuthEndpoint() { try { return sessionStorage.getItem(ENDPOINT_KEY) || undefined; } catch { return undefined; } }

export function restoreAuthDestination() {
  try {
    const destination = sessionStorage.getItem(RETURN_KEY);
    if (!destination) return false;
    const target = new URL(destination, location.origin);
    if (target.origin !== location.origin || target.username || target.password) return false;
    sessionStorage.removeItem(RETURN_KEY);
    history.replaceState(null, '', target.pathname + target.search + target.hash);
    window.dispatchEvent(new Event('hashchange'));
    return true;
  } catch { return false; }
}

function friendlyAuthError(code?: string) {
  if (code === 'viewer_not_authorized') return 'This GitHub account is not authorized yet. Ask a dashboard maintainer to invite your account to combustrrr/code-analysis-dashboard, accept the invitation, then retry.';
  if (code === 'cancelled') return 'GitHub sign-in was cancelled. Retry when you are ready.';
  return 'GitHub sign-in could not be completed. Check your connection and retry.';
}

export function useLaunchAuth(endpoint?: string, enabled = true) {
  const [session, setSession] = useState<{ token: string; login: string }>();
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const handledCallback = useRef(false);
  const origin = enabled ? (() => { try { const u = new URL(endpoint || pendingAuthEndpoint() || ''); return u.protocol === 'https:' && u.pathname === '/' && !u.search && !u.hash && !u.username && !u.password ? u.origin : undefined; } catch { return undefined; } })() : undefined;

  useLayoutEffect(() => {
    setSession(undefined);
    if (!origin || handledCallback.current) return;
    const params = new URLSearchParams(location.hash.slice(1));
    const code = params.get('analysis_auth');
    const callbackError = params.get('analysis_auth_error');
    if (!code && !callbackError) return;
    handledCallback.current = true;
    history.replaceState(null, '', location.pathname + location.search);

    const restoreLocation = () => {
      const destination = pendingAuthDestination();
      if (!destination) return;
      try {
        const target = new URL(destination, location.origin);
        if (target.origin === location.origin) history.replaceState(null, '', target.pathname + target.search + target.hash);
      } catch {}
    };
    const fail = (message: string) => {
      try { sessionStorage.removeItem(VERIFIER_KEY); } catch {}
      restoreLocation();
      window.dispatchEvent(new Event('hashchange'));
      setError(message);
    };

    if (callbackError) {
      fail(friendlyAuthError(callbackError));
      return;
    }
    let verifier: string | null = null;
    try { verifier = sessionStorage.getItem(VERIFIER_KEY); } catch {}
    if (!verifier) {
      fail(friendlyAuthError('exchange_invalid'));
      return;
    }
    void fetch(`${origin}/api/auth/redeem`, {
      method: 'POST', cache: 'no-store', credentials: 'omit',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, verifier }),
    }).then(async response => {
      try { sessionStorage.removeItem(VERIFIER_KEY); } catch {}
      let result: { token?: string; login?: string; code?: string } = {};
      try { result = await response.json(); } catch {}
      if (!response.ok || typeof result.token !== 'string' || typeof result.login !== 'string') throw new Error(friendlyAuthError(result.code));
      const verification = await fetch(`${origin}/api/session`, { cache: 'no-store', credentials: 'omit', headers: { Authorization: `Bearer ${result.token}` } });
      let verificationResult: { code?: string } = {};
      try { verificationResult = await verification.json(); } catch {}
      if (!verification.ok) throw new Error(friendlyAuthError(verificationResult.code));
      setSession({ token: result.token, login: result.login });
      setVerified(true);
      setError('');
      restoreAuthDestination();
    }).catch(reason => fail(reason instanceof Error ? reason.message : friendlyAuthError())).finally(() => {
      try { sessionStorage.removeItem(VERIFIER_KEY); } catch {}
    });
  }, [origin]);

  const signIn = useCallback(() => {
    if (!origin) return;
    void (async () => {
      try {
        const verifier = randomVerifier();
        const challenge = await challengeFor(verifier);
        if (!pendingAuthDestination()) sessionStorage.setItem(RETURN_KEY, location.pathname + location.search + location.hash);
        sessionStorage.setItem(VERIFIER_KEY, verifier);
        sessionStorage.setItem(ENDPOINT_KEY, origin);
        setError('');
        location.assign(`${origin}/auth/login?challenge=${encodeURIComponent(challenge)}`);
      } catch {
        setError(friendlyAuthError());
      }
    })();
  }, [origin]);

  const api = useCallback(async function api<T>(path: string, body?: unknown): Promise<T> {
    if (!origin || !session) throw new Error('Sign in to view dashboard data.');
    const response = await fetch(`${origin}/api/${path}`, { method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit',
      headers: { Authorization: `Bearer ${session.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) {
      const authFailure = ['viewer_not_authorized','session_invalid','exchange_invalid','exchange_expired','exchange_store_unavailable','oauth_exchange_failed','oauth_state_mismatch'].includes(result.code || '');
      if (response.status === 401 || ['viewer_not_authorized','session_invalid'].includes(result.code || '')) {
        setSession(undefined);
        setVerified(false);
        window.dispatchEvent(new Event('analysis-access-denied'));
      }
      throw new Error(authFailure ? friendlyAuthError(result.code) : typeof result.error === 'string' ? result.error : `Dashboard request failed (${response.status}).`);
    }
    return result as T;
  }, [origin, session]);
  const signOut = useCallback(() => {
    setSession(undefined);
    setVerified(false);
    setError('');
    try { sessionStorage.removeItem(VERIFIER_KEY); sessionStorage.removeItem(RETURN_KEY); sessionStorage.removeItem(ENDPOINT_KEY); } catch {}
  }, []);
  return useMemo(() => ({ available: !!origin, session, verified, error, signIn, signOut, api }), [origin, session, verified, error, signIn, signOut, api]);
}
