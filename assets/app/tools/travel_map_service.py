"""Local map configuration, restricted AMap SDK proxy and POI candidates.

Called by guide_server.py. Secrets are read from this project's .env.local or
process environment, and are never returned to browser configuration responses.
"""
import json
import math
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG_NAMES = {'TRAVEL_AMAP_JS_KEY', 'TRAVEL_AMAP_SECURITY_JSCODE', 'TRAVEL_AMAP_WEB_KEY'}


def load_local_config(path):
    """Read only known literal settings. Never execute or interpolate dotenv text."""
    result = {}
    try:
        lines = path.read_text(encoding='utf-8').splitlines()
    except OSError:
        return result
    for line in lines:
        name, separator, value = line.partition('=')
        name, value = name.strip(), value.strip()
        if not separator or name not in CONFIG_NAMES:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        if value and len(value) <= 256 and not any(ord(c) < 33 for c in value):
            result[name] = value
    return result


LOCAL_CONFIG = load_local_config(ROOT / '.env.local')


def setting(name):
    return os.environ.get(name, LOCAL_CONFIG.get(name, '')).strip()


# Exact endpoints used by the current official JS SDK (initialisation, vector
# tiles, coordinate conversion and PlaceSearch), plus its optional search helpers.
# Hosts are fixed below: this must never become a general URL proxy.
AMAP_REST_PATHS = frozenset({
    '/v3/log/init', '/v3/vectormap', '/v3/indoor/indoormaps',
    '/v3/assistant/coordinate/convert', '/v3/assistant/inputtips',
    '/v3/config/district', '/v3/geocode/geo', '/v3/geocode/regeo',
    '/v3/place/text', '/v3/place/around', '/v3/place/polygon', '/v3/place/detail',
})
AMAP_STYLE_PATHS = frozenset({'/v4/map/styles', '/v4/map/styles2', '/v4/map/styles/ispublic'})
PROXY_SLOTS = threading.BoundedSemaphore(12)
PROXY_LIMIT = 8_000_000
CALLBACK_PATTERN = re.compile(r'[$A-Za-z_][$A-Za-z0-9_]*(?:\.[$A-Za-z_][$A-Za-z0-9_]*)*\Z')
# Broad administrative-area bounds constrain search, not evidence of POI identity.
CITIES = {
    'banna': {'name': '西双版纳', 'adcode': '532800', 'bbox': (99.8, 21.0, 101.9, 22.8), 'center': (100.8, 22.0)},
    'puer': {'name': '普洱', 'adcode': '530800', 'bbox': (99.0, 22.0, 102.4, 24.9), 'center': (100.97, 22.78)},
    'yuxi': {'name': '玉溪', 'adcode': '530400', 'bbox': (101.2, 23.3, 103.1, 24.95), 'center': (102.54, 24.35)},
    'kunming': {'name': '昆明', 'adcode': '530100', 'bbox': (102.0, 24.2, 103.8, 26.6), 'center': (102.71, 25.04)},
}
ALIASES = {'西双版纳': 'banna', '西双版纳州': 'banna', '景洪': 'banna', '景洪市': 'banna',
           '普洱': 'puer', '普洱市': 'puer', '玉溪': 'yuxi', '玉溪市': 'yuxi', '昆明': 'kunming', '昆明市': 'kunming'}
CACHE = {}
LOCK = threading.Lock()
UPSTREAM_SLOTS = threading.BoundedSemaphore(2)
LAST_REQUEST = {}


class ApiError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


def configured():
    return bool(setting('TRAVEL_AMAP_WEB_KEY'))


def js_configured():
    return bool(setting('TRAVEL_AMAP_JS_KEY') and setting('TRAVEL_AMAP_SECURITY_JSCODE'))


