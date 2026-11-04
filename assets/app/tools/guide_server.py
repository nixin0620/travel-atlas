#!/usr/bin/env python3
"""Local travel preview, public-share importer and restricted map service.

Run: python3 tools/guide_server.py --port 8787
The importer uses no login cookies or access bypass. Raw share strings and access
tokens only live in request memory. Map credentials stay in .env.local; HTTP
request logging is off.
"""
import argparse
import base64
import errno
import hashlib
import html
import json
import mimetypes
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse as up
import urllib.request as ur
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).parent / 'dot_parser'))
from probe import Page, AccessRestricted, SafeRedirect, public_host, inspect_page, native_metadata
from extract import extract, deduplicate
from place_text import text_places, classify_place, match_images
from place_photos import section_photos
from place_facts import lookup_many
from place_discovery import discover_platforms as discover
import travel_map_service as map_service

BUILD = ROOT / '.guide-build'
LOCK = threading.Lock()
MAX_BODY = 200_000
MAX_IMAGES = 24

class ImportFailure(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message

def sha(value):
    return hashlib.sha256(value).hexdigest()

def normalize(raw, retain_token=True):
    try:
        p = up.urlsplit(html.unescape(raw.strip()))
        if p.scheme not in ('https', 'http') or p.username or p.password or p.port:
            raise ValueError()
        host = p.hostname
        q = up.parse_qs(p.query)
        if host in ('xhslink.com', 'www.xhslink.com') and re.fullmatch(r'/[A-Za-z0-9/_-]{3,120}', p.path):
            return 'https://xhslink.com' + p.path
        if host not in ('www.xiaohongshu.com', 'xiaohongshu.com'):
            raise ValueError()
        if p.path == '/s/dot':
            if not q.get('dot_share_id') or not q.get('file_id'):
                raise ValueError()
            keys = ['dot_share_id', 'file_id', 'shareThemeType']
            path = p.path
        else:
            m = re.fullmatch(r'/(?:explore|discovery/item)/([a-fA-F0-9]{24})/?', p.path)
            if not m:
                raise ValueError()
            path = '/explore/' + m[1].lower()
            keys = ['xsec_token', 'xsec_source'] if retain_token else []
        query = up.urlencode({k: q[k][0] for k in keys if q.get(k)})
        return 'https://www.xiaohongshu.com' + path + ('?' + query if query else '')
    except (ValueError, TypeError):
        raise ImportFailure('invalid_link', '没有识别到完整的小红书攻略链接，请重新复制分享文字。')

def links(text):
    candidates = re.findall(r'https?://[^\s<>"\u3000，。；、！!？）】」』)\]]+', html.unescape(text))
    result = []
    for candidate in candidates:
        candidate = re.split(r'[，。；、！!？）】」』😆]', candidate)[0].rstrip('.,;:) ]')
        try:
            url = normalize(candidate)
        except ImportFailure:
            continue
        if url not in result:
            result.append(url)
    return result

class Redirect(SafeRedirect):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Short links may lead only to the public note/share hosts, never arbitrary URLs.
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def fetch(url, limit):
    opener = ur.build_opener(Redirect())
    request = ur.Request(url, headers={'User-Agent': 'TravelGuideImporter/1.0 (public share reader)', 'Accept-Encoding': 'identity'})
    try:
        with opener.open(request, timeout=25) as response:
            body = response.read(limit + 1)
            if len(body) > limit:
                raise ImportFailure('too_large', '攻略文件超过读取上限，请换一篇较短的攻略。')
            return body, response.url
    except AccessRestricted:
        raise ImportFailure('access_restricted', '这条攻略要求登录或验证，无法自动读取。可以打开原文，复制正文到下方继续导入。')
    except urllib.error.HTTPError as error:
        if error.code in (401, 403, 429, 461, 471):
            raise ImportFailure('access_restricted', '平台限制了公开访问，已停止读取。可以复制正文继续导入。')
        raise ImportFailure('http_failed', '分享页暂时无法打开（HTTP %s）。请检查链接是否仍有效。' % error.code)
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise ImportFailure('network_failed', '没有连接到分享页，请检查网络后重试。')

def note_content(markup, note_id=None):
    """Decode delivered SSR JSON; never execute remote JavaScript."""
    m = re.search(r'window\.__INITIAL_STATE__\s*=\s*', markup)
    if not m:
        return None
    value = markup[m.end():].split('</script>', 1)[0]
    value = re.sub(r'("(?:[^"\\]|\\.)*")|\bundefined\b', lambda m: m.group(1) or 'null', value)
    try:
        state = json.JSONDecoder().raw_decode(value)[0]
        rows = state.get('note', {}).get('noteDetailMap', {})
        for key, row in rows.items():
            note = row.get('note', {})
            if note_id and note_id not in (key.split('?')[0], note.get('noteId'), note.get('id')):
                continue
            if isinstance(note.get('desc'), str) and note.get('title'):
                images = []
                for image in note.get('imageList', []):
                    url = image.get('urlDefault') or image.get('urlPre')
                    if not url:
                        url = next((x.get('url') for x in image.get('infoList', []) if x.get('url')), None)
                    if url and public_host(up.urlsplit(url).hostname):
                        images.append(url.replace('http://', 'https://', 1))
                return {'title': note['title'], 'text': note['desc'], 'images': images, 'type': note.get('type')}
    except (ValueError, AttributeError, TypeError):
        pass
    return None

def binary():
    if sys.platform != 'darwin':
        raise ImportFailure('ocr_unavailable', '长图识别目前需要在 Mac 上启动本地导入服务。')
    BUILD.mkdir(exist_ok=True)
    output = BUILD / 'ocr'
    source = Path(__file__).parent / 'dot_parser' / 'ocr.swift'
    if not output.exists() or output.stat().st_mtime < source.stat().st_mtime:
        run = subprocess.run(['/usr/bin/swiftc', str(source), '-o', str(output), '-module-cache-path', str(BUILD / 'modules')], capture_output=True, timeout=120)
        if run.returncode:
            raise ImportFailure('ocr_unavailable', '本机图像识别组件未能启动，请检查 Swift 工具是否可用。')
    return output

def recognize(image, folder):
    out = folder / 'ocr.json'
    run = subprocess.run([str(binary()), str(image), str(out), str(folder / 'tiles')], capture_output=True, timeout=150)
    if run.returncode or not out.exists():
        raise ImportFailure('ocr_failed', '已取得分享图片，但本机文字识别失败。没有生成地点结果。')
    ocr = json.loads(out.read_text())
    if ocr['source_image_sha256'] != sha(image.read_bytes()):
        raise ImportFailure('ocr_failed', '图片校验失败，已停止导入。')
    return ocr

def image_data(url, folder, index, ocr=False):
    parts = up.urlsplit(url)
    if parts.scheme != 'https' or parts.username or parts.password or parts.port or not public_host(parts.hostname):
        raise ImportFailure('unsafe_image', '攻略图片不在支持的公开图片域名内。')
    data, _ = fetch(url, 30 * 1024 * 1024)
    if not (data.startswith(b'\xff\xd8') or data.startswith(b'\x89PNG') or data.startswith(b'RIFF')):
        raise ImportFailure('invalid_image', '分享图片无法读取。')
    work = folder / str(index); work.mkdir()
    path = work / 'source-image'; path.write_bytes(data)
    recognition = None
    if ocr:
        try: recognition = recognize(path, work)
        except (ImportFailure, subprocess.TimeoutExpired):
            if ocr == 'required': raise
    # Preserve the fetched image, not an enlarged or recompressed derivative.
    # fetch() enforces the existing 30 MB download bound, with an explicit error.
    dimensions = {}
    if sys.platform == 'darwin':
        info = subprocess.run(['/usr/bin/sips','-g','pixelWidth','-g','pixelHeight',str(path)],capture_output=True,text=True,timeout=15)
        dimensions = {key:int(value) for key,value in re.findall(r'pixel(Width|Height):\s*(\d+)',info.stdout)}
    else:
        try:
            from PIL import Image
            with Image.open(path) as image:
                dimensions = {'Width': image.width, 'Height': image.height}
        except ImportError:
            pass
    mime = 'jpeg' if data.startswith(b'\xff\xd8') else 'png' if data.startswith(b'\x89PNG') else 'webp'
    return {'data': 'data:image/'+mime+';base64,' + base64.b64encode(data).decode(), 'sha256': sha(data), 'kind': 'original',
        'width': dimensions.get('Width',0), 'height':dimensions.get('Height',0),
        'ocrText': '\n'.join(r['text'] for r in deduplicate(recognition['observations'])) if recognition else ''}, recognition


def dot_places(ocr, image_path, source, parent, folder):
    places = extract(ocr)['places']
    for p in places: classify_place(p, source.get('title', ''))
    return attach_dot_photos(places, image_path, source, parent, folder, ocr['width'], ocr['height'])

def attach_dot_photos(places, image_path, source, parent, folder, width, height):
    try: photos=section_photos(image_path, places, width, height)
    except (OSError, ValueError): photos={}
    for p in places:
        if p.get('repair') is False:continue
        if len(source['images']) >= MAX_IMAGES: continue
        rect=photos.get(p['rank'])
        method='section_photo_region'
        if not rect:
            # Fall back to the existing POI-card crop when its label is recognized.
            heading=p['evidence'].get('heading_bbox');alias=p['evidence'].get('card_name_bbox')
            if not heading or not alias or not width*.1 < alias[0]-heading[0] < width*.2:continue
            rect=[round(heading[0]),round(alias[1]-width*.02),round(width*.125),round(width*.125)]
            method='poi_card_geometry'
        x,y,cw,ch=rect
        if x<0 or y<0 or x+cw>width or y+ch>height:continue
        target=folder/('place-%d.jpg' % p['rank'])
        run=subprocess.run(['/usr/bin/sips','-s','format','jpeg','--cropToHeightWidth',str(ch),str(cw),'--cropOffset',str(y),str(x),str(image_path),'--out',str(target)],capture_output=True,timeout=25)
        if run.returncode or not target.exists():continue
        data=target.read_bytes()
        if not data.startswith(b'\xff\xd8'):continue
        p['image_indices']=[len(source['images'])]
        source['images'].append({'data':'data:image/jpeg;base64,'+base64.b64encode(data).decode(),
            'sha256':sha(data),'kind':'place_thumbnail','parent_sha256':parent['sha256'],
            'width':cw,'height':ch,'assetId':sha((parent['sha256']+':'+p['name']+':'+','.join(map(str,rect))).encode()),
            'crop':{'x':x,'y':y,'width':cw,'height':ch,'sourceWidth':width,'sourceHeight':height,'method':method}})
    return places


def repair_photos(payload):
    # Local image-only repair: no fetch, no OCR, no changes to names or recommendations.
    image=payload.get('image',{});places=payload.get('places',[])
    data=image.get('data','');width=image.get('width');height=image.get('height')
    if not isinstance(data,str) or len(data)>42000000 or not re.fullmatch(r'data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*',data):
        raise ImportFailure('invalid_source','原图无法读取。')
    if not isinstance(width,int) or not isinstance(height,int) or not 0<width<=12000 or not 0<height<=50000 or width*height>60000000:
        raise ImportFailure('invalid_source','原图尺寸无法确认。')
    if not isinstance(places,list) or not 0<len(places)<=100:raise ImportFailure('invalid_source','地点记录无法读取。')
    ids=set();ranks=set()
    for p in places:
        if not isinstance(p,dict) or not re.fullmatch(r'(dot|sight|food|experience|shopping):[\w-]+',str(p.get('sourceId',''))) or p['sourceId'] in ids or not isinstance(p.get('rank'),int) or p['rank']<1 or p['rank'] in ranks or not isinstance(p.get('name'),str) or len(p['name'])>180:
            raise ImportFailure('invalid_source','地点记录无法读取。')
        ids.add(p['sourceId']);ranks.add(p['rank'])
        if not isinstance(p.get('evidence'),dict):raise ImportFailure('invalid_source','地点图片位置无法确认。')
        for key in ('heading_bbox','card_name_bbox'):
            box=p.get('evidence',{}).get(key)
            if box is not None and (not isinstance(box,list) or len(box)!=4 or any(not isinstance(n,(int,float)) or not 0<=n<=50000 for n in box)):
                raise ImportFailure('invalid_source','地点图片位置无法确认。')
    raw=base64.b64decode(data.split(',',1)[1],validate=True);parent={'sha256':sha(raw)}
    if image.get('sha256')!=parent['sha256']:raise ImportFailure('invalid_source','原图校验失败。')
    with tempfile.TemporaryDirectory(prefix='travel-photo-repair-') as tmp:
        folder=Path(tmp);path=folder/'image';path.write_bytes(raw);source={'images':[]}
        attach_dot_photos(places,path,source,parent,folder,width,height)
    return {'parentSha256':parent['sha256'],'images':source['images'],
        'matches':[{'sourceId':p['sourceId'],'imageIndices':p['image_indices']} for p in places if p.get('image_indices')]}


def note_places(source):
    places = text_places(source['text'], source['title'])
    seen = {re.sub(r'\s+', '', p['name']) for p in places}
    for i, image in enumerate(source['images']):
        for p in text_places(image.get('ocrText', ''), source['title']):
            key = re.sub(r'\s+', '', p['name'])
            if key not in seen and len(places) < 100:
                p['rank'] = len(places) + 1
                p['evidence']['image_index'] = i
                places.append(p); seen.add(key)
    return [classify_place(p, source.get('title', '')) for p in match_images(places, source['images'])]


def reparse_saved(source):
    # Re-read already saved content locally; no network, no folders, no access bypass.
    if not isinstance(source, dict) or not isinstance(source.get('text'), str) or len(source['text']) > 100000:
        raise ImportFailure('invalid_source', '攻略正文格式不正确。')
    url = normalize(source.get('url', ''), retain_token=False)
    images = source.get('images', [])
    if not isinstance(images, list) or len(images) > MAX_IMAGES:
        raise ImportFailure('invalid_source', '攻略图片数量超出上限。')
    s = {'url':url, 'fingerprint':sha(url.encode()), 'title':str(source.get('title','导入攻略'))[:300],
         'text':source['text'], 'kind':source.get('kind','note'), 'method':source.get('method','manual'), 'images':[]}
    found=[]
    with tempfile.TemporaryDirectory(prefix='travel-reread-') as tmp:
        for i,image in enumerate(images):
            data = image.get('data','') if isinstance(image,dict) else ''
            if not isinstance(data,str) or len(data)>42000000 or not re.fullmatch(r'data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*',data):
                raise ImportFailure('invalid_source', '攻略图片格式不正确。')
            if image.get('kind') == 'place_thumbnail': continue
            saved = {k:image[k] for k in ('data','sha256','kind','width','height') if k in image}
            ocr=None
            work = Path(tmp)/str(i); work.mkdir()
            path = work/'image'; path.write_bytes(base64.b64decode(data.split(',',1)[1],validate=True))
            saved['ocrText'] = str(image.get('ocrText',''))[:100000]
            if not saved['ocrText'] or s['kind']=='dot':
                try:
                    ocr = recognize(path, work)
                    saved['ocrText'] = '\n'.join(r['text'] for r in deduplicate(ocr['observations']))
                except (ImportFailure, subprocess.TimeoutExpired): pass
            s['images'].append(saved)
            if ocr and s['kind']=='dot':
                for p in dot_places(ocr,path,s,saved,work):
                    p['rank']=len(found)+1;found.append(p)
    return {'source':s, 'places':found if s['kind']=='dot' else note_places(s), 'warnings':[]}


def parse(raw):
    url = normalize(raw)
    data, final = fetch(url, 8 * 1024 * 1024)
    canonical = normalize(final, retain_token=False)
    markup = data.decode('utf-8', errors='replace')
    page, candidates = inspect_page(markup)
    if re.search(r'请.{0,6}登录后|安全验证|完成验证|访问受限|验证码', '\n'.join(page.text)):
        raise ImportFailure('access_restricted', '页面要求登录或验证，已停止自动读取。可以复制正文继续导入。')
    is_dot = up.urlsplit(canonical).path == '/s/dot'
    result = {'source': {'fingerprint': sha(canonical.encode()), 'url': canonical, 'kind': 'dot' if is_dot else 'note', 'title': '', 'method': '', 'text': '', 'images': []}, 'places': [], 'warnings': []}
    s = result['source']
    with tempfile.TemporaryDirectory(prefix='travel-guide-') as tmp:
        folder = Path(tmp)
        if is_dot:
            meta = native_metadata(page)
            s['title'] = meta.get('title') or '点点攻略'
            if not candidates:
                raise ImportFailure('no_content', '分享页没有返回可读取的攻略长图。')
            if len(candidates) > 4:
                raise ImportFailure('too_many_images', '分享图片超过当前识别上限，未导入不完整结果。')
            texts = []
            for i, image in enumerate(candidates):
                saved, ocr = image_data(image['url'], folder, i, ocr='required')
                s['images'].append(saved)
                texts.append('\n'.join(r['text'] for r in deduplicate(ocr['observations'])))
                found = dot_places(ocr,folder/str(i)/'source-image',s,saved,folder/str(i))
                for place in found:
                    place['rank'] = len(result['places']) + 1
                    result['places'].append(place)
            s['text'] = '\n\n'.join(texts)
            s['method'] = 'ocr'
            result['warnings'].append('长图文字由本机识别，可能有错字；推荐比例保留原文，不代表不同攻略的合计。')
        else:
            note = note_content(markup, up.urlsplit(canonical).path.rsplit('/',1)[-1])
            if not note:
                raise ImportFailure('no_content', '公开页面没有返回完整正文，不能将标题或摘要当作攻略导入。')
            s.update(title=note['title'], text=note['text'], method='native_text')
            for i, image in enumerate(note['images'][:MAX_IMAGES]):
                try:
                    saved, _ = image_data(image, folder, i, ocr=True)
                    s['images'].append(saved)
                except ImportFailure as error:
                    result['warnings'].append(error.message if error.code=='image_too_large' else '部分原图未能读取。')
            if len(note['images']) > MAX_IMAGES:
                result['warnings'].append('已保留前 %s 张原图。' % MAX_IMAGES)
            result['places'] = note_places(s)
            if note['type'] == 'video':
                result['warnings'].append('视频画面与语音未识别。')
            if s['images'] and any(not x.get('ocrText') for x in s['images']):
                result['warnings'].append('部分图片文字未识别，可展开原图核对。')
            if any(x.get('ocrText') for x in s['images']): s['method'] = 'native_text_and_ocr'
    if not result['places']:
        result['warnings'].append('没有可靠识别出地点，请从原文手动补充名称。')
    result['warnings'] = list(dict.fromkeys(result['warnings']))
    return result

class Handler(BaseHTTPRequestHandler):
    server_version = 'TravelGuide/1.0'
    def log_message(self, *args): pass
    def trusted(self):
        return self.headers.get('Host') in ('127.0.0.1:' + str(self.server.server_port), 'localhost:' + str(self.server.server_port))
    def trusted_map_request(self):
        # Script-tag JSONP requests do not send Origin. Fetch Metadata still
        # prevents another website from spending this local account's quota.
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        return (self.trusted() and (not origin or origin == 'http://' + host)
                and self.headers.get('Sec-Fetch-Site') not in ('cross-site', 'same-site'))
    def reply(self, code, body, content='application/json; charset=utf-8'):
        if not isinstance(body, bytes): body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code); self.send_header('Content-Type', content)
        self.send_header('Content-Length', str(len(body))); self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff'); self.send_header('Referrer-Policy', 'no-referrer')
        self.end_headers()
        try: self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError): pass
    def do_GET(self):
        if not self.trusted(): return self.reply(403, {'error':'host_not_allowed'})
        url = up.urlsplit(self.path)
        path = up.unquote(url.path)
        if path.startswith('/api/map/') or path.startswith('/_AMapService/'):
            if not self.trusted_map_request(): return self.reply(403, {'error':'origin_not_allowed'})
            try:
                if path == '/api/map/config':
                    return self.reply(200, map_service.public_config())
                if path.startswith('/_AMapService/'):
                    body, content = map_service.proxy_amap(url.path, url.query, 'http://' + self.headers['Host'] + '/')
                    return self.reply(200, body, content)
                if path in ('/api/map/poi', '/api/map/city'):
                    now = time.monotonic()
                    if path == '/api/map/poi':
                        with map_service.LOCK:
                            last = map_service.LAST_REQUEST.get(self.client_address[0])
                            map_service.LAST_REQUEST[self.client_address[0]] = now
                        if last is not None and now - last < .4:
                            raise map_service.ApiError('搜索过于频繁，请稍后重试。', 429)
                    query = up.parse_qs(url.query, max_num_fields=20)
                    if path == '/api/map/city':
                        return self.reply(200, map_service.resolve_city(query.get('city', [''])[0], query.get('countryCode', [''])[0]))
                    cid = query.get('cityId', [''])[0] or map_service.ALIASES.get(query.get('city', [''])[0], '')
                    if cid in map_service.CITIES:
                        return self.reply(200, map_service.search(query.get('q', [''])[0], cid))
                    center = [float(query['longitude'][0]), float(query['latitude'][0])] if 'longitude' in query and 'latitude' in query else None
                    return self.reply(200, map_service.search(query.get('q', [''])[0], cid, query.get('city', [''])[0], query.get('countryCode', [''])[0], center))
                return self.reply(404, {'error':'not_found'})
            except map_service.ApiError as error:
                return self.reply(error.status, {'candidates':[], 'message':error.message})
            except ValueError:
                return self.reply(400, {'candidates':[], 'message':'地图请求参数无效。'})
        if path == '/api/guide-health': return self.reply(200, {'ready':True, 'ocr':sys.platform == 'darwin', 'service':'travel-guide-import-v1', 'workspace':sha(str(ROOT).encode())[:12]})
        file = ROOT / path.lstrip('/') if path != '/' else ROOT / 'index.html'
        file = file.resolve()
        # This local preview never serves personal orders, logs, cache, tools or backups.
        if ROOT not in file.parents or any(p.startswith('.') or p in ('user-data','recovery','tools','tests','research') for p in file.relative_to(ROOT).parts):
            return self.reply(404, {'error':'not_found'})
        if not file.is_file() or file.suffix.lower() not in ('.html','.js','.css','.json','.svg','.png','.jpg','.jpeg','.webp','.woff','.woff2','.ico'):
            return self.reply(404, {'error':'not_found'})
        self.reply(200, file.read_bytes(), mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
    def do_POST(self):
        host = self.headers.get('Host','')
        if not self.trusted() or self.headers.get('Origin') != 'http://' + host or self.headers.get('X-Travel-Import') != '1':
            return self.reply(403, {'error':'origin_not_allowed'})
        if self.path in ('/api/place-facts', '/api/place-discovery'):
            try:
                size = int(self.headers.get('Content-Length', 0))
                if not 0 < size <= 8000: return self.reply(413, {'error':'invalid_size'})
                payload = json.loads(self.rfile.read(size))
                if not isinstance(payload, dict): raise ValueError()
                return self.reply(200, discover(payload) if self.path == '/api/place-discovery' else lookup_many(payload))
            except (ValueError, TypeError, KeyError):
                return self.reply(400, {'error':'invalid_request'})
            except Exception:
                return self.reply(503, {'error':'source_unavailable'})
        if self.path not in ('/api/guide-import', '/api/guide-reparse', '/api/guide-photos'): return self.reply(404, {'error':'not_found'})
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= (110_000_000 if self.path in ('/api/guide-reparse','/api/guide-photos') else MAX_BODY): return self.reply(413, {'message':'分享文字过长。'})
            payload = json.loads(self.rfile.read(size))
            found = links(payload.get('text','')) if self.path == '/api/guide-import' else []
            if self.path == '/api/guide-import' and len(found) != 1: raise ImportFailure('invalid_link','每次请求应包含一条完整链接。')
            if not LOCK.acquire(blocking=False): return self.reply(409, {'message':'另一个攻略正在读取，请稍后。'})
            try: result = repair_photos(payload) if self.path == '/api/guide-photos' else parse(found[0]) if self.path == '/api/guide-import' else reparse_saved(payload.get('source'))
            finally: LOCK.release()
            self.reply(200, result)
        except ImportFailure as e:
            self.reply(422, {'error':e.code, 'message':e.message})
        except (ValueError, TypeError, KeyError):
            self.reply(400, {'error':'invalid_request','message':'分享内容格式不正确。'})
        except subprocess.TimeoutExpired:
            self.reply(504, {'error':'timeout','message':'本次识别超时，未保存结果。请稍后重试。'})
        except Exception:
            self.reply(500, {'error':'parse_failed','message':'未能解析这条攻略，没有生成地点。可以复制正文继续导入。'})

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--port', type=int, default=8787); ap.add_argument('--open', action='store_true'); args = ap.parse_args()
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError as error:
        if error.errno != errno.EADDRINUSE:
            raise
        # Reopening the launcher should reuse only this project's known service.
        try:
            with ur.urlopen('http://127.0.0.1:%d/api/guide-health' % args.port, timeout=2) as response:
                health = json.load(response)
                existing = health.get('service') == 'travel-guide-import-v1' and health.get('workspace') == sha(str(ROOT).encode())[:12]
        except Exception:
            existing = False
        if not existing:
            print('端口 %d 已被其他程序使用，请改用 --port 指定空闲端口。' % args.port)
            sys.exit(1)
        if args.open and sys.platform == 'darwin':
            subprocess.run(['/usr/bin/open', 'http://127.0.0.1:%d/#destinations' % args.port], check=False)
        print('攻略导入服务已在运行。')
        sys.exit(0)
    print('旅行预览：http://127.0.0.1:%d/#destinations' % args.port, flush=True)
    if args.open and sys.platform == 'darwin':
        subprocess.run(['/usr/bin/open', 'http://127.0.0.1:%d/#destinations' % args.port], check=False)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
