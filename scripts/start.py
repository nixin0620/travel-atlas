#!/usr/bin/env python3
"""Copy the bundled app once, then serve it on loopback. No package installation."""
import argparse
import errno
import hashlib
import json
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
MARKER = '.travel-atlas-workspace.json'


def prepare(destination):
    marker = destination / MARKER
    if destination.exists():
        if not marker.is_file():
            raise ValueError('目录已存在且不是旅迹工作目录；请选择新的目录，不会覆盖现有文件。')
        meta = json.loads(marker.read_text())
        if meta.get('app') != 'travel-atlas' or not (destination / 'tools/guide_server.py').is_file():
            raise ValueError('工作目录标识或服务文件不完整，未覆盖任何内容。')
        return
    shutil.copytree(ROOT / 'assets/app', destination)
    marker.write_text(json.dumps({'app': 'travel-atlas', 'version': 1}))


def main():
    if sys.version_info < (3, 10):
        print('需要 Python 3.10 或更新版本。请用已安装的新版本 Python 运行本命令。', file=sys.stderr)
        return 1
    parser = argparse.ArgumentParser(description='启动旅迹本地旅行应用')
    parser.add_argument('--workspace', type=Path, default=Path.cwd() / 'my-travel')
    parser.add_argument('--port', type=int, default=8790)
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--open', action='store_true', help='启动后打开默认浏览器')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('端口必须在 1024–65535 之间。')
    destination = args.workspace.expanduser().resolve()
    try:
        prepare(destination)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print('工作目录：' + str(destination), flush=True)
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
