"""On-demand public-source verification. No search scraping, login or stored trip data.

The registry contains source locations and matching identities, never prices or
opening hours. Facts are extracted only from a successful current HTML response.
"""
import datetime as dt
from concurrent.futures import ThreadPoolExecutor
import ipaddress
import hashlib
import os
from pathlib import Path
import json
import re
import socket
import threading
import time
import unicodedata
import urllib.parse as up
import urllib.request as ur
from html.parser import HTMLParser

MAX_HTML = 2 * 1024 * 1024
FIELDS = {'experience', 'audience', 'time', 'budget', 'caution', 'hours'}
PROVIDERS = [
    {'city': 'banna', 'names': ['中科院西双版纳热带植物园', '中国科学院西双版纳热带植物园', '中科院植物园', '西双版纳热带植物园', '勐仑植物园'],
     'url': 'https://xtbg.ac.cn/2022/ykfw/dzsw/', 'title': '植物园官网 · 游客服务', 'type': 'official', 'parser': 'xtbg'},
    {'city': 'banna', 'names': ['勐远仙境', '勐远仙境 · 向导带领的雨林徒步'],
     'url': 'https://lcj.yn.gov.cn/html/2026/mainnews_0303/76207.html', 'title': '云南省林草局 · 雨林研学', 'type': 'public', 'parser': 'article', 'publishedAt': '2026-03-03'},
    {'city': 'banna', 'names': ['曼掌村', '曼掌村 · 傣锦与慢轮傣陶', '勐养曼掌村 · 手作工坊'],
     'url': 'https://society.yunnan.cn/system/2025/05/20/033485319.shtml', 'title': '人民日报 · 曼掌村手工艺', 'type': 'public', 'parser': 'article', 'publishedAt': '2025-05-20'},
    {'city': 'puer', 'names': ['小凹子咖啡庄园', '小凹子 · 产地咖啡'],
     'url': 'https://m.yunnan.cn/system/2025/10/22/033695391.shtml', 'title': '云南网 · 小凹子咖啡', 'type': 'public', 'parser': 'article', 'publishedAt': '2025-10-22'},
    {'city': 'puer', 'names': ['普博文创居'],
     'url': 'https://www.puerw.cn/content/202603/04/c477776.html', 'title': '普洱日报 · 普博文创居', 'type': 'public', 'parser': 'article', 'publishedAt': '2026-03-04'},
    {'city': 'puer', 'names': ['思茅老街', '思茅老街 · 茶咖与文创'],
     'url': 'https://www.puerw.cn/content/202606/03/c493796.html', 'title': '普洱日报 · 老街茶咖', 'type': 'public', 'parser': 'article', 'publishedAt': '2026-06-03'},
]
# Public platform visitor-info panels only. User reviews and AI summaries are
# deliberately excluded. Names/URLs are identities, not canned travel facts.
PROVIDERS += [
    {'city': 'banna', 'names': ['曼远村', '曼远古寨'], 'identity': ['曼遠村', 'Manyuan Village'],
     'url': 'https://tw.trip.com/moments/poi-manyuan-village-113965321/'},
    {'city': 'banna', 'names': ['曼掌村', '曼掌村 · 傣锦与慢轮傣陶', '勐养曼掌村 · 手作工坊'], 'identity': ['曼掌村'],
     'url': 'https://tw.trip.com/moments/theme/poi-manzhang-village-24592314-attraction-993137/'},
    {'city': 'banna', 'names': ['曼丢古寨', '曼丢傣家古寨', '曼丢村'], 'identity': ['曼丟傣家古寨', 'Mandiu Village'],
     'url': 'https://tw.trip.com/moments/theme/poi-mandiu-village-56809365-attraction-993137/'},
    {'city': 'banna', 'names': ['曼贺纳古寨', '曼贺纳自然村寨', '曼贺纳村'], 'identity': ['曼賀納自然村寨', 'Manhena Natural Village'],
     'url': 'https://tw.trip.com/moments/theme/poi-manhena-natural-village-148556438-attraction-993137/'},
]
for provider in PROVIDERS:
    if 'identity' in provider:
        provider.update(type='platform', parser='trip', title='Trip · '+provider['names'][0], fields={'experience', 'time', 'budget', 'hours'})

CACHE = {}
LOCK = threading.Lock()
FETCH_LIMIT = threading.BoundedSemaphore(2)


