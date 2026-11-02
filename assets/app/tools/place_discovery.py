"""Read a bounded set of public topic reports, not a preset place/ranking database.

The registry holds documents, not candidate names or descriptions. Every returned
place must be present as a heading in a successfully fetched article, with matching
city context. No general web-search service is configured. Old reports establish
that a place/experience was reported, never current opening times or availability.
"""
import copy
import datetime as dt
import hashlib
import re
import threading
import time
import urllib.parse as up
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from place_facts import fetch_html, SourceUnavailable, PROVIDERS, lookup

DOCUMENTS = [
    {'city': 'banna', 'topic': 'villages', 'url': 'https://mz.yn.gov.cn/html/2024/yilvcurong_0511/4054497.html',
     'title': '云南省民宗委 · 美丽村落', 'publishedAt': '2024-05-11', 'publisher': '云南省民族宗教事务委员会',
     'cityScope': False},
    {'city': 'banna', 'topic': 'villages', 'url': 'https://www.thepaper.cn/newsDetail_forward_30076179',
     'title': '澎湃号·政务 · 景洪特色村寨', 'publishedAt': '2025-02-03', 'publisher': '澎湃号·政务',
     'cityScope': True},
]
CACHE, LOCK = {}, threading.Lock()
BUSY = threading.BoundedSemaphore(2)


class Blocks(HTMLParser):
    def __init__(self):
        super().__init__(); self.blocks = []; self.parts = []; self.skip = 0
    def flush(self):
        text = re.sub(r'\s+', '', ''.join(self.parts)); self.parts = []
        if text: self.blocks.append(('text', text))
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript'): self.skip += 1
        if self.skip: return
        if tag in ('p', 'div', 'br', 'h1', 'h2', 'h3', 'img'): self.flush()
        if tag == 'img': self.blocks.append(('image', dict(attrs)))
    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript'): self.skip = max(0, self.skip - 1)
        if not self.skip and tag in ('p', 'div', 'h1', 'h2', 'h3'): self.flush()
    def handle_data(self, text):
        if not self.skip: self.parts.append(text)


def extract(document, markup, checked_at):
    page = Blocks(); page.feed(markup); page.flush()
    full = '\n'.join(v for k, v in page.blocks if k == 'text')
    if re.search(r'验证码|安全验证|访问受限|access denied|captcha', full, re.I): raise SourceUnavailable('restricted')
    if document['publisher'] not in full or document['publishedAt'] not in full: raise SourceUnavailable('identity_missing')
    if document['cityScope'] and not re.search(r'西双版纳|景洪市', full[:1500]): raise SourceUnavailable('city_missing')
    # Standalone headings, not a fuzzy match against prose mentioning other villages.
    sections = []
    for kind, value in page.blocks:
        match = re.fullmatch(r'([\u4e00-\u9fff]{2,12}(?:村|古寨))(?:(?:：|:)[^。！？]{2,30})?', value) if kind == 'text' else None
        if match and not re.search(r'社区|多个|特色|走进|古老|游客', match[1]):
            sections.append({'name': match[1], 'parts': [], 'images': []})
        elif sections:
            sections[-1]['parts' if kind == 'text' else 'images'].append(value)
    results = []
    for section in sections:
        paragraphs = section['parts']; text = '\n'.join(paragraphs)
        if not paragraphs or not re.search(r'西双版纳|景洪市', text[:500]) and not document['cityScope']: continue
        name = section['name']
        if name not in text[:500]: continue
        # Keep complete source sentences; do not make scores, prices or duration up.
        quotes = []
        for paragraph in paragraphs:
            if re.search(r'原标题|特别声明|阅读原文|责任编辑', paragraph): break
            for sentence in re.findall(r'[^。！？]+[。！？]', paragraph):
                if 10 <= len(sentence) <= 130 and re.search(r'建筑|民居|村史馆|非遗|制陶|手工艺|村间|雨林', sentence) and not re.search(r'^“|^”|游客.{0,6}(表示|说)|已有\d+年|建寨史|收入|亿元', sentence):
                    if sum(map(len, quotes)) + len(sentence) <= 180: quotes.append(sentence)
                if len(quotes) == 2: break
            if len(quotes) == 2: break
        if not quotes: continue  # No evidence, no candidate.
        images = []
        for attrs in section['images']:
            url = up.urljoin(document['url'], attrs.get('data-src') or attrs.get('src', ''))
            parts = up.urlsplit(url)
            if parts.scheme != 'https' or parts.hostname not in ('mz.yn.gov.cn', 'imagepphcloud.thepaper.cn'): continue
            style = attrs.get('style', '')
            width = int(attrs.get('width') or (re.search(r'width:\s*(\d+)', style) or [None, '0'])[1])
            height = int(attrs.get('height') or (re.search(r'height:\s*(\d+)', style) or [None, '0'])[1])
            if width >= 600 and height >= 260: images.append({'url': url, 'width': width, 'height': height, 'sourceURL': document['url']})
        source = {'id': 'public:' + hashlib.sha256(document['url'].encode()).hexdigest()[:16], 'type': 'system',
                  'title': document['title'], 'url': document['url'], 'publishedAt': document['publishedAt'], 'checkedAt': checked_at,
                  'discoveryTopic': document['topic'], 'kinds': ['sight', 'experience'],
                  'reasons': [{'label': '当年春节报道' if document['cityScope'] else '公开报道', 'text': q} for q in quotes] + [
                      {'label': '注意', 'text': '资料发表于' + document['publishedAt'] + '，' + ('春节活动不代表常态开放，' if document['cityScope'] else '') + '活动与开放情况需出行前确认。'}]}
        results.append({'name': name, 'cityId': document['city'], 'city': '西双版纳', 'kind': 'sight',
                        'sourceId': 'sight:public-' + hashlib.sha256((document['city'] + '|' + name).encode()).hexdigest()[:20],
                        'evidence': source, 'photos': images[:2]})
    return results


