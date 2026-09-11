"""Promote validated default-branch tooling through a protected, narrowly scoped PR."""
import base64
import json
import os
import re
import subprocess
from scripts.code_analysis import github_service as github

FILES=('.github/code-analysis/projects.json','.github/workflows/code-analysis-reconcile.yml','.github/workflows/code-analysis-source.yml')
PREFIX='tooling-rollout/'

def replacement(files,candidate):
    if not re.fullmatch('[a-f0-9]{40}',candidate):raise ValueError('Immutable tooling required')
    old=json.loads(files[FILES[0]])['tooling_sha']
    if not re.fullmatch('[a-f0-9]{40}',old):raise ValueError('Invalid previous tooling')
    result={name:content.replace(old,candidate) for name,content in files.items()}
    if any(old not in files[name] for name in FILES):raise ValueError('Managed wrappers disagree with approved tooling')
    return result

def relevant(path):
    return path.startswith(('.ci/','scripts/code_analysis/','config/code-analysis/')) or path in ('sonar-project.properties','.github/workflows/reusable-source.yml','.github/workflows/reusable-source-full.yml') or bool(re.fullmatch(r'\.github/workflows/0[1-9]-.*\.yml',path))

def contents(repo,ref):
    return {p:base64.b64decode(github.api(f'repos/{repo}/contents/{p}?ref={ref}')['content']).decode('utf-8') for p in FILES}

def api_repo(repo,path,body=None,method=None):
    return github.api(f'repos/{repo}/{path}',body,method=method) if method else github.api(f'repos/{repo}/{path}',body)

def main():
    repo=os.environ['GITHUB_REPOSITORY'];candidate=os.environ['GITHUB_SHA']
    api=lambda path,body=None,method=None:api_repo(repo,path,body,method)
    meta=github.api('repos/'+repo);branch=meta['default_branch']
    current=api('git/ref/heads/'+branch)['object']['sha']
    if current!=candidate:
        print('Default branch advanced; next reconciliation will validate the new revision.');return
    files=contents(repo,current);old=json.loads(files[FILES[0]])['tooling_sha']
    changed=subprocess.check_output(['git','diff','--name-only',old,current],text=True).splitlines()
    if not any(relevant(p) for p in changed):
        print('Active tooling already contains the current scanner implementation.');return
    pulls=github.pages(f'repos/{repo}/pulls?state=open')
    pending=[p for p in pulls if p['head']['ref'].startswith(PREFIX) and p['head']['repo'] and p['head']['repo']['full_name']==repo]
    if pending:
        pr=pending[0];head=pr['head']['sha'];pin=pr['head']['ref'][len(PREFIX):]
        if not re.fullmatch('[a-f0-9]{40}',pin):raise ValueError('Unrecognized rollout branch')
        # The candidate must remain an ancestor of the trusted default branch.
        subprocess.run(['git','merge-base','--is-ancestor',pin,current],check=True)
        actual=contents(repo,head);expected=replacement(files,pin)
        changed_files=github.pages(f'repos/{repo}/pulls/{pr["number"]}/files')
        if set(p['filename'] for p in changed_files)!=set(FILES) or actual!=expected:
            raise ValueError('Rollout no longer matches exact managed files; review required')
        checks=github.pages(f'repos/{repo}/commits/{head}/check-runs','check_runs')
        passed=any(c['name']=='Scanner compatibility' and c.get('app',{}).get('slug')=='github-actions' and c['head_sha']==head and c['conclusion']=='success' for c in checks)
        if not passed:
            print('Rollout PR awaits exact-head Scanner compatibility.');return
        detail=api(f'pulls/{pr["number"]}')
        if detail.get('mergeable_state')=='behind':
            api(f'pulls/{pr["number"]}/update-branch',{'expected_head_sha':head},'PUT')
            print('Updated rollout branch; fresh checks required.');return
        if detail.get('mergeable_state')!='clean':
            print('Rollout is waiting for remaining branch-protection checks.');return
        result=api(f'pulls/{pr["number"]}/merge',{'sha':head,'merge_method':'squash'},'PUT')
        if not result.get('merged'):raise ValueError('Protected rollout merge was not accepted')
        print('Promoted validated tooling:',pin)
        return
    changed=replacement(files,current)
    tree=api('git/commits/'+current)['tree']['sha']
    newtree=api('git/trees',{'base_tree':tree,'tree':[{'path':p,'mode':'100644','type':'blob','content':v} for p,v in changed.items()]})
    commit=api('git/commits',{'message':'Promote validated scanner tooling '+current[:12],'tree':newtree['sha'],'parents':[current]})
    ref=PREFIX+current
    api('git/refs',{'ref':'refs/heads/'+ref,'sha':commit['sha']})
    pr=api('pulls',{'title':'Promote validated scanner tooling '+current[:12],'head':ref,'base':branch,'body':'Update only managed execution tooling pins to '+current+'. Default-branch scanner tests and canaries passed before proposing this change. Automatic adoption requires exact-head Scanner compatibility and all branch protections.'})
    print('Created protected tooling rollout:',pr['html_url'])

if __name__=='__main__':main()
