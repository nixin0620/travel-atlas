"""Local-only regression checks; no live API credentials or requests are used."""
import sys
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import urllib.error
import urllib.parse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import travel_map_service as server
import guide_server as guide


class Response(io.BytesIO):
    def __init__(self, body, content_type='application/json'):
        super().__init__(body)
        self.headers = {'Content-Type': content_type}


class MapServerTest(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()
        self.config = patch.object(server, 'LOCAL_CONFIG', {
            'TRAVEL_AMAP_JS_KEY': 'fixture-js-public',
            'TRAVEL_AMAP_SECURITY_JSCODE': 'fixture-security-code',
        })
        self.config.start()
        self.addCleanup(self.env.stop)
        self.addCleanup(self.config.stop)

    def test_local_file_literals_and_known_names_only(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / '.env.local'
            path.write_text('TRAVEL_AMAP_JS_KEY="public-value"\nTRAVEL_AMAP_SECURITY_JSCODE=\'server-secret\'\nOTHER=ignored\nTRAVEL_AMAP_WEB_KEY=has space\n')
            data = server.load_local_config(path)
            self.assertEqual(data, {'TRAVEL_AMAP_JS_KEY': 'public-value', 'TRAVEL_AMAP_SECURITY_JSCODE': 'server-secret'})

    def test_environment_overrides_file_and_empty_can_disable(self):
        with patch.dict(os.environ, {'TRAVEL_AMAP_JS_KEY': 'environment-public'}):
            self.assertEqual(server.public_config()['jsKey'], 'environment-public')
        with patch.dict(os.environ, {'TRAVEL_AMAP_SECURITY_JSCODE': ''}):
            self.assertFalse(server.js_configured())
            self.assertEqual(server.public_config()['jsKey'], '')

    def test_public_config_never_exposes_security_code(self):
        config = server.public_config()
        self.assertEqual(config['provider'], 'amap')
        self.assertTrue(config['amapJsConfigured'])
        self.assertFalse(config['amapConfigured'])
        self.assertEqual(config['jsKey'], 'fixture-js-public')
        self.assertNotIn('fixture-security-code', json.dumps(config))
        self.assertFalse(server.configured(), 'JS key must not become a Web service key')

    def test_separate_web_service_configuration(self):
        with patch.dict(os.environ, {'TRAVEL_AMAP_WEB_KEY': 'fixture-web'}):
            self.assertTrue(server.configured())
            self.assertEqual(server.setting('TRAVEL_AMAP_WEB_KEY'), 'fixture-web')
            self.assertEqual(server.public_config()['jsKey'], 'fixture-js-public')

    def test_proxy_overwrites_client_credentials(self):
        result = server.amap_proxy_url('/_AMapService/v3/place/text', 'key=other&jscode=bad&KEY=dup&securityJsCode=bad&keywords=test')
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(result).query)
        self.assertEqual(query['key'], ['fixture-js-public'])
        self.assertEqual(query['jscode'], ['fixture-security-code'])
        self.assertNotIn('KEY', query)
        self.assertNotIn('securityJsCode', query)
        self.assertEqual(query['keywords'], ['test'])

    def test_sdk_initialization_and_search_paths_supported(self):
        for path in server.AMAP_REST_PATHS:
            with self.subTest(path=path):
                url = urllib.parse.urlsplit(server.amap_proxy_url('/_AMapService' + path, 'callback=AMap._callback_12'))
                self.assertEqual(url.netloc, 'restapi.amap.com')
                self.assertEqual(url.path, path)
        for path in server.AMAP_STYLE_PATHS:
            url = urllib.parse.urlsplit(server.amap_proxy_url('/_AMapService' + path, 'styleid=normal'))
            self.assertEqual(url.netloc, 'webapi.amap.com')
            self.assertEqual(url.path, path)

    def test_disallows_arbitrary_proxy_paths(self):
        for path in ('/_AMapService/https://example.com', '/_AMapService//evil.test',
                     '/_AMapService/v3/place/../../unknown', '/_AMapService/v3/place%2ftext',
                     '/_AMapService/v3/unknown', '/_AMapService/v3/place/text/extra'):
            with self.subTest(path=path), self.assertRaises(server.ApiError):
                server.amap_proxy_url(path, '')

    def test_callback_allows_identifiers_and_dotted_names(self):
        for value in ('_AMap_cbk_1', 'AMap._cb1', '$map.cb_12'):
            server.amap_proxy_url('/_AMapService/v3/log/init', urllib.parse.urlencode({'callback': value}))

    def test_callback_injection_is_rejected(self):
        for value in ('alert(1)', 'foo;alert(1)', 'foo["bar"]', 'foo\nbar', '',
                      'Object.constructor', 'x.__proto__', 'a.prototype.b'):
            with self.subTest(value=value), self.assertRaises(server.ApiError):
                server.amap_proxy_url('/_AMapService/v3/log/init', urllib.parse.urlencode({'callback': value}))

    def test_duplicate_callback_is_rejected(self):
        with self.assertRaises(server.ApiError):
            server.amap_proxy_url('/_AMapService/v3/log/init', 'callback=one&callback=two')

    def test_query_size_field_count_and_controls_are_limited(self):
        for query in ('x=' + 'a' * 24_001, '&'.join('x=1' for _ in range(121)), 'x=%00', 'bad%0Aname=1'):
            with self.assertRaises(server.ApiError):
                server.amap_proxy_url('/_AMapService/v3/place/text', query)

    def test_missing_configuration_is_explicit(self):
        with patch.object(server, 'LOCAL_CONFIG', {}), self.assertRaises(server.ApiError) as error:
            server.amap_proxy_url('/_AMapService/v3/place/text', '')
        self.assertEqual(error.exception.status, 503)

    def proxy_with_response(self, response, query=''):
        opener = SimpleNamespace(open=lambda request, timeout: response)
        with patch.object(server.urllib.request, 'build_opener', return_value=opener):
            return server.proxy_amap('/_AMapService/v3/place/text', query, 'http://127.0.0.1:8787/')

    def test_upstream_security_echo_is_redacted(self):
        body, kind = self.proxy_with_response(Response(b'{"info":"fixture-security-code"}'))
        self.assertNotIn(b'fixture-security-code', body)
        self.assertIn(b'[redacted]', body)
        self.assertEqual(kind, 'application/json; charset=utf-8')

    def test_valid_jsonp_is_served_as_javascript_under_nosniff(self):
        source = b'AMap.fixture({"status":"1","info":"ok"});'
        body, kind = self.proxy_with_response(Response(source, 'application/json'), 'callback=AMap.fixture')
        self.assertEqual(body, source)
        self.assertEqual(kind, 'application/javascript; charset=utf-8')

    def test_jsonp_must_match_callback_and_contain_only_json(self):
        for source in (b'other({"status":"1"})', b'AMap.fixture({});alert(1)',
                       b'AMap.fixture(alert(1))', b'AMap.fixture({invalid:true})', b'{"status":"1"}'):
            with self.subTest(source=source), self.assertRaises(server.ApiError):
                self.proxy_with_response(Response(source, 'application/json'), 'callback=AMap.fixture')

    def test_upstream_response_size_is_limited(self):
        with patch.object(server, 'PROXY_LIMIT', 12), self.assertRaises(server.ApiError):
            self.proxy_with_response(Response(b'a' * 13))

    def test_html_responses_are_not_served_from_local_origin(self):
        with self.assertRaises(server.ApiError):
            self.proxy_with_response(Response(b'<script>bad()</script>', 'text/html'))

    def test_error_messages_do_not_leak_upstream_urls(self):
        opener = SimpleNamespace(open=lambda *a, **k: (_ for _ in ()).throw(urllib.error.URLError('https://amap/?jscode=fixture-security-code')))
        with patch.object(server.urllib.request, 'build_opener', return_value=opener), self.assertRaises(server.ApiError) as error:
            server.proxy_amap('/_AMapService/v3/log/init', '', 'http://127.0.0.1:8787/')
        self.assertNotIn('fixture-security-code', error.exception.message)
        self.assertEqual(error.exception.status, 502)

    def test_upstream_redirect_is_refused(self):
        with self.assertRaises(server.ApiError):
            server.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://evil.example/')

    def test_diagnostics_are_off_by_default(self):
        output = io.StringIO()
        with patch.object(server.sys, 'stderr', output):
            server.proxy_diagnostic('/_AMapService/v3/log/init', query='key=fixture-js-public')
        self.assertEqual(output.getvalue(), '')

    def test_diagnostics_keep_only_safe_metadata_and_redact_credentials(self):
        output = io.StringIO()
        query = urllib.parse.urlencode({'key': 'fixture-js-public', 'jscode': 'fixture-security-code',
                                       'locations': '100.1,20.2', 's': 'rsv3', 'sig': 'hidden-signature'})
        with patch.dict(os.environ, {'TRAVEL_MAP_DIAGNOSTICS': '1'}), patch.object(server.sys, 'stderr', output):
            server.proxy_diagnostic('/_AMapService/v3/assistant/coordinate/convert', query=query)
            server.proxy_diagnostic('/_AMapService/v3/assistant/coordinate/convert', body=b'{"info":"USERKEY_PLAT_NOMATCH","infocode":"10009","key":"fixture-js-public"}')
        result = output.getvalue()
        self.assertIn('USERKEY_PLAT_NOMATCH', result)
        self.assertIn('rsv3', result)
        for hidden in ('fixture-js-public', 'fixture-security-code', '100.1,20.2', 'hidden-signature'):
            self.assertNotIn(hidden, result)

    def make_handler(self, path, host='127.0.0.1:8787', origin=None):
        h = object.__new__(guide.Handler)
        h.path = path
        h.server = SimpleNamespace(server_port=8787)
        h.headers = {'Host': host}
        if origin:
            h.headers['Origin'] = origin
        h.client_address = ('127.0.0.1', 12345)
        h.responses = []
        h.reply = lambda *args: h.responses.append(args)
        return h

    def test_local_host_and_origin_required(self):
        for host, origin in (('evil.example', None), ('127.0.0.1:8787', 'https://evil.example'),
                             ('127.0.0.1:8787', 'http://localhost:8787')):
            h = self.make_handler('/api/map/config', host, origin)
            h.do_GET()
            self.assertEqual(h.responses[0][0], 403)

    def test_cross_site_script_requests_do_not_use_local_map_credentials(self):
        for site in ('cross-site', 'same-site'):
            h = self.make_handler('/_AMapService/v3/log/init?callback=AMap.cb')
            h.headers['Sec-Fetch-Site'] = site
            with patch.object(server, 'proxy_amap', side_effect=AssertionError('must not proxy')):
                h.do_GET()
            self.assertEqual(h.responses[0][0], 403)

    def test_same_origin_script_request_is_allowed_without_origin_header(self):
        h = self.make_handler('/_AMapService/v3/log/init?callback=AMap.cb')
        h.headers['Sec-Fetch-Site'] = 'same-origin'
        with patch.object(server, 'proxy_amap', return_value=(b'AMap.cb({})', 'application/javascript')):
            h.do_GET()
        self.assertEqual(h.responses[0][0], 200)

    def test_hidden_and_private_files_not_served(self):
        for path in ('/.env.local', '/%2eenv.local', '/.git/config', '/server.py', '/tests/test_server.py', '/../.env.local',
                     '/tools/travel_map_service.py', '/.preview-data/baseline.json', '/user-data/trip.json'):
            h = self.make_handler(path)
            h.do_GET()
            self.assertEqual(h.responses[0][0], 404, path)

    def test_config_and_proxy_http_dispatch(self):
        h = self.make_handler('/api/map/config')
        h.do_GET()
        self.assertEqual(h.responses[0][0], 200)
        self.assertTrue(h.responses[0][1]['amapJsConfigured'])
        h = self.make_handler('/_AMapService/v3/log/init?callback=AMap.cb')
        with patch.object(server, 'proxy_amap', return_value=(b'AMap.cb({})', 'application/javascript')) as proxy:
            h.do_GET()
            proxy.assert_called_once_with('/_AMapService/v3/log/init', 'callback=AMap.cb', 'http://127.0.0.1:8787/')
        self.assertEqual(h.responses[0], (200, b'AMap.cb({})', 'application/javascript'))

    def test_existing_guide_health_still_identifies_workspace(self):
        h = self.make_handler('/api/guide-health')
        h.do_GET()
        self.assertEqual(h.responses[0][0], 200)
        self.assertEqual(h.responses[0][1]['service'], 'travel-guide-import-v1')
        self.assertEqual(h.responses[0][1]['workspace'], guide.sha(str(guide.ROOT).encode())[:12])

    def test_map_search_rate_limit_and_bounded_query(self):
        with patch.object(server, 'LAST_REQUEST', {}), patch.object(server, 'search', return_value={'candidates': []}) as search:
            h = self.make_handler('/api/map/poi?q=test&cityId=banna')
            h.do_GET()
            self.assertEqual(h.responses[0][0], 200)
            search.assert_called_once_with('test', 'banna')
            second = self.make_handler('/api/map/poi?q=test&cityId=banna')
            second.do_GET()
            self.assertEqual(second.responses[0][0], 429)
        with patch.object(server, 'LAST_REQUEST', {}):
            h = self.make_handler('/api/map/poi?' + '&'.join('x=1' for _ in range(21)))
            h.do_GET()
            self.assertEqual(h.responses[0][0], 400)


if __name__ == '__main__':
    unittest.main()
