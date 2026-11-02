#!/usr/bin/env python3
"""Copy the bundled app once, then serve it on loopback. No package installation."""
import argparse
import errno
import hashlib
import json
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
MARKER = '.travel-atlas-workspace.json'


def prepare(destination, demo=False):
    marker = destination / MARKER
    if destination.exists():
        if not marker.is_file():
            raise ValueError('目录已存在且不是旅迹工作目录；请选择新的目录，不会覆盖现有文件。')
        meta = json.loads(marker.read_text())
        if meta.get('app') != 'travel-atlas' or not (destination / 'tools/guide_server.py').is_file():
            raise ValueError('工作目录标识或服务文件不完整，未覆盖任何内容。')
        if bool(meta.get('demo', False)) != demo:
            raise ValueError('示例与个人工作目录不可混用；请选择新的目录，现有文件和数据未修改。')
        return
    # Prepare the demo transformations before copying, so incompatible bundles
    # cannot leave a partially configured demo workspace.
    demo_html = demo_preview = None
    if demo:
        fixture = json.loads((ROOT / 'assets/demo/journey.json').read_text(encoding='utf-8'))
        source = (ROOT / 'assets/app/index.html').read_text(encoding='utf-8')
        demo_html, count = re.subn(
            r'(<script\b[^>]*\bid="journey-seed"[^>]*>).*?(</script>)',
            lambda m: m[1] + json.dumps(fixture, ensure_ascii=False) + m[2], source, flags=re.S)
        if count != 1:
            raise ValueError('找不到唯一行程入口，未创建示例目录。')
        # Earlier </body> strings belong to the backup export's HTML template.
        head, closing, tail = demo_html.rpartition('</body>')
        if not closing:
            raise ValueError('页面结构不完整，未创建示例目录。')
        demo_html = head + '<script src="public-demo.js"></script>' + closing + tail
        original = (ROOT / 'assets/app/preview-workspace.js').read_text(encoding='utf-8')
        if original.count("scope: 'travel-atlas-public-v1'") != 1:
            raise ValueError('找不到独立存储入口，未创建示例目录。')
        demo_preview = original.replace("scope: 'travel-atlas-public-v1'", "scope: 'travel-atlas-demo-v1'")
    shutil.copytree(ROOT / 'assets/app', destination)
    if demo:
        (destination / 'index.html').write_text(demo_html, encoding='utf-8')
        (destination / 'preview-workspace.js').write_text(demo_preview, encoding='utf-8')
        shutil.copyfile(ROOT / 'assets/demo/public-demo.js', destination / 'public-demo.js')
    marker.write_text(json.dumps({'app': 'travel-atlas', 'version': 1, 'demo': demo}))


def main():
    if sys.version_info < (3, 10):
        print('需要 Python 3.10 或更新版本。请用已安装的新版本 Python 运行本命令。', file=sys.stderr)
        return 1
    parser = argparse.ArgumentParser(description='启动旅迹本地旅行应用')
    parser.add_argument('--workspace', type=Path)
    parser.add_argument('--port', type=int)
    parser.add_argument('--demo', action='store_true', help='独立的云南示例旅行，不写入个人数据')
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--open', action='store_true', help='启动后打开默认浏览器')
    args = parser.parse_args()
    if args.workspace is None:
        args.workspace = Path.cwd() / ('travel-demo' if args.demo else 'my-travel')
    if args.port is None:
        args.port = 8791 if args.demo else 8790
    if not 1024 <= args.port <= 65535:
        parser.error('端口必须在 1024–65535 之间。')
    destination = args.workspace.expanduser().resolve()
    try:
        prepare(destination, demo=args.demo)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print('工作目录：' + str(destination), flush=True)
    if args.demo:
        print('示例体验：日期与住宿均为演示安排，未预订；已去过、回忆和照片保持为空。', flush=True)
    if args.prepare_only:
        return 0
    url = 'http://127.0.0.1:' + str(args.port)
    try:
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', args.port))
    except OSError as error:
        if error.errno != errno.EADDRINUSE:
            print('无法开启本地监听：' + str(error), file=sys.stderr)
            return 1
        try:
            with urllib.request.urlopen(url + '/api/guide-health', timeout=2) as response:
                health = json.load(response)
            expected = hashlib.sha256(str(destination).encode()).hexdigest()[:12]
            if health.get('service') != 'travel-guide-import-v1' or health.get('workspace') != expected:
                raise ValueError()
        except Exception:
            print('端口已被其他服务占用。请换一个 --port；未停止或修改该服务。', file=sys.stderr)
            return 1
        print('旅迹已在运行：' + url + '/#route')
        if args.open:
            webbrowser.open(url + '/#route')
        return 0
    print('预览：' + url + '/#route\n保持此终端运行；按 Ctrl+C 停止。', flush=True)
    if args.open:
        # Opening after the server answers avoids a first-load connection error.
        import threading
        import time
        def open_when_ready():
            for _ in range(30):
                try:
                    with urllib.request.urlopen(url + '/api/guide-health', timeout=.5):
                        webbrowser.open(url + '/#route')
                        return
                except OSError:
                    time.sleep(.2)
        threading.Thread(target=open_when_ready, daemon=True).start()
    try:
        return subprocess.call([sys.executable, str(destination / 'tools/guide_server.py'), '--port', str(args.port)])
    except KeyboardInterrupt:
        return 0


if __name__ == '__main__':
    sys.exit(main())
