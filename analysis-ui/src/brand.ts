import {theme,type ThemeConfig} from 'antd';
import type {Appearance} from './Appearance';

export const brand={
 midnight:'#101923',slate:'#1A2632',trustBlue:'#5B7DD1',trustSteel:'#7D9BC3',evidenceCyan:'#28B8D3',
 mphasisMagenta:'#D91668',readyGreen:'#79BE43',signalAmber:'#D89A3D',paper:'#F5F7F8',ink:'#101923'
} as const;

export function applicationTheme(appearance:Appearance):ThemeConfig{
 const dark=appearance==='dark';
 return{
  algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm,
  token:{colorPrimary:brand.mphasisMagenta,colorInfo:brand.trustBlue,colorSuccess:brand.readyGreen,colorLink:dark?'#72D5E6':'#087486',colorLinkHover:dark?'#B7ECF4':'#075563',colorBgBase:dark?brand.midnight:brand.paper,colorBgContainer:dark?brand.slate:'#FFFFFF',colorText:dark?'#F7FAFB':brand.ink,colorTextSecondary:dark?'#C5D0D5':'#3E4D56',colorBorder:dark?'#465762':'#B9C5CB',colorWarning:brand.signalAmber,borderRadius:6,fontFamily:'Manrope, Aptos, "Segoe UI", sans-serif',fontSize:14,fontWeightStrong:700},
  components:{Button:{primaryColor:'#FFFFFF'},Tabs:{inkBarColor:brand.evidenceCyan,itemSelectedColor:dark?'#C6F2F5':'#075C69',itemHoverColor:dark?'#C6F2F5':'#075C69'}}
 };
}
