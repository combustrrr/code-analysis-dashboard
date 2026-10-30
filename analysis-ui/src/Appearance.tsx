import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Appearance = 'dark' | 'light';
export type WorkspaceDensity = 'comfortable' | 'compact';
export type MotionPreference = 'system' | 'reduced';
export type DefaultIssueGrouping = 'none'|'category'|'rule'|'file'|'directory'|'scanner';

type AppearanceContextValue = {
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
  density: WorkspaceDensity;
  setDensity: (density: WorkspaceDensity) => void;
  motion: MotionPreference;
  setMotion: (motion: MotionPreference) => void;
  issueGrouping: DefaultIssueGrouping;
  setIssueGrouping: (grouping: DefaultIssueGrouping) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | undefined>(undefined);

function savedAppearance(): Appearance {
  try {
    return localStorage.getItem('analysis-theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}
function savedChoice<T extends string>(key:string,allowed:readonly T[],fallback:T):T{try{const value=localStorage.getItem(key) as T;return allowed.includes(value)?value:fallback}catch{return fallback}}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(savedAppearance);
  const [density,setDensity]=useState<WorkspaceDensity>(()=>savedChoice('analysis-density',['comfortable','compact'] as const,'comfortable'));
  const [motion,setMotion]=useState<MotionPreference>(()=>savedChoice('analysis-motion',['system','reduced'] as const,'system'));
  const [issueGrouping,setIssueGrouping]=useState<DefaultIssueGrouping>(()=>savedChoice('analysis-issue-grouping',['none','category','rule','file','directory','scanner'] as const,'none'));

  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
    try {
      localStorage.setItem('analysis-theme', appearance);
    } catch {
      // Theme still applies for this page view when storage is unavailable.
    }
  }, [appearance]);
  useEffect(()=>{document.documentElement.dataset.density=density;try{localStorage.setItem('analysis-density',density)}catch{}},[density]);
  useEffect(()=>{document.documentElement.dataset.motion=motion;try{localStorage.setItem('analysis-motion',motion)}catch{}},[motion]);
  useEffect(()=>{try{localStorage.setItem('analysis-issue-grouping',issueGrouping)}catch{}},[issueGrouping]);

  return <AppearanceContext.Provider value={{appearance,setAppearance,density,setDensity,motion,setMotion,issueGrouping,setIssueGrouping}}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('AppearanceProvider is required.');
  return value;
}
export const useWorkspacePreferences=useAppearance;

export function AppearanceToggle({ className = '' }: { className?: string }) {
  const { appearance, setAppearance } = useAppearance();
  return <div className={`appearance-toggle ${className}`.trim()} role="group" aria-label="Color theme">
    {(['dark','light'] as Appearance[]).map(value=><button type="button" key={value} aria-pressed={appearance===value} onClick={()=>setAppearance(value)}>{value[0].toUpperCase()+value.slice(1)}</button>)}
  </div>;
}
