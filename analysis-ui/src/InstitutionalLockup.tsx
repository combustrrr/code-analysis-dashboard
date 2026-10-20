import trustLabLogo from './assets/trustlab-logo.jpg';
import mphasisLogo from './assets/mphasis-logo.jpg';
import './institutional-lockup.css';

export function InstitutionalLockup({href,className=''}:{href:string;className?:string}){
 return <a className={`institutional-lockup ${className}`.trim()} href={href} aria-label="Trust Lab and Mphasis code analysis workspace">
  <img className="institutional-lockup-trustlab" src={trustLabLogo} alt="" aria-hidden="true"/>
  <span className="institutional-lockup-separator" aria-hidden="true"/>
  <img className="institutional-lockup-mphasis" src={mphasisLogo} alt="" aria-hidden="true"/>
 </a>;
}
