import {describe,expect,it} from 'vitest';
import {decodeProjectRegister,reconcileRegister} from './projectRegister';

const entry=(overrides:Record<string,unknown>={})=>({id:'1',source_repository:'owner/repo',source_repository_id:1,relationship:'observer',preferred_branch:'main',lifecycle:'Ready',published_sha:'a'.repeat(40),head_sha:'a'.repeat(40),display_revision:'aaaaaaa',revision_comparison:'MATCHED',primary_action:{type:'REVIEW_EVIDENCE',label:'Review evidence',project_id:'1',disabled:false,reason:'Published'},secondary_action:null,...overrides});
const register=(projects:unknown[]= [entry()])=>({schema_version:'project-register-v1',checked_at:'2026-10-30T00:00:00.000Z',refresh_after_seconds:90,execution_repository:{id:2,full_name:'owner/control'},capabilities:{launch:true,configure:false},summary:{projects:projects.length,preparing:0,analyzing:0,needs_attention:0},projects});

describe('project-register-v1 decoder',()=>{
 it('validates the versioned envelope and semantic action',()=>{const decoded=decodeProjectRegister(register());expect(decoded.projects[0].primary_action?.type).toBe('REVIEW_EVIDENCE');expect(decoded.projects[0].published_sha).toHaveLength(40);});
 it('isolates a malformed project without discarding healthy siblings',()=>{const decoded=decodeProjectRegister(register([entry(),entry({id:'2',published_sha:'short'})]));expect(decoded.projects[0].source_repository).toBe('owner/repo');expect(decoded.projects[1].configuration_error).toBe(true);});
 it('fails closed on an unknown schema version',()=>{expect(()=>decodeProjectRegister({...register(),schema_version:'project-register-v2'})).toThrow(/unsupported/);});
 it('preserves object identity for unchanged cards',()=>{const first=decodeProjectRegister(register()),second=decodeProjectRegister(register()),reconciled=reconcileRegister(first,second);expect(reconciled.projects[0]).toBe(first.projects[0]);});
});
