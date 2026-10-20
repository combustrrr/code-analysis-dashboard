# Shared UI components

## Appearance toggle
- Path: `analysis-ui/src/Appearance.tsx`
- Shared dark/light theme provider and segmented theme control.

```tsx
import {Segmented} from 'antd';
import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';

export type Appearance='dark'|'light';
const AppearanceContext=createContext<{appearance:Appearance;setAppearance:(value:Appearance)=>void}|undefined>(undefined);
export function AppearanceProvider({children}:{children:ReactNode}){
 const [appearance,setAppearance]=useState<Appearance>(()=>localStorage.getItem('analysis-theme')==='light'?'light':'dark');
 useEffect(()=>{document.documentElement.dataset.theme=appearance;localStorage.setItem('analysis-theme',appearance);},[appearance]);
 const value=useMemo(()=>({appearance,setAppearance}),[appearance]);
 return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
export function useAppearance(){const value=useContext(AppearanceContext);if(!value)throw new Error('AppearanceProvider is required');return value;}
export function AppearanceToggle({className}:{className?:string}){const {appearance,setAppearance}=useAppearance();return <Segmented className={className} aria-label="Color theme" value={appearance==='dark'?'Dark':'Light'} options={['Dark','Light']} onChange={value=>setAppearance(value==='Light'?'light':'dark')}/>;}
```

## Application theme
- Path: `analysis-ui/src/brand.ts`
- Ant Design token mapping for both themes.

```ts
import {theme,type ThemeConfig} from 'antd';
import type {Appearance} from './Appearance';
export const brand={midnight:'#101923',slate:'#1A2632',trustBlue:'#3B82A0',evidenceCyan:'#31A89A',mphasisMagenta:'#9E3D69',signalAmber:'#D89A3D',paper:'#F5F7F8',ink:'#101923'} as const;
export function applicationTheme(appearance:Appearance):ThemeConfig{const dark=appearance==='dark';return{algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm,token:{colorPrimary:brand.trustBlue,colorInfo:brand.trustBlue,colorLink:dark?'#72C7C0':'#236D86',colorLinkHover:dark?'#A7DED9':'#194F62',colorBgBase:dark?brand.midnight:brand.paper,colorBgContainer:dark?brand.slate:'#FFFFFF',colorText:dark?'#F1F5F6':brand.ink,colorTextSecondary:dark?'#A8B6BE':'#5D6972',colorBorder:dark?'#34424D':'#D7DEE2',colorWarning:brand.signalAmber,borderRadius:6,fontFamily:'Manrope, Aptos, "Segoe UI", sans-serif'},components:{Button:{primaryColor:'#FFFFFF'},Tabs:{inkBarColor:brand.evidenceCyan,itemSelectedColor:dark?'#C6F2F5':'#075C69',itemHoverColor:dark?'#C6F2F5':'#075C69'}}};}
```

Base controls, alerts, tags, tables, progress bars, tabs, drawers, and selects come from Ant Design 6 and are themed through `applicationTheme`.