def discover(payload, loader=fetch_html, now=None):
    city, topic = payload.get('cityId'), payload.get('topic')
    if not isinstance(city, str) or not re.fullmatch(r'[\w-]{1,60}', city) or topic != 'villages': raise ValueError('invalid_context')
    documents = [d for d in DOCUMENTS if d['city'] == city and d['topic'] == topic]
    base = {'cityId': city, 'topic': topic, 'places': [], 'scope': 'public_topic_documents'}
    if not documents: return {**base, 'status': 'unsupported'}
    now = time.time() if now is None else now; key = (city, topic)
    with LOCK: cached = CACHE.get(key)
    if cached and cached[0] > now: return copy.deepcopy(cached[1])
    if not BUSY.acquire(blocking=False): return {**base, 'status': 'unavailable'}
    checked = dt.datetime.fromtimestamp(now, dt.timezone.utc).isoformat()
    def load(document):
        try: return extract(document, loader(document['url']), checked), True
        except Exception: return [], False
    try:
        with ThreadPoolExecutor(max_workers=2) as pool: outcomes = list(pool.map(load, documents))
        places = [p for rows, _ in outcomes for p in rows][:12]
        count = sum(ok for _, ok in outcomes)
        result = {**base, 'places': places, 'status': 'ready' if count == len(documents) and places else 'partial' if places else 'unavailable',
                  'checkedAt': checked, 'documentsRead': count, 'documentsTotal': len(documents)}
        with LOCK: CACHE[key] = (now + (21600 if result['status'] == 'ready' else 300), copy.deepcopy(result))
        return result
    finally: BUSY.release()


def discover_platforms(payload, loader=fetch_html, now=None):
    """Same candidate contract; recommendations now come from matched Trip POIs.

    Registered URLs are only lookup identities. A failed/blocked response creates
    no candidate, and the old report parser remains available for historical data.
    """
    city, topic = payload.get('cityId'), payload.get('topic')
    if not isinstance(city, str) or not re.fullmatch(r'[\w-]{1,60}', city) or topic != 'villages': raise ValueError('invalid_context')
    providers = [p for p in PROVIDERS if p['city'] == city and p['parser'] == 'trip']
    base = {'cityId': city, 'topic': topic, 'places': [], 'scope': 'platform_poi_pages'}
    if not providers: return {**base, 'status': 'unsupported'}
    def load(provider):
        result = lookup({'cityId': city, 'name': provider['names'][0], 'missing': ['experience', 'time', 'budget', 'hours']}, loader, now)
        platform = next((s for s in result.get('sources', []) if s['url'] == provider['url']), None)
        reasons = [dict(label=f['label'], text=f['text']) for f in result['facts'] if f['field'] == 'experience' and result['sources'][f['sourceIndex']]['url'] == provider['url']]
        if not platform or not reasons: return None
        evidence = {**platform, 'id': 'platform:' + hashlib.sha256(provider['url'].encode()).hexdigest()[:16],
                    'discoveryTopic': topic, 'kinds': ['sight'], 'reasons': reasons}
        name = provider['names'][0]
        return {'name': name, 'cityId': city, 'city': '西双版纳', 'kind': 'sight',
                'sourceId': 'sight:public-' + hashlib.sha256((city + '|' + name).encode()).hexdigest()[:20],
                'evidence': evidence, 'photos': [p for p in result.get('photos', []) if p['sourceURL'] == provider['url']]}
    with ThreadPoolExecutor(max_workers=2) as pool: places = [p for p in pool.map(load, providers) if p]
    return {**base, 'places': places, 'status': 'ready' if len(places) == len(providers) else 'partial' if places else 'unavailable',
            'documentsRead': len(places), 'documentsTotal': len(providers)}
