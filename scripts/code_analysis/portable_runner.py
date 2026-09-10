"""Run one scanner inside a read-only-token source job, retaining native evidence."""
import argparse
import importlib.metadata
import json
import re
import subprocess
import sys
from pathlib import Path
from scripts.code_analysis.portable_profile import validate

FAMILIES={'bandit':'Bandit','ruff':'Ruff','radon':'Radon','xenon':'Xenon','vulture':'Vulture','eslint':'ESLint','typescript':'TypeScript','coverage':'Coverage.py','atheris':'Atheris','schemathesis':'Schemathesis','pyright':'Pyright'}
OUTPUTS={'bandit':'bandit-results.json','ruff':'ruff-results.json','radon':'radon-cc.json','xenon':'xenon-results.txt','vulture':'vulture-results.txt','eslint':'eslint-results.json','typescript':'tsc-results.txt','coverage':'coverage.json','schemathesis':'fuzzing-results.xml','pyright':'pyright-results.json'}

def execute(channel, profile, source, output):
    validate(profile);source=source.resolve();output.mkdir(parents=True,exist_ok=True)
    status={'scanner_family':FAMILIES[channel],'status':'FAILED','reason':'Scanner did not produce usable evidence.'}
    def inside(relative):
        p=(source/relative).resolve()
        if not p.is_relative_to(source):raise ValueError('Source path escapes checkout')
        return p
    def run(argv,cwd,stdout=subprocess.DEVNULL):
        return subprocess.run(argv,cwd=cwd,stdout=stdout,stderr=subprocess.STDOUT if stdout != subprocess.DEVNULL else subprocess.DEVNULL,timeout=900).returncode
    try:
        root=profile.get('python_root','.')
        native=output/OUTPUTS.get(channel,'campaign.txt')
        defaults={
            'bandit':[sys.executable,'-m','bandit','-r',root,'-f','json','-o',str(native),'--exit-zero'],
            'ruff':[sys.executable,'-m','ruff','check',root,'--output-format=json','--output-file',str(native),'--exit-zero'],
            'radon':['radon','cc',root,'-j'],
            'xenon':['xenon',root,'--max-absolute','B','--max-modules','B','--max-average','A'],
            'vulture':['vulture',root],
        }
        command=profile.get('commands',{}).get(channel)
        if command:
            cwd=inside(command.get('cwd','.'))
            for install in command.get('install',[]):
                if run(install,cwd)!=0:raise ValueError('Reviewed dependency installation failed')
            if channel in ('typescript','pyright'):
                with native.open('w',encoding='utf-8') as stream:rc=run(command['argv'],cwd,stream)
            else:rc=run(command['argv'],cwd)
            if channel=='coverage':
                status['coverage_exit_code']=run([sys.executable,'-m','coverage','json','-o',str(native)],cwd)
            if channel=='coverage':status['test_exit_code']=rc
            if channel in ('atheris',) and rc==0:
                status.update(status='COMPLETED',reason='Reviewed bounded fuzz harness completed; no exception was reported.')
            elif channel not in ('coverage','typescript','pyright'):
                evidence=inside(str(Path(command.get('cwd','.'))/command.get('output',OUTPUTS.get(channel,''))))
                if evidence.is_file() and evidence.stat().st_size<=50_000_000:
                    native.write_bytes(evidence.read_bytes())
                else:raise ValueError('Reviewed command did not retain its required native report')
        else:
            inside(root)
            if channel in ('bandit','ruff'):rc=run(defaults[channel],source)
            else:
                with native.open('w',encoding='utf-8') as stream:rc=run(defaults[channel],source,stream)
        if native.exists() and (rc in ({0,1,3} if channel=='vulture' else {0,1,2} if channel=='typescript' else {0,1}) or channel=='coverage' and rc>=0):
            if native.suffix=='.json':
                data=json.loads(native.read_text())
                def relative(value):
                    if isinstance(value,str):return value.replace(str(source)+'/', '').replace(str(source)+'\\','')
                    if isinstance(value,list):return [relative(x) for x in value]
                    if isinstance(value,dict):return {relative(k):relative(v) for k,v in value.items()}
                    return value
                native.write_text(json.dumps(relative(data)))
            status.update(status='COMPLETED',reason='Native report retained.' if rc==0 else 'Native report retained; command reported findings or test failures.')
        if channel=='typescript' and native.exists() and command and command.get('cwd','.')!='.':
            prefix=Path(command['cwd']).as_posix().rstrip('/')+'/'
            native.write_text(re.sub(r'^([^\r\n(]+)(\(\d+,\d+\):)',lambda m:prefix+m.group(1)+m.group(2),native.read_text(),flags=re.MULTILINE))
        if channel=='coverage' and not native.exists():status['coverage_exit_code']=1
        try:status['scanner_version']=importlib.metadata.version({'coverage':'coverage'}.get(channel,channel))
        except importlib.metadata.PackageNotFoundError:
            package=inside(str(Path(command.get('cwd','.'))/'node_modules'/channel/'package.json')) if command else None
            status['scanner_version']=json.loads(package.read_text()).get('version','unavailable') if package and package.exists() else 'unavailable'
    except (OSError,ValueError,subprocess.SubprocessError) as error:
        status['reason']=str(error) if isinstance(error,ValueError) else 'Scanner execution failed or timed out.'
    (output/('execution-status.json')).write_text(json.dumps(status))
    return status

def main():
    p=argparse.ArgumentParser();p.add_argument('channel');p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    profile=json.loads((Path(__file__).resolve().parents[2]/'config/code-analysis/service.json').read_text())['profile']
    execute(a.channel,profile,a.source,a.output.resolve())

if __name__=='__main__':main()