def public_config():
    use_js = js_configured()
    return {'provider': 'amap' if use_js else 'leaflet',
            'poiProvider': 'amap' if use_js or configured() else 'photon',
            'amapConfigured': configured(), 'amapJsConfigured': use_js,
            'jsKey': setting('TRAVEL_AMAP_JS_KEY') if use_js else '',
            'message': '已配置高德地图。' if use_js else '当前使用 OpenStreetMap。'}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ApiError('地图服务地址发生变化，请稍后重试。', 502)


def amap_proxy_url(path, query):
    if not js_configured():
        raise ApiError('尚未配置高德地图。', 503)
    if not path.startswith('/_AMapService/'):
        raise ApiError('不支持此地图服务。', 404)
    endpoint = path[len('/_AMapService'):]
    if endpoint in AMAP_STYLE_PATHS:
        host = 'https://webapi.amap.com'
    elif endpoint in AMAP_REST_PATHS:
        host = 'https://restapi.amap.com'
    else:
        raise ApiError('不支持此地图服务。', 404)
    if len(query) > 24_000:
        raise ApiError('地图请求过长。', 414)
    try:
        incoming = urllib.parse.parse_qsl(query, keep_blank_values=True, max_num_fields=120)
    except ValueError:
        raise ApiError('地图请求无效。') from None
    params = []
    callback_seen = False
    for name, value in incoming:
        # A client must not choose another account's key or security code.
        if name.lower() in ('key', 'jscode', 'securityjscode'):
            continue
        if not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}', name) or any(ord(c) < 32 for c in value):
            raise ApiError('地图请求参数无效。')
        if name.lower() in ('callback', 'jsonp', 'cb'):
            if (callback_seen or len(value) > 160 or not CALLBACK_PATTERN.fullmatch(value)
                    or any(part in ('__proto__', 'prototype', 'constructor') for part in value.split('.'))):
                raise ApiError('地图回调无效。')
            callback_seen = True
        params.append((name, value))
    params.extend([('key', setting('TRAVEL_AMAP_JS_KEY')), ('jscode', setting('TRAVEL_AMAP_SECURITY_JSCODE'))])
    return host + endpoint + '?' + urllib.parse.urlencode(params)


def validated_jsonp(body, query):
    """A JSONP response is executable only for the exact requested callback."""
    callbacks = [value for name, value in urllib.parse.parse_qsl(query)
                 if name.lower() in ('callback', 'jsonp', 'cb')]
    if not callbacks:
        return False
    if len(callbacks) != 1 or not CALLBACK_PATTERN.fullmatch(callbacks[0]):
        raise ApiError('地图回调无效。', 502)
    try:
        text = body.decode('utf-8').strip()
        match = re.fullmatch(re.escape(callbacks[0]) + r'\s*\((.*)\)\s*;?', text, flags=re.DOTALL)
        if not match:
            raise ValueError('Callback mismatch')
        json.loads(match.group(1))
    except (UnicodeError, ValueError, TypeError):
        raise ApiError('地图服务回调格式无效。', 502) from None
    return True


def proxy_diagnostic(path, query=None, body=None):
    """Opt-in diagnostics include no URLs, coordinates, signatures or credentials."""
    if os.environ.get('TRAVEL_MAP_DIAGNOSTICS') != '1':
        return
    result = {'path': path}
    if query is not None:
        params = urllib.parse.parse_qs(query, keep_blank_values=True)
        result['parameter_names'] = sorted(params)
        for name in ('s', 'platform', 'output', 'coordsys'):
            value = params.get(name, [''])[0]
            if re.fullmatch(r'[A-Za-z0-9_.-]{0,32}', value):
                result[name] = value
    if body is not None:
        text = body[:100_000].decode('utf-8', 'replace')
        for name in ('status', 'info', 'infocode'):
            match = re.search(r'["\']' + name + r'["\']\s*:\s*["\']?([A-Za-z0-9_ -]{1,80})', text)
            if match:
                value = match.group(1).strip()
                if value not in {setting(key) for key in CONFIG_NAMES}:
                    result[name] = value
    output = json.dumps(result, ensure_ascii=True)
    for name in CONFIG_NAMES:
        secret = setting(name)
        if secret:
            output = output.replace(secret, '[redacted]')
    print('AMap proxy ' + output, file=sys.stderr, flush=True)


