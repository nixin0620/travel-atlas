#!/usr/bin/env python3
"""Public point-and-read probe. No cookies, credentials, hidden API, retry or bypass."""
import argparse
import datetime as dt
import getpass
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import ssl
import sys
import urllib.error
import urllib.parse as up
import urllib.request as ur

MAX_HTML = 8 * 1024 * 1024
MAX_IMAGE = 30 * 1024 * 1024
CONTENT_KEYS = ('dot_share_id', 'file_id', 'shareThemeType')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def normalize_url(raw):
    p = up.urlsplit(raw.strip())
    if p.scheme != 'https' or p.hostname != 'www.xiaohongshu.com' or p.path != '/s/dot' or p.username or p.password or p.port:
        raise ValueError('Only the public HTTPS Xiaohongshu /s/dot share endpoint is supported.')
    q = up.parse_qs(p.query)
    if not q.get('dot_share_id') or not q.get('file_id'):
        raise ValueError('Missing share content parameters.')
    # Never forward account IDs or tracking parameters. Values only live in memory.
    query = up.urlencode({k: q[k][0] for k in CONTENT_KEYS if q.get(k)})
    return 'https://www.xiaohongshu.com/s/dot?' + query


def redact(text, source_url=''):
    # Normalize common JSON slash escapes before stripping URLs and identifiers.
    text = re.sub(r'\\u002[fF]', '/', text).replace('\\/', '/')
    secrets = []
    if source_url:
        for values in up.parse_qs(up.urlsplit(source_url).query).values():
            for value in values:
                if len(value) > 8:
                    secrets.extend((value, up.quote(value, safe=''), value.replace('/', '\\/')))
    for value in sorted(set(secrets), key=len, reverse=True):
        text = text.replace(value, '[REDACTED]')
    text = re.sub(r'https?://[^\s<>"\']+', lambda m: up.urlsplit(html.unescape(m.group())).scheme + '://' + (up.urlsplit(html.unescape(m.group())).hostname or 'redacted') + '/[RESOURCE_REDACTED]', text)
    text = re.sub(r'(?i)("(?:appuid|(?:real)?user_?id|dot_share_id|file_?id|share_?id|xsec_token)"\s*:\s*)"[^"]*"', r'\1"[REDACTED]"', text)
    text = re.sub(r'(?i)\b[0-9a-f]{24}\b', '[ID_REDACTED]', text)
    text = re.sub(r'(?i)((?:appuid|user_id|dot_share_id|file_id|share_id|xsec_token)=)[^\s&<>"\']+', r'\1[REDACTED]', text)
    return text


def public_host(host):
    return bool(host and (host == 'xiaohongshu.com' or host.endswith('.xiaohongshu.com') or host == 'xhscdn.com' or host.endswith('.xhscdn.com')))


class AccessRestricted(Exception):
    """A public access boundary, never a reason to retry with another identity."""


class SafeRedirect(ur.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        p = up.urlsplit(newurl)
        if p.scheme != 'https' or not public_host(p.hostname) or p.username or p.password or p.port:
            raise ValueError('Redirect outside allowed public hosts; stopped.')
        if re.search(r'login|captcha|verify|challenge', p.path, re.I):
            raise AccessRestricted('Login or verification redirect; stopped.')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, limit):
    opener = ur.build_opener(SafeRedirect(), ur.HTTPSHandler(context=ssl.create_default_context()))
    # Deliberately no cookie jar, impersonated browser, proxy rotation or signature code.
    request = ur.Request(url, headers={'User-Agent': 'DotShareProbe/0.1 (public-share feasibility test)', 'Accept-Encoding': 'identity'})
    with opener.open(request, timeout=25) as response:
        body = response.read(limit + 1)
        if len(body) > limit:
            raise ValueError('Response exceeds the size limit.')
        return body, {'status': response.status, 'content_type': response.headers.get('Content-Type', ''),
                      'host': up.urlsplit(response.url).hostname, 'bytes': len(body),
                      'sha256': sha(body), 'access_control_allow_origin': response.headers.get('Access-Control-Allow-Origin')}


class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.images = []; self.scripts = []; self.text = []; self.current_script = None; self.skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'img':
            self.images.append({k: a[k] for k in ('src','data-src','alt','width','height') if k in a})
        if tag in ('script','style'):
            self.skip += 1
        if tag == 'script':
            self.current_script = {'attrs': a, 'body': ''}

    def handle_data(self, data):
        if self.current_script is not None:
            self.current_script['body'] += data
        if not self.skip and data.strip():
            self.text.append(data.strip())

    def handle_endtag(self, tag):
        if tag == 'script' and self.current_script is not None:
            self.scripts.append(self.current_script); self.current_script = None
        if tag in ('script','style'):
            self.skip = max(0, self.skip - 1)


