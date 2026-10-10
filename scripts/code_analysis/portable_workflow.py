"""Generated portable jobs: credentials never accompany reviewed source commands."""
from scripts.code_analysis.generate_source_workflow import CHECKOUT, UPLOAD, PYTHON

JOBS={'python-bandit':['bandit'],'python-ruff':['ruff'],'complexity':['radon','xenon'],'dead-code':['vulture'],'typescript-quality':['eslint','typescript'],'test-coverage':['coverage'],'atheris-state-machine':['atheris'],'schemathesis-fuzz':['schemathesis'],'python-types':['pyright']}

OSV_ACTION = 'google/osv-scanner-action/osv-scanner-action@6e4298ebc4db23e847df9b2e2de2939d6f066c67'

def scanner_jobs():
    result={}
    for job,channels in JOBS.items():
        steps=[{'uses':CHECKOUT,'with':{'ref':'${{ inputs.tooling_sha }}','persist-credentials':False}},
               {'uses':PYTHON,'with':{'python-version':'3.11'}},
               {'name':'Install pinned scanner dependencies','run':'python -m pip install -r .ci/requirements.txt' + (' coverage==7.10.6 pytest==8.4.2' if job=='test-coverage' else ' atheris==2.3.0' if job=='atheris-state-machine' else '')},
               {'uses':CHECKOUT,'with':{'repository':'${{ fromJSON(inputs.target).source_repository }}','ref':'${{ fromJSON(inputs.target).head_sha }}','path':'.source','persist-credentials':False}}]
        for channel in channels:
            steps.append({'name':'Run reviewed '+channel+' adapter','run':f'python -I scripts/code_analysis/trusted_entry.py portable_runner {channel} --source .source --output portable-output/{channel}'})
        steps.append({'uses':UPLOAD,'if':'always()','with':{'name':'portable-'+job,'path':'portable-output/','retention-days':7,'if-no-files-found':'error'}})
        result['portable-'+job]={'name':'Portable '+job,'needs':['identity'],'if':"${{ contains(fromJSON(needs.identity.outputs.jobs), '"+job+"') }}",'runs-on':'ubuntu-latest','timeout-minutes':35,'permissions':{'contents':'read'},'steps':steps}
    result['portable-osv-scanner']={
        'name':'Portable osv-scanner', 'needs':['identity'],
        'if':"${{ contains(fromJSON(needs.identity.outputs.jobs), 'osv-scanner') }}",
        'runs-on':'ubuntu-latest', 'timeout-minutes':20, 'permissions':{'contents':'read'},
        'steps':[
            {'uses': CHECKOUT, 'with': {'ref':'${{ inputs.tooling_sha }}','persist-credentials':False}},
            {'uses': CHECKOUT, 'with': {'repository':'${{ fromJSON(inputs.target).source_repository }}','ref':'${{ fromJSON(inputs.target).head_sha }}','path':'.source','persist-credentials':False}},
            {'name':'Run portable OSV-Scanner', 'continue-on-error':True, 'uses': OSV_ACTION,
             'with': {'scan-args':'--recursive --format=sarif --output=portable-output/osv/osv-results.sarif .source'}},
            {'uses': UPLOAD, 'if':'always()', 'with': {'name':'portable-osv-scanner','path':'portable-output/','retention-days':7,'if-no-files-found':'error'}}
        ]}
    return result
