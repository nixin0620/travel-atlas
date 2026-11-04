"""Synthetic article fixtures; live smoke results are recorded separately."""
import io, json, sys, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import place_discovery as d
import place_facts as f
import guide_server as server

def article(name='测试村', city='西双版纳景洪市'):
    return f'''<title>云南省民族宗教事务委员会</title><p>2024-05-11</p>
    <h2>外省村：村落文化</h2><p>外省村位于临沧市，传统建筑保存完好。</p>
    <h2>{name}：村落文化</h2><p>{name}位于{city}，村间保留着传统建筑。</p>
    <img src="/uploadfile/test.jpg" width="800" height="500"><p>村内可以了解手工艺的制作过程。</p>
    <script>神秘村：自动忽略</script>'''

class Discovery(unittest.TestCase):
    def setUp(self): d.CACHE.clear()
    def test_names_and_evidence_come_from_received_headings(self):
        rows=d.extract(d.DOCUMENTS[0],article(),'2026-10-19')
        self.assertEqual([p['name'] for p in rows],['测试村'])
        self.assertTrue(all(r['text'] in article() for r in rows[0]['evidence']['reasons'][:-1]))
        changed=d.extract(d.DOCUMENTS[0],article('换一个村'),'2026-10-19')
        self.assertEqual(changed[0]['name'],'换一个村');self.assertNotEqual(changed[0]['sourceId'],rows[0]['sourceId'])
        self.assertNotIn('recommendationPercentage',str(rows))
    def test_wrong_city_and_prose_mentions_do_not_become_candidates(self):
        self.assertEqual(d.extract(d.DOCUMENTS[0],article(city='临沧市'),'now'),[])
        self.assertEqual(d.extract(d.DOCUMENTS[0],'<p>云南省民族宗教事务委员会 2024-05-11 西双版纳景洪市测试村有传统建筑。</p>','now'),[])
    def test_images_bound_to_section_and_allowlisted_hosts(self):
        html=article().replace('<h2>测试村', '<img src="https://evil.example/secret"><h2>测试村')
        rows=d.extract(d.DOCUMENTS[0],html,'now')
        self.assertEqual(rows[0]['photos'][0]['url'],'https://mz.yn.gov.cn/uploadfile/test.jpg')
        self.assertEqual(len(rows[0]['photos']),1)
    def test_restrictions_and_missing_publisher_stop_extraction(self):
        for html in [article()+'<p>验证码</p>',article().replace('云南省民族宗教事务委员会','其他作者')]:
            with self.assertRaises(d.SourceUnavailable):d.extract(d.DOCUMENTS[0],html,'now')
    def test_no_hardcoded_places_on_failure_and_partial_success(self):
        self.assertEqual(d.discover({'cityId':'banna','topic':'villages'},Mock(side_effect=TimeoutError()),1000)['places'],[])
        d.CACHE.clear()
        result=d.discover({'cityId':'banna','topic':'villages'},lambda url:article() if url==d.DOCUMENTS[0]['url'] else '',1000)
        self.assertEqual(result['status'],'partial');self.assertEqual(result['documentsRead'],1)
    def test_unsupported_context_does_not_fetch_and_client_cannot_choose_url(self):
        loader=Mock(return_value=article())
        self.assertEqual(d.discover({'cityId':'puer','topic':'villages'},loader)['status'],'unsupported');loader.assert_not_called()
        d.discover({'cityId':'banna','topic':'villages','url':'http://localhost/private'},loader,1000)
        self.assertEqual({c.args[0] for c in loader.call_args_list},{x['url'] for x in d.DOCUMENTS})
        for payload in [{},{'cityId':[],'topic':'villages'},{'cityId':'banna','topic':'bad'}]:
            with self.assertRaises(ValueError):d.discover(payload,loader)
    def test_cache_no_repeated_fetch_and_no_shared_mutation(self):
        loader=Mock(return_value=article());p={'cityId':'banna','topic':'villages'}
        result=d.discover(p,loader,1000);result['places'].clear()
        self.assertTrue(d.discover(p,loader,1001)['places']);self.assertEqual(loader.call_count,2)
    def test_endpoint_guards(self):
        h=object.__new__(server.Handler);h.server=SimpleNamespace(server_port=8787);h.path='/api/place-discovery'
        h.headers={'Host':'127.0.0.1:8787','Origin':'https://evil.example','X-Travel-Import':'1','Content-Length':'2'}
        h.rfile=io.BytesIO(b'{}');h.reply=Mock()
        with patch.object(server,'discover') as lookup:
            h.do_POST();self.assertEqual(h.reply.call_args.args[0],403);lookup.assert_not_called()
        h.headers['Origin']='http://127.0.0.1:8787';h.headers['Content-Length']='9000';h.do_POST();self.assertEqual(h.reply.call_args.args[0],413)

class PlatformDiscovery(unittest.TestCase):
    def setUp(self): f.CACHE.clear()
    def markup(self, provider, intro='村落保留著傣樓與古樹，可以欣賞傳統建築。'):
        name=provider['identity'][0]
        data={'props':{'pageProps':{'topInfo':{'poiInfo':{'poiName':name,'poiIntroduce':intro},'basicInfo':{'coverImage':{'url':'https://ak-d.tripcdn.com/images/test.jpg'}}},'momentList':[{'text':'假点评999元'}]}}}
        return f'<h1>{name}</h1><h3>的地址：</h3><div>西雙版納景洪市</div><h3>推薦遊覽時間</h3><div>1–2小時</div><script id="__NEXT_DATA__">{json.dumps(data,ensure_ascii=False)}</script>'
    def test_only_live_matched_platform_intro_can_create_candidate(self):
        providers=[p for p in f.PROVIDERS if p['parser']=='trip']; loader=lambda url:self.markup(next(p for p in providers if p['url']==url)) if url in [p['url'] for p in providers] else ''
        result=d.discover_platforms({'cityId':'banna','topic':'villages'},loader,1000)
        self.assertEqual(result['status'],'ready');self.assertEqual(len(result['places']),4)
        self.assertTrue(all(p['evidence']['type']=='platform' and p['evidence']['reasons'][0]['text']=='村落保留著傣樓與古樹' for p in result['places']))
        self.assertNotIn('999',str(result));self.assertNotIn('政府',str(result))
        # Reuse fetched data; facts do not add a duplicate source or refetch.
        never=Mock(side_effect=AssertionError('should use cache'))
        facts=f.lookup({'cityId':'banna','name':'曼远村','missing':['time']},never,1001)
        self.assertEqual(facts['facts'][0]['text'],'1–2小时');never.assert_not_called()
    def test_failure_missing_introduction_and_identity_do_not_invent_places(self):
        for loader in [Mock(side_effect=TimeoutError()),lambda url:'<p>验证码</p>',lambda url:'<h1>别的地点</h1>']:
            f.CACHE.clear();self.assertEqual(d.discover_platforms({'cityId':'banna','topic':'villages'},loader,1000)['places'],[])
        provider=next(p for p in f.PROVIDERS if p['parser']=='trip')
        self.assertEqual(f.trip_introduction(provider,self.markup(provider,'')),[])
        self.assertEqual(f.trip_introduction(provider,self.markup(provider).replace(provider['identity'][0],'其他古寨')),[])
    def test_unknown_city_never_queries_arbitrary_source(self):
        loader=Mock();self.assertEqual(d.discover_platforms({'cityId':'puer','topic':'villages','url':'http://localhost/private'},loader)['status'],'unsupported');loader.assert_not_called()

if __name__=='__main__':unittest.main()
