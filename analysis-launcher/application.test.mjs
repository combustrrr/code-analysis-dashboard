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
