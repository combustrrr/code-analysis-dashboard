import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationApi, detectedProfile, validatePortableProfile} from './application.mjs';
import {repositoryApi} from './repository-api.mjs';

test('application facade exposes only the configured repository service', () => {
  assert.equal(applicationApi, repositoryApi);
});

test('profile policy remains a pure reviewed boundary', () => {
  const profile={mode:'portable',python_root:'.',commands:{eslint:{argv:['eslint','.'],cwd:'.'}}};
  assert.doesNotThrow(()=>validatePortableProfile(profile));
  assert.throws(()=>validatePortableProfile({...profile,commands:{eslint:{argv:['eslint','.'],cwd:'../unsafe'}}}),/Invalid command adapter/);
  assert.deepEqual(detectedProfile(['src/main.py','web/index.ts']).profile,{mode:'portable',python_root:'.',javascript_root:'.'});
});

test('portable frontend scanner commands are complete and loopback-only',()=>{
  const profile={mode:'portable',javascript_root:'ui',javascript_install_command:['npm','ci'],javascript_test_command:['npm','test'],frontend_build_command:['npm','run','build'],frontend_preview_command:['npm','run','preview'],frontend_preview_url:'http://127.0.0.1:4178/',frontend_lighthouse_budgets:{performance:.9,accessibility:1,lcp_ms:2500,cls:.1},commands:{}};
  assert.doesNotThrow(()=>validatePortableProfile(profile));
  assert.throws(()=>validatePortableProfile({...profile,frontend_preview_url:'http://example.com/'}),/preview URL/);
  assert.throws(()=>validatePortableProfile({mode:'portable',javascript_root:'ui',frontend_build_command:['npm','run','build']}),/complete reviewed profile/);
});