# Public source facts only; never trip state, share tokens, cookies or accounts.
# Successful reads survive a local server restart for the existing six-hour TTL.
PUBLIC_CACHE = Path(__file__).resolve().parents[1] / '.cache' / 'public-place-facts'

def cache_file(provider):
    return PUBLIC_CACHE / (hashlib.sha256(provider['url'].encode()).hexdigest()+'.json')

def read_public_cache(provider, now, stable_only=False):
    try:
        path=cache_file(provider)
        if path.stat().st_size > 128000: return None
        cached=json.loads(path.read_text())
        result=cached['result']; checked=dt.datetime.fromisoformat(result['source']['checkedAt']).timestamp()
        deadline=checked+7*86400 if stable_only else min(cached['expires'],checked+21600)
        if not checked <= now < deadline: return None
        if result['source']['url'] != provider['url'] or result['source']['type'] != provider['type']: return None
        if not result['facts'] or any(f['field'] not in FIELDS or not isinstance(f['text'],str) for f in result['facts']): return None
        if stable_only:
            result['facts']=[fact for fact in result['facts'] if fact['field']=='experience']
            if not result['facts']: return None
            result['cached']=True;cached['expires']=now+300
        return cached
    except (OSError,KeyError,ValueError,TypeError): return None

def save_public_cache(provider, cached):
    if not cached['result'].get('facts'): return
    try:
        PUBLIC_CACHE.mkdir(parents=True,exist_ok=True)
        path=cache_file(provider); tmp=path.with_suffix('.'+str(threading.get_ident())+'.tmp')
        tmp.write_text(json.dumps(cached,ensure_ascii=False));os.replace(tmp,path)
    except OSError: pass


def normal(value):
    return re.sub(r'[\s·•・，,。()（）\-—]', '', unicodedata.normalize('NFKC', value)).lower()


def provider_for(city, name):
    return next((p for p in PROVIDERS if p['city'] == city and normal(name) in map(normal, p['names'])), None)


class SourceUnavailable(Exception):
    pass


