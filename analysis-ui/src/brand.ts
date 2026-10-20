import {theme,type ThemeConfig} from 'antd';
import type {Appearance} from './Appearance';

export const brand={
 midnight:'#08131F',slate:'#122432',trustBlue:'#5B7DD1',evidenceCyan:'#42BFD0',
 mphasisMagenta:'#D91668',signalAmber:'#D9A441',paper:'#F4F7FA',ink:'#10212B'
} as const;

export function applicationTheme(appearance:Appearance):ThemeConfig{
 const dark=appearance==='dark';
 return{
  algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm,
  token:{colorPrimary:brand.mphasisMagenta,colorInfo:brand.trustBlue,colorLink:dark?'#7FD8E2':'#087483',colorLinkHover:dark?'#B7EEF3':'#075C69',colorBgBase:dark?brand.midnight:brand.paper,colorBgContainer:dark?brand.slate:'#FFFFFF',colorText:dark?'#EEF5F7':brand.ink,colorTextSecondary:dark?'#9CB1BB':'#526873',colorBorder:dark?'#2D4653':'#CDD8DE',colorWarning:brand.signalAmber,borderRadius:6,fontFamily:'Inter, Aptos, "Segoe UI", sans-serif'},
  components:{Button:{primaryColor:'#FFFFFF'},Tabs:{inkBarColor:brand.evidenceCyan,itemSelectedColor:dark?'#C6F2F5':'#075C69',itemHoverColor:dark?'#C6F2F5':'#075C69'}}
 };
}