def proxy_amap(path, query, referer):
    url = amap_proxy_url(path, query)
    proxy_diagnostic(path, query=query)
    if not PROXY_SLOTS.acquire(blocking=False):
        raise ApiError('地图请求较多，请稍后重试。', 429)
    try:
        request = urllib.request.Request(url, headers={
            'User-Agent': 'TravelGuideMap/1.0', 'Accept': '*/*',
            'Accept-Encoding': 'identity', 'Referer': referer,
        })
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=15) as response:
            body = response.read(PROXY_LIMIT + 1)
            content_type = response.headers.get('Content-Type', 'application/octet-stream')
        if len(body) > PROXY_LIMIT:
            raise ApiError('地图响应过大，请缩小查看范围。', 502)
        # Even unexpected upstream diagnostic responses must not reflect secrets.
        secret = setting('TRAVEL_AMAP_SECURITY_JSCODE').encode()
        if secret:
            body = body.replace(secret, b'[redacted]')
        proxy_diagnostic(path, body=body)
        mime = content_type.split(';', 1)[0].strip().lower()
        allowed = {'application/json', 'application/javascript', 'text/javascript',
                   'application/x-javascript', 'application/octet-stream',
                   'application/x-protobuf', 'application/vnd.google.protobuf', 'text/plain'}
        if mime not in allowed:
            raise ApiError('地图服务返回格式无效。', 502)
        # AMap sends JSONP with application/json. Browsers correctly block that
        # under nosniff, so adjust only after validating callback and JSON payload.
        if validated_jsonp(body, query):
            mime = 'application/javascript'
        return body, mime + ('; charset=utf-8' if mime != 'application/octet-stream' and 'protobuf' not in mime else '')
    except ApiError:
        raise
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        # Upstream URLs contain credentials: never log or expose exception text.
        raise ApiError('高德地图暂时无法连接，请稍后重试。', 502) from None
    finally:
        PROXY_SLOTS.release()


def fetch_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'TravelGuideMap/1.0 (local travel planner)', 'Accept': 'application/json'})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=12) as response:
            body = response.read(1_000_001)
        if len(body) > 1_000_000:
            raise ApiError('地图服务返回过多数据，请缩小搜索范围。', 502)
        return json.loads(body)
    except ApiError:
        raise
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        # Exception strings may contain upstream URLs/API keys. Never expose them.
        raise ApiError('地点搜索暂时不可用，请稍后重试；原有地点和位置不会改变。', 502) from None


def valid_coords(lat, lng):
    return (isinstance(lat, (int, float)) and not isinstance(lat, bool)
            and isinstance(lng, (int, float)) and not isinstance(lng, bool)
            and math.isfinite(lat) and math.isfinite(lng) and abs(lat) <= 90 and abs(lng) <= 180)


def within_city(lat, lng, city):
    a, b, c, d = city['bbox']
    return valid_coords(lat, lng) and a <= lng <= c and b <= lat <= d


def words(value):
    return value.strip()[:400] if isinstance(value, str) else ''


