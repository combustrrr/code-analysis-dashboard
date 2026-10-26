import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

const VERIFIER_KEY = 'analysis-auth-verifier';
const RETURN_KEY = 'analysis-auth-return';
const ENDPOINT_KEY = 'analysis-auth-endpoint';
const SIGNED_IN_HOME = '#/projects';
type ProjectRegistry = { execution_repository: { id: number; full_name: string }; projects: Array<{ id: string | number }>; [key:string]: unknown };
export class DashboardApiError extends Error {
  status:number;code?:string;
  constructor(message:string,status:number,code?:string){super(message);this.name='DashboardApiError';this.status=status;this.code=code;}
}

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
  if (code === 'viewer_not_authorized' || code === 'not_authorized') return 'This GitHub account is not authorized yet. Ask a dashboard maintainer to invite your account to combustrrr/code-analysis-dashboard, accept the invitation, then retry.';
  if (code === 'cancelled') return 'GitHub sign-in was cancelled. Retry when you are ready.';
  return 'The GitHub sign-in expired or was interrupted. Start sign-in again.';
}

export function useLaunchAuth(endpoint?: string, enabled = true) {
  const [session, setSession] = useState<{ token: string; login: string; registry?: ProjectRegistry }>();
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [pending, setPending] = useState(() => {
    const params = new URLSearchParams(location.hash.slice(1));
    return params.has('analysis_auth') || params.has('analysis_auth_error');
  });
  const [stage, setStage] = useState<'idle' | 'redirecting' | 'exchanging' | 'verifying'>(() => {
    const params = new URLSearchParams(location.hash.slice(1));
    return params.has('analysis_auth') || params.has('analysis_auth_error') ? 'exchanging' : 'idle';
  });
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

    const fail = (message: string) => {
      try { sessionStorage.removeItem(VERIFIER_KEY); } catch {}
      setError(message);
      setPending(false);
      setStage('idle');
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
      setStage('verifying');
      const destination = pendingAuthDestination();
      let requestedProject: { repository: string | null; id: string } | undefined;
      let workspaceDestination = false;
      if (destination) {
        try {
          const target = new URL(destination, location.origin);
          const rawHash = target.hash.slice(1);
          const modern = rawHash.startsWith('/') ? rawHash.slice(1) : '';
          const [modernPath, modernQuery = ''] = modern.split('?', 2);
          const modernParts = modernPath.split('/').filter(Boolean);
          const parameters = new URLSearchParams(modern ? modernQuery : rawHash);
          const project = modernParts[0] === 'projects' && /^\d+$/.test(modernParts[1] || '') ? modernParts[1] : parameters.get('project');
          workspaceDestination = target.origin === location.origin && modernParts[0] === 'projects';
          if (target.origin === location.origin && project) requestedProject = { repository: parameters.get('repository'), id: project };
        } catch {}
      }
      const authHeaders={Authorization:`Bearer ${result.token}`};
      const verificationPromise=fetch(`${origin}/api/session`,{cache:'no-store',credentials:'omit',headers:authHeaders});
      const registryPromise=workspaceDestination?fetch(`${origin}/api/projects`,{cache:'no-store',credentials:'omit',headers:authHeaders}).catch(()=>null):undefined;
      const [verification,registryResponse]=await Promise.all([verificationPromise,registryPromise]);
      let verificationResult: { code?: string } = {};
      try { verificationResult = await verification.json(); } catch {}
      if (!verification.ok) throw new Error(friendlyAuthError(verificationResult.code));
      let registry: ProjectRegistry | undefined;
      if (registryResponse) {
        if (!registryResponse.ok) {
          let failure: {code?:string}={};try{failure=await registryResponse.json();}catch{}
          if(registryResponse.status===401||registryResponse.status===403)throw new Error(friendlyAuthError(failure.code));
          if(requestedProject)throw new Error('Configured projects could not be verified. Retry sign-in.');
        } else {
          let candidate: Partial<ProjectRegistry> = {};
          try { candidate = await registryResponse.json(); } catch {}
          if (!Number.isSafeInteger(candidate.execution_repository?.id) || !candidate.execution_repository?.full_name || !Array.isArray(candidate.projects)) {
            throw new Error('The configured project registry could not be verified. Retry sign-in.');
          }
          registry = candidate as ProjectRegistry;
        }
      }
      if (requestedProject) {
        if (!registry) throw new Error('Configured projects could not be verified. Check your connection and retry.');
        const repositoryMismatch = requestedProject.repository != null
          && requestedProject.repository.toLowerCase() !== registry.execution_repository.full_name.toLowerCase();
        if (repositoryMismatch || !registry.projects.some(value => String(value.id) === requestedProject.id)) {
          try { sessionStorage.removeItem(RETURN_KEY); } catch {}
          throw new Error('The requested project is no longer configured. Retry sign-in and choose a current project.');
        }
      }
      setSession({ token: result.token, login: result.login, registry });
      setVerified(true);
      setError('');
      setPending(false);
      setStage('idle');
      restoreAuthDestination();
    }).catch(reason => fail(reason instanceof Error ? reason.message : friendlyAuthError())).finally(() => {
      try { sessionStorage.removeItem(VERIFIER_KEY); } catch {}
    });
  }, [origin]);

  const signIn = useCallback(() => {
    if (!origin || pending) return;
    setPending(true);
    setStage('redirecting');
    void (async () => {
      try {
        const verifier = randomVerifier();
        const challenge = await challengeFor(verifier);
        // Authentication always enters through the project register. A project may
        // only be opened after the user has seen and selected it from that registry.
        sessionStorage.setItem(RETURN_KEY, location.pathname + location.search + SIGNED_IN_HOME);
        sessionStorage.setItem(VERIFIER_KEY, verifier);
        sessionStorage.setItem(ENDPOINT_KEY, origin);
        setError('');
        location.assign(`${origin}/auth/login?challenge=${encodeURIComponent(challenge)}`);
      } catch {
        setError(friendlyAuthError());
        setPending(false);
        setStage('idle');
      }
    })();
  }, [origin, pending]);

  const api = useCallback(async function api<T>(path: string, body?: unknown, extraHeaders: Record<string,string> = {}): Promise<T> {
    if (!origin || !session) throw new Error('Sign in to view dashboard data.');
    const response = await fetch(`${origin}/api/${path}`, { method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit',
      headers: { Authorization: `Bearer ${session.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) {
      const authFailure = ['viewer_not_authorized','session_invalid','exchange_invalid','exchange_expired','exchange_store_unavailable','oauth_exchange_failed','oauth_state_mismatch'].includes(result.code || '');
      if (['viewer_not_authorized','session_invalid'].includes(result.code || '')) {
        window.dispatchEvent(new CustomEvent('analysis-access-denied',{detail:{code:result.code}}));
      }
      throw new DashboardApiError(authFailure ? friendlyAuthError(result.code) : typeof result.error === 'string' ? result.error : `Dashboard request failed (${response.status}).`,response.status,result.code);
    }
    return result as T;
  }, [origin, session]);
  const signOut = useCallback(() => {
    const handle = session?.token;
    setSession(undefined);
    setVerified(false);
    setPending(false);
    setStage('idle');
    setError('');
    try { sessionStorage.removeItem(VERIFIER_KEY); sessionStorage.removeItem(RETURN_KEY); sessionStorage.removeItem(ENDPOINT_KEY); } catch {}
    if (origin && handle) void fetch(`${origin}/api/logout`, { method:'POST', cache:'no-store', credentials:'omit', headers:{Authorization:`Bearer ${handle}`}}).catch(()=>{});
  }, [origin, session]);
  return useMemo(() => ({ available: !!origin, session, verified, pending, stage, error, signIn, signOut, api }), [origin, session, verified, pending, stage, error, signIn, signOut, api]);
}