class TextPage(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript'): self.skip += 1
        if tag in ('p', 'br', 'div', 'li', 'h1', 'h2', 'h3', 'tr'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript'): self.skip = max(0, self.skip - 1)
        if tag in ('p', 'div', 'li', 'h1', 'h2', 'h3', 'tr'): self.parts.append('\n')
    def handle_data(self, data):
        if not self.skip: self.parts.append(data)
    def text(self):
        return '\n'.join(re.sub(r'\s+', ' ', line).strip() for line in ''.join(self.parts).splitlines() if line.strip())


def validate_source_url(url, original):
    p, origin = up.urlsplit(url), up.urlsplit(original)
    # Only the exact configured resource (optional www canonicalization). Never
    # accept client URLs or follow a redirect to another path, IP, or login page.
    if (p.scheme != 'https' or p.username or p.password or p.port or p.query or p.fragment
            or not p.hostname or p.hostname.removeprefix('www.') != origin.hostname.removeprefix('www.') or p.path != origin.path):
        raise SourceUnavailable('source_redirect')
    for result in socket.getaddrinfo(p.hostname, 443, type=socket.SOCK_STREAM):
        if not ipaddress.ip_address(result[4][0]).is_global: raise SourceUnavailable('source_address')


def fetch_html(url):
    validate_source_url(url, url)
    class Redirect(ur.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            validate_source_url(newurl, url)
            return super().redirect_request(req, fp, code, msg, headers, newurl)
    opener = ur.build_opener(Redirect())
    req = ur.Request(url, headers={'User-Agent': 'TravelGuideFacts/1.0 (public visitor information)', 'Accept-Encoding': 'identity'})
    with opener.open(req, timeout=8) as response:
        if 'text/html' not in response.headers.get('Content-Type', ''): raise SourceUnavailable('not_html')
        data = response.read(MAX_HTML + 1)
        if len(data) > MAX_HTML: raise SourceUnavailable('too_large')
        return data.decode(response.headers.get_content_charset() or 'utf-8', errors='replace')


class TripInfo(HTMLParser):
    """Read labeled visitor fields, never text inside review/AI-summary blocks."""
    def __init__(self):
        super().__init__(); self.heading = ''; self.buffer = []; self.title = ''; self.pending = ''; self.values = {}
    def handle_starttag(self, tag, attrs):
        if tag in ('h1', 'h3'):
            self.heading = tag; self.buffer = []; self.pending = ''
    def handle_endtag(self, tag):
        if tag == self.heading:
            text = ''.join(self.buffer).strip()
            if tag == 'h1': self.title = text
            else: self.pending = text
            self.heading = ''
    def handle_data(self, text):
        if self.heading: self.buffer.append(text)
        elif self.pending and text.strip():
            self.values.setdefault(self.pending, text.strip()); self.pending = ''


def extract_trip(provider, markup):
    panel = TripInfo(); panel.feed(markup)
    if not any(name in panel.title for name in provider['identity']): raise SourceUnavailable('identity_missing')
    address = next((v for k,v in panel.values.items() if re.search(r'的地址|Address:', k)), '')
    if not re.search(r'西双版纳|西雙版納', address) or not re.search(r'景洪', address): raise SourceUnavailable('city_missing')
    facts = []
    for label, quote in panel.values.items():
        field = None; text = quote
        if re.search(r'推薦遊覽時間|Recommended sightseeing time', label) and re.fullmatch(r'[\d.]+(?:\s*[–—~至-]\s*[\d.]+)?\s*(?:hours?|小時|小时|minutes?|分鐘)', quote, re.I):
            field = 'time'; text = re.sub(r'\s*hours?', ' 小时', quote, flags=re.I).replace('小時', '小时')
            text = re.sub(r'\s*minutes?', ' 分钟', text, flags=re.I).replace('分鐘', '分钟')
        elif re.search(r'門票價格|Ticket Price', label) and quote in ('Free admission', '免費入場', '免费入场'):
            field = 'budget'; text = '村寨入场免费'
        elif re.search(r'開放時間|Opening times', label) and quote in ('Open year-round, 24/7', '24 小時全年無休', '全年全天開放'):
            field = 'hours'; text = '村寨全年全天开放'
        if field:
            facts.append({'field': field, 'label': '平台参考', 'text': text, 'quote': quote})
    intro = trip_introduction(provider, markup)
    facts.extend({'field': 'experience', 'label': '平台介绍', 'text': text, 'quote': text} for text in intro)
    return facts


def trip_introduction(provider, markup):
    # POI-authored introduction only; never the Moments feed or AI summary.
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', markup, re.S)
    if not match: return []
    try:
        info = json.loads(match[1])['props']['pageProps']['topInfo']['poiInfo']
        if info['poiName'] not in provider['identity']: return []
        intro = info.get('poiIntroduce', '')
        if not isinstance(intro, str): return []
        page = TextPage(); page.feed(intro); text = page.text()
        sentences = re.split(r'[。！？；，]', text)
        selected = []
        for sentence in sentences:
            sentence = sentence.strip()
            if 10 <= len(sentence) <= 75 and re.search(r'建築|傣樓|手工|造紙|製陶|織錦|村落|古樹|古榕樹|佛寺|文化館', sentence) and not re.search(r'公元|歷史上|始建|意為|禁止|如果|但|只有|除非|尚未|不宜', sentence):
                if sum(map(len, selected)) + len(sentence) <= 100: selected.append(sentence)
                if len(selected) == 2: break
        return selected
    except (KeyError, TypeError, ValueError): return []


def trip_photo(provider, markup):
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', markup, re.S)
    if not match: return None
    try:
        info = json.loads(match[1])['props']['pageProps']['topInfo']
        if info['poiInfo']['poiName'] not in provider['identity']: return None
        url = info['basicInfo']['coverImage']['url']; parsed = up.urlsplit(url)
        if parsed.scheme != 'https' or parsed.hostname != 'ak-d.tripcdn.com' or not parsed.path.startswith('/images/') or parsed.username or parsed.password or parsed.port: return None
        return {'url': url, 'sourceURL': provider['url'], 'title': provider['title']}
    except (KeyError, TypeError, ValueError): return None


def extract(provider, markup):
    page = TextPage(); page.feed(markup); text = page.text()
    if re.search(r'验证码|安全验证|访问受限|access denied|captcha|请.{0,6}登录', text, re.I): raise SourceUnavailable('restricted')
    if provider['parser'] == 'trip': return extract_trip(provider, markup)
    if not any(name.split(' · ')[0] in text for name in provider['names']): raise SourceUnavailable('identity_missing')
    facts = []
    def keep(field, label, quote):
        quote = quote.strip().lstrip('①②③④⑤⑥⑦⑧⑨⑩ ').strip()
        if 2 < len(quote) <= 150 and not any(f['text'] == quote for f in facts):
            facts.append({'field': field, 'label': label, 'text': quote})
    if provider['parser'] == 'xtbg':
        # Narrow, section-specific sentences; do not confuse bus/VIP/night-tour
        # prices with admission, or operating hours with visit duration.
        patterns = [
            ('budget', '成人门票', r'成人全价票[^\n。]+'),
            ('time', '西游览区', r'西游览区共[^\n。]*参观游玩一般需[^\n。]+'),
            ('time', '全园', r'全园（西游览区\+东游览区）：游玩一般需[^\n。]+'),
            ('audience', '园方建议', r'对于年长或行动不便的游客[^。\n]+。'),
            ('caution', '购票', r'门票限当日使用[^。\n]+。'),
        ]
        for field, label, pattern in patterns:
            for match in re.finditer(pattern, text): keep(field, label, match.group())
    else:
        # Official reports are useful for stable experiences only. Old news must
        # never supply today's price, operating time, or availability.
        for sentence in re.split(r'(?<=[。！？；])', text):
            sentence = re.sub(r'\s+', '', sentence)
            if any(name.split(' · ')[0] in sentence for name in provider['names']) and re.search(r'体验|手工|课程|茶咖|文创', sentence):
                keep('experience', '公开资料', sentence)
    return facts


def lookup(place, loader=fetch_html, now=None):
    persist = loader is fetch_html and now is None
    now = time.time() if now is None else now
    name, city = place.get('name', ''), place.get('cityId', '')
    missing = place.get('missing', [])
    if not isinstance(name, str) or not 0 < len(name) <= 180 or not isinstance(city, str) or len(city) > 60:
        raise ValueError('invalid_place')
    if not isinstance(missing, list) or not missing or any(v not in FIELDS for v in missing): raise ValueError('invalid_fields')
    providers = [p for p in PROVIDERS if p['city'] == city and normal(name) in map(normal, p['names'])
                 and (not p.get('fields') or set(missing) & p['fields'])]
    providers.sort(key=lambda p: p['type'] != 'platform')
    base = {'name': name, 'cityId': city, 'facts': [], 'status': 'unconfirmed'}
    if not providers: return {**base, 'reason': 'no_matched_source'}
    sources, facts, photos, reason = [], [], [], 'no_explicit_facts'
    for provider in providers:
        cache_key = provider['url'] + '|' + provider['names'][0]
        with LOCK: cached = CACHE.get(cache_key)
        if not cached and persist: cached=read_public_cache(provider,now)
        if cached and now < cached['expires']:
            result = cached['result']
        else:
            try:
                if not FETCH_LIMIT.acquire(timeout=10): continue
                try:
                    markup = loader(provider['url']); extracted = extract(provider, markup)
                    photo = trip_photo(provider, markup) if provider['parser'] == 'trip' else None
                finally: FETCH_LIMIT.release()
                checked = dt.datetime.fromtimestamp(now, dt.timezone.utc).isoformat()
                result = {'source': {'url': provider['url'], 'title': provider['title'], 'type': provider['type'],
                           'checkedAt': checked, 'publishedAt': provider.get('publishedAt', '')}, 'facts': extracted, 'photo': photo, 'reason': 'no_explicit_facts'}
                ttl = 6 * 3600
            except Exception:
                prior=read_public_cache(provider,now,stable_only=True) if persist else None
                result=prior['result'] if prior else {'facts': [], 'reason': 'source_unavailable'}
                ttl=300
            entry={'result': result, 'expires': now+ttl}
            with LOCK: CACHE[cache_key]=entry
            if persist and not result.get('cached'): save_public_cache(provider,entry)
        additions = [f for f in result['facts'] if f['field'] in missing and not any(x['field'] == f['field'] for x in facts)]
        if additions:
            index = len(sources); sources.append(result['source'])
            if result.get('photo'): photos.append(result['photo'])
            facts.extend({**f, 'sourceIndex': index} for f in additions)
        reason = result['reason']
        if all(any(f['field'] == field for f in facts) for field in missing): break
    return {**base, 'sources': sources, 'photos': photos, **({'source': sources[0]} if sources else {}), 'facts': facts,
            'status': 'verified' if facts else 'unconfirmed', 'reason': '' if facts else reason}


def lookup_many(payload):
    places = payload.get('places')
    if not isinstance(places, list) or not 1 <= len(places) <= 4 or not all(isinstance(p, dict) for p in places): raise ValueError('invalid_places')
    # At most four explicitly matched public locations; no user guide text,
    # personal share URL, trip date, or credentials leave the local service.
    with ThreadPoolExecutor(max_workers=2) as pool:
        return {'results': list(pool.map(lookup, places))}
