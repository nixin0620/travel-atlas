#!/usr/bin/env python3
"""Update known, unmodified app files; preserve user content, origin and configuration."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
MARKER = '.travel-atlas-workspace.json'
PRESERVE = {'travel-plan-seed.js', 'travel-plan-report.json', 'preview-workspace.js'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def app_files(root):
    return {str(p.relative_to(root)): p for p in root.rglob('*') if p.is_file()
            and not any(v.startswith('.') or v in ('tests', '__pycache__') for v in p.relative_to(root).parts)}


def upgrade(destination):
    marker = destination / MARKER
    if destination.is_symlink() or marker.is_symlink():
        raise ValueError('工作目录或标记文件是链接，未修改。')
    meta = json.loads(marker.read_text())
    if meta.get('app') != 'travel-atlas' or meta.get('demo'):
        raise ValueError('请选择个人旅迹工作目录；示例或未知目录未修改。')
    baseline = json.loads((ROOT / 'assets/upgrade-baseline.json').read_text())
    known = meta.get('files') or baseline
    changed = []
    conflicts = []
    files = app_files(ROOT / 'assets/app')
    for name, source in files.items():
        if name in PRESERVE: continue
        target = destination / name
        if target.is_symlink() or any(p.is_symlink() for p in target.parents if p != destination and destination in p.parents):
            conflicts.append(name)
        elif target.exists() and digest(target) == digest(source):
            continue
        elif target.exists() and digest(target) != known.get(name):
            conflicts.append(name)
        else:
            changed.append(name)
    if conflicts:
        raise ValueError('这些文件有自定义修改，未覆盖任何文件：' + '、'.join(conflicts))
    if not changed: return {'updated': 0, 'snapshot': None, 'port': meta.get('port')}
    # Finish a complete, recoverable filesystem snapshot before the first write.
    snapshot = Path(tempfile.mkdtemp(prefix=destination.name+'-before-update-', dir=destination.parent))
    shutil.copytree(destination, snapshot / 'app', symlinks=True)
    try:
        for name in changed:
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_name(target.name + '.update-tmp')
            shutil.copy2(files[name], temporary)
            temporary.replace(target)
        meta['files'] = {name: digest(destination / name) for name in files if (destination / name).is_file()}
        meta['updatedAt'] = datetime.now().isoformat()
        temporary = marker.with_suffix('.tmp')
        temporary.write_text(json.dumps(meta, ensure_ascii=False))
        temporary.replace(marker)
    except Exception:
        for name in changed:
            previous = snapshot / 'app' / name
            target = destination / name
            if previous.exists(): shutil.copy2(previous, target)
            elif target.exists(): target.unlink()
        shutil.copy2(snapshot / 'app' / MARKER, marker)
        raise
    return {'updated': len(changed), 'snapshot': str(snapshot / 'app'), 'port': meta.get('port')}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='保留数据和原端口，更新未经自定义修改的应用文件；请先导出浏览器备份并停止本目录的服务。')
    parser.add_argument('--workspace', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(upgrade(args.workspace.expanduser().absolute()), ensure_ascii=False, indent=2))
    except (OSError, ValueError) as error:
        parser.exit(1, str(error)+'\n')