def photon_candidates(payload, city):
    out, seen = [], set()
    for item in payload.get('features', []) if isinstance(payload, dict) else []:
        if not isinstance(item, dict):
            continue
        prop, geo = item.get('properties') or {}, item.get('geometry') or {}
        if not isinstance(prop, dict) or not isinstance(geo, dict):
            continue
        coords = geo.get('coordinates') or []
        if geo.get('type') != 'Point' or not isinstance(coords, list) or len(coords) < 2:
            continue
        lng, lat = coords[:2]
        typ, oid = str(prop.get('osm_type', '')).upper(), str(prop.get('osm_id', ''))
        # Administrative centroids are not a matched sight/restaurant entrance.
        if typ not in ('N', 'W', 'R') or not re.fullmatch(r'\d+', oid) or not within_city(lat, lng, city):
            continue
        if prop.get('countrycode', '').upper() not in ('CN', '') or prop.get('osm_key') in ('boundary', 'place'):
            continue
        name = words(prop.get('name'))
        pid = f'osm:{typ}:{oid}'
        if not name or pid in seen:
            continue
        seen.add(pid)
        address = ' · '.join(dict.fromkeys(filter(None, [words(prop.get(k)) for k in ('state', 'county', 'city', 'district', 'street', 'housenumber')])))
        out.append({'id': pid, 'name': name, 'address': address, 'city': city['name'], 'lat': lat, 'lng': lng,
                    'coordinateSystem': 'WGS84', 'source': 'OpenStreetMap / Photon', 'match': 'candidate',
                    'sourceURL': 'https://www.openstreetmap.org/' + {'N': 'node', 'W': 'way', 'R': 'relation'}[typ] + '/' + oid})
    return out[:6]


def amap_candidates(payload, city):
    if not isinstance(payload, dict) or payload.get('status') != '1':
        raise ApiError('高德候选搜索不可用，请检查服务端 Key 的权限或配额。', 502)
    out, seen = [], set()
    for item in payload.get('pois') or []:
        if not isinstance(item, dict):
            continue
        try:
            lng, lat = [float(x) for x in str(item.get('location', '')).split(',')]
        except (ValueError, TypeError):
            continue
        pid, name = words(item.get('id')), words(item.get('name'))
        adcode = str(item.get('adcode', ''))
        if not pid or not name or pid in seen or not within_city(lat, lng, city) or not adcode.startswith(city['adcode'][:4]):
            continue
        seen.add(pid)
        out.append({'id': 'amap:' + pid, 'name': name, 'address': ' · '.join(filter(None, [words(item.get(k)) for k in ('pname', 'cityname', 'adname', 'address')])),
                    'city': city['name'], 'lat': lat, 'lng': lng, 'coordinateSystem': 'GCJ02', 'source': '高德地图',
                    'match': 'candidate', 'sourceURL': 'https://www.amap.com/place/' + urllib.parse.quote(pid, safe='')})
    return out[:6]


def search(q, city_id):
    q = words(q)
    if not 2 <= len(q) <= 120 or any(ord(c) < 32 for c in q):
        raise ApiError('请输入 2–120 个字的地点名称。')
    city = CITIES.get(city_id)
    if not city:
        raise ApiError('请先选择一个城市，再查找地点。')
    provider = 'amap' if configured() else 'photon'
    key = (provider, city_id, q)
    with LOCK:
        cached = CACHE.get(key)
    if cached and time.monotonic() - cached[0] < 1800:
        return cached[1]
    if not UPSTREAM_SLOTS.acquire(blocking=False):
        raise ApiError('正在查询其他地点，请稍后重试。', 429)
    try:
        if provider == 'amap':
            params = {'key': setting('TRAVEL_AMAP_WEB_KEY'), 'keywords': q, 'city': city['adcode'], 'citylimit': 'true', 'offset': 6, 'extensions': 'base'}
            data = fetch_json('https://restapi.amap.com/v3/place/text?' + urllib.parse.urlencode(params))
            rows = amap_candidates(data, city)
        else:
            params = {'q': q, 'limit': 6, 'lat': city['center'][1], 'lon': city['center'][0], 'bbox': ','.join(map(str, city['bbox']))}
            data = fetch_json('https://photon.komoot.io/api/?' + urllib.parse.urlencode(params))
            rows = photon_candidates(data, city)
        result = {'provider': provider, 'candidates': rows, 'message': '请核对名称和地址后确认位置。' if rows else '没有找到此城市内的可靠候选，可换用完整名称或保留位置待确认。'}
        with LOCK:
            if len(CACHE) >= 100:
                CACHE.pop(next(iter(CACHE)))
            CACHE[key] = (time.monotonic(), result)
        return result
    finally:
        UPSTREAM_SLOTS.release()