def inspect_page(markup):
    page = Page(); page.feed(markup)
    candidates = []
    for image in page.images:
        src = image.get('src') or image.get('data-src') or ''
        if src.startswith('https://') and public_host(up.urlsplit(src).hostname):
            candidates.append({'url': src, 'discovery': 'html_img', 'alt': image.get('alt', '')})
    # SSR JSON may contain a lazy-loaded image. Inspect only literal URLs delivered in this HTML.
    for script in page.scripts:
        for match in re.finditer(r'https?(?::|\\u003[aA])(?:/|\\/){2}[^\s<>"\']+', script['body']):
            src = match.group().replace('\\/', '/').replace('\\u003A', ':').replace('\\u003a', ':').replace('\\u002F','/')
            if up.urlsplit(src).hostname == 'search-img.xhscdn.com':
                candidates.append({'url': html.unescape(src), 'discovery': 'inline_script_literal', 'alt': ''})
    unique = {c['url']: c for c in candidates}
    return page, list(unique.values())


def native_metadata(page):
    for script in page.scripts:
        match = re.search(r'"dotData"\s*:\s*(\{)', script['body'])
        if match:
            try:
                data, _ = json.JSONDecoder().raw_decode(script['body'][match.start(1):])
                info = data.get('shareInfo', {})
                return {key: info[key] for key in ('title','subTitle','createTime') if key in info}
            except (ValueError, TypeError):
                pass
    return {}


def run(raw_url, out):
    out.mkdir(parents=True, exist_ok=True)
    url = normalize_url(raw_url)
    result = {'schema_version': 1, 'tested_at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'source': {'page': 'https://www.xiaohongshu.com/s/dot', 'content_fingerprint_sha256': sha(url.encode()), 'query_values_redacted': True, 'account_and_tracking_parameters_forwarded': False},
              'access': {}, 'answer': {'native_text': None, 'native_text_complete': None, 'long_images': [], 'ocr_text': None, 'completeness': 'unverified'},
              'places': [], 'unconfirmed': [], 'status': 'not_started'}
    try:
        body, meta = fetch(url, MAX_HTML)
        result['access'] = meta
        markup = body.decode('utf-8', errors='replace')
        page, candidates = inspect_page(markup)
        visible = '\n'.join(page.text)
        (out/'page.redacted.html').write_text(redact(markup, raw_url), encoding='utf-8')
        (out/'page-visible-text.txt').write_text(redact(visible, raw_url)+'\n', encoding='utf-8')
        result['access']['html_image_count'] = len(page.images)
        result['access']['share_image_candidates'] = len(candidates)
        result['answer']['visible_page_text'] = redact(visible, raw_url)
        result['answer']['native_metadata'] = {k: redact(v, raw_url) if isinstance(v, str) else v
                                              for k, v in native_metadata(page).items()}
        if re.search(r'请完成.{0,8}验证|访问受限|安全验证|登录后.{0,8}查看|验证码|access denied|captcha', visible, re.I):
            result['status'] = 'access_restricted'
            result['unconfirmed'].append('Access restriction detected; no further content requests made.')
        else:
            for candidate in candidates[:4]:
                image, info = fetch(candidate['url'], MAX_IMAGE)
                if not info['content_type'].lower().startswith('image/'):
                    continue
                ext = 'png' if image.startswith(b'\x89PNG') else 'jpg' if image.startswith(b'\xff\xd8') else 'webp' if image[8:12]==b'WEBP' else 'img'
                name = 'share-image-' + str(len(result['answer']['long_images'])+1) + '.' + ext
                (out/name).write_bytes(image)
                result['answer']['long_images'].append({'file': name, 'source_host': info['host'], 'source_url_sha256': sha(candidate['url'].encode()), 'discovery': candidate['discovery'], **{k:v for k,v in info.items() if k not in ('host',)}, 'full_file_downloaded': True, 'dimensions': None})
            result['status'] = 'image_acquired_ocr_pending' if result['answer']['long_images'] else 'no_answer_content_found'
            result['unconfirmed'].append('Original native answer text and total answer completeness have not been established.')
    except AccessRestricted:
        result['status'] = 'access_restricted'
        result['access']['failure'] = 'Login or verification redirect; stopped without retries.'
    except ur.HTTPError as e:
        result['status'] = 'access_restricted' if e.code in (401,403,429) else 'http_failed'
        result['access']['status'] = e.code
        result['access']['failure'] = 'HTTP response; stopped without retries or alternate identity.'
    except Exception as e:
        # Never log exception strings: request errors may contain the entire private URL.
        result['status'] = 'network_or_parse_failed'; result['access']['failure_class'] = type(e).__name__
    (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n', encoding='utf-8')
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url-stdin',action='store_true',help='Read share URL privately from stdin, never a command-line argument.')
    parser.add_argument('--out',default='out')
    args=parser.parse_args()
    raw = sys.stdin.readline().strip() if args.url_stdin else getpass.getpass('Paste the share URL (hidden): ')
    try:
        result=run(raw,Path(args.out))
        print(json.dumps({'status':result['status'],'images':len(result['answer']['long_images']),'output':str(Path(args.out)/'result.json')},ensure_ascii=False))
        return 0 if result['status']=='image_acquired_ocr_pending' else 2
    except Exception as e:
        print(json.dumps({'status':'input_or_output_error','failure_class':type(e).__name__}))
        return 2


if __name__=='__main__':
    sys.exit(main())
