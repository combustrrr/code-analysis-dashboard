import {theme,type ThemeConfig} from 'antd';
import type {Appearance} from './Appearance';

export const brand={
 midnight:'#101923',slate:'#1A2632',trustBlue:'#3B82A0',evidenceCyan:'#31A89A',
 mphasisMagenta:'#9E3D69',signalAmber:'#D89A3D',paper:'#F5F7F8',ink:'#101923'
} as const;

export function applicationTheme(appearance:Appearance):ThemeConfig{
 const dark=appearance==='dark';
 return{
  algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm,
  token:{colorPrimary:brand.trustBlue,colorInfo:brand.trustBlue,colorLink:dark?'#72C7C0':'#236D86',colorLinkHover:dark?'#A7DED9':'#194F62',colorBgBase:dark?brand.midnight:brand.paper,colorBgContainer:dark?brand.slate:'#FFFFFF',colorText:dark?'#F1F5F6':brand.ink,colorTextSecondary:dark?'#A8B6BE':'#5D6972',colorBorder:dark?'#34424D':'#D7DEE2',colorWarning:brand.signalAmber,borderRadius:4,fontFamily:'"Instrument Sans", Aptos, "Segoe UI", sans-serif'},
  components:{Button:{primaryColor:'#FFFFFF'},Tabs:{inkBarColor:brand.evidenceCyan,itemSelectedColor:dark?'#C6F2F5':'#075C69',itemHoverColor:dark?'#C6F2F5':'#075C69'}}
 };
}
