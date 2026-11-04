"""Offline generated fixtures test the contract, not live availability."""
import io, json, sys, unittest, tempfile, datetime as dt
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import place_facts as f
import guide_server as server
HTML='''<html><h1>中国科学院西双版纳热带植物园</h1>
<p>成人全价票：123元/人</p><p>游览车：50元/人</p>
<p>西游览区共5个上车站点，参观游玩一般需2.7小时左右。</p>
<p>全园（西游览区+东游览区）：游玩一般需4-6小时。</p>
<p>对于年长或行动不便的游客，我们推荐您游览西游览区。</p>
<p>门票限当日使用，逾期自动失效，系统无法核验。</p>
<script>成人全价票：999元/人</script></html>'''
PLACE={'name':'中科院植物园','cityId':'banna','missing':['budget','time','caution']}
class Facts(unittest.TestCase):
 def setUp(self): f.CACHE.clear()
 def test_extracts_only_received_text_and_preserves_scope(self):
  r=f.lookup(PLACE,lambda _:HTML,1000)
  self.assertEqual(r['status'],'verified');self.assertEqual(r['facts'][0]['text'],'成人全价票：123元/人')
  self.assertEqual(len(r['facts']),4);self.assertTrue(all(x['text'] in HTML for x in r['facts']))
  self.assertNotIn('999',json.dumps(r));self.assertNotIn('50元',json.dumps(r,ensure_ascii=False));self.assertIn('全园',r['facts'][2]['text']);self.assertEqual(r['source']['publishedAt'],'')
 def test_no_fetch_for_unknown_or_wrong_city(self):
  loader=Mock()
  for p in [{**PLACE,'name':'不知名植物园'},{**PLACE,'cityId':'puer'}]:self.assertEqual(f.lookup(p,loader)['status'],'unconfirmed')
  loader.assert_not_called()
 def test_access_restrictions_and_identity(self):
  for markup in ['<p>验证码</p>'+HTML,'<p>其他植物园 成人全价票：80元</p>','<h1>请先登录</h1>']:
   f.CACHE.clear();r=f.lookup(PLACE,lambda _:markup);self.assertEqual(r['status'],'unconfirmed');self.assertEqual(r['facts'],[])
 def test_no_canned_price_on_failure(self):
  r=f.lookup(PLACE,Mock(side_effect=TimeoutError()));self.assertEqual(r['reason'],'source_unavailable');self.assertEqual(r['facts'],[])
 def test_cache_ttl_and_field_filter(self):
  loader=Mock(return_value=HTML);f.lookup(PLACE,loader,1000);r=f.lookup({**PLACE,'missing':['time']},loader,1001)
  self.assertEqual(loader.call_count,1);self.assertTrue(all(x['field']=='time' for x in r['facts']))
  f.lookup(PLACE,loader,22601);self.assertEqual(loader.call_count,2)
 def test_public_reports_do_not_create_current_prices(self):
  facts=f.extract(f.provider_for('banna','曼掌村'),'<p>曼掌村提供手工作品体验。</p><p>报道时收费88元。</p>')
  self.assertTrue(facts);self.assertTrue(all(x['field']=='experience' for x in facts));self.assertNotIn('88',str(facts))
 def test_client_cannot_choose_url(self):
  loader=Mock(return_value=HTML);f.lookup({**PLACE,'url':'http://127.0.0.1/private'},loader);loader.assert_called_once_with(f.PROVIDERS[0]['url'])
 def test_redirects_and_private_ips_rejected(self):
  original=f.PROVIDERS[0]['url']
  for url in ['https://evil.example/2022/ykfw/dzsw/','https://xtbg.ac.cn/login','https://user:pass@xtbg.ac.cn/2022/ykfw/dzsw/','http://xtbg.ac.cn/2022/ykfw/dzsw/']:
   with self.assertRaises(f.SourceUnavailable):f.validate_source_url(url,original)
  with patch.object(f.socket,'getaddrinfo',return_value=[(2,1,6,'',('127.0.0.1',443))]):
   with self.assertRaises(f.SourceUnavailable):f.validate_source_url(original,original)
 def test_request_limits(self):
  for payload in [{},{'places':[]},{'places':[PLACE]*5},{'places':['bad']},{'places':[{**PLACE,'missing':['rating']}]}]:
   with self.assertRaises((ValueError,TypeError)):f.lookup_many(payload)
 def request(self,body,headers=None):
  h=object.__new__(server.Handler);h.server=SimpleNamespace(server_port=8787);h.path='/api/place-facts'
  h.headers={'Host':'127.0.0.1:8787','Origin':'http://127.0.0.1:8787','X-Travel-Import':'1','Content-Length':str(len(body)),**(headers or {})}
  h.rfile=io.BytesIO(body);h.reply=Mock();h.do_POST();return h.reply.call_args.args
 def test_endpoint_origin_and_size_guards(self):
  with patch.object(server,'lookup_many') as lookup:
   self.assertEqual(self.request(b'{}',{'Origin':'https://evil.example'})[0],403)
   self.assertEqual(self.request(b'{}',{'X-Travel-Import':''})[0],403)
   self.assertEqual(self.request(b'{}',{'Content-Length':'999999'})[0],413)
   self.assertEqual(self.request(b'[')[0],400);lookup.assert_not_called()
 def test_endpoint_returns_structured_sources(self):
  expected={'results':[{'status':'unconfirmed','facts':[]}]}
  with patch.object(server,'lookup_many',return_value=expected):self.assertEqual(self.request(json.dumps({'places':[PLACE]}).encode()),(200,expected))

class Platforms(unittest.TestCase):
 def setUp(self):
  f.CACHE.clear();self.provider=next(p for p in f.PROVIDERS if p.get('parser')=='trip' and p['names'][0]=='曼远村')
  self.html="""<h1>Manyuan Village Travel Guide</h1>
<h3>Manyuan Village Address:</h3><div>云南省西双版纳傣族自治州景洪市勐罕镇曼远村</div>
<h3>Manyuan Village Recommended sightseeing time:</h3><div>2–4 hours</div>
<h3>Manyuan Village Opening times:</h3><div>Open year-round, 24/7</div>
<h3>Manyuan Village Ticket Price</h3><div>Free admission</div>
<h2>Traveler reviews</h2><p>Best ever! 999 yuan! 30 minutes! 5/5!</p>"""
 def test_scoped_fields_exclude_reviews_and_keep_original_quote(self):
  facts=f.extract(self.provider,self.html)
  self.assertEqual({x['field'] for x in facts},{'time','hours','budget'})
  self.assertEqual(next(x['text'] for x in facts if x['field']=='time'),'2–4 小时')
  self.assertTrue(all(x['quote'] in self.html for x in facts));self.assertNotIn('999',str(facts))
 def test_wrong_place_city_and_restriction_are_not_accepted(self):
  for html in [self.html.replace('<h1>Manyuan Village','<h1>Another village'),self.html.replace('云南省西双版纳傣族自治州景洪市','云南省普洱市'),'<p>验证码</p>'+self.html]:
   with self.assertRaises(f.SourceUnavailable):f.extract(self.provider,html)
 def test_unknown_or_product_price_not_translated_to_free(self):
  facts=f.extract(self.provider,self.html.replace('Free admission','Tickets from S$ 99').replace('2–4 hours','Not available'))
  self.assertEqual([x['field'] for x in facts],['hours'])
 def test_matching_live_source_is_required_and_failures_have_no_fallback_facts(self):
  place={'cityId':'banna','name':'曼远村','missing':['time','budget','hours']}
  result=f.lookup(place,lambda url:self.html)
  self.assertEqual(result['status'],'verified');self.assertEqual(result['sources'][0]['type'],'platform')
  self.assertEqual(result['source']['url'],self.provider['url'])
  f.CACHE.clear();self.assertEqual(f.lookup(place,Mock(side_effect=TimeoutError()))['facts'],[])
 def test_tw_fields_remain_separate_from_time_in_reviews(self):
  provider=next(p for p in f.PROVIDERS if p.get('identity')==['曼掌村'])
  html='<h1>曼掌村攻略</h1><h3>曼掌村的地址：</h3><div>西雙版納景洪市</div><h3>曼掌村的推薦遊覽時間：</h3><div>1–3小時</div><h3>曼掌村的門票價格</h3><div>免費入場</div><p>用户说游玩2天</p>'
  self.assertEqual(f.extract(provider,html)[0]['text'],'1–3小时')


 def test_only_matching_poi_cover_is_used_not_review_or_other_place_photos(self):
  def markup(name,url):return '<script id="__NEXT_DATA__" type="application/json">'+json.dumps({'props':{'pageProps':{'topInfo':{'poiInfo':{'poiName':name},'basicInfo':{'coverImage':{'url':url}}}}}})+'</script>'
  url='https://ak-d.tripcdn.com/images/cover.jpg'
  self.assertEqual(f.trip_photo(self.provider,markup('Manyuan Village',url))['url'],url)
  for name,bad in [('Other Village',url),('Manyuan Village','http://127.0.0.1/image'),('Manyuan Village','https://evil.example/image')]:self.assertIsNone(f.trip_photo(self.provider,markup(name,bad)))

class PublicCache(unittest.TestCase):
 def test_success_cache_retains_retrieval_time_and_expires(self):
  provider=next(p for p in f.PROVIDERS if p['parser']=='trip');checked=dt.datetime.fromtimestamp(1000,dt.timezone.utc).isoformat()
  result={'source':{'url':provider['url'],'type':'platform','checkedAt':checked},'facts':[{'field':'time','text':'1–2小时','quote':'1–2小時'},{'field':'experience','text':'村中保留传统建筑','quote':'村中保留传统建筑'}]}
  with tempfile.TemporaryDirectory() as folder,patch.object(f,'PUBLIC_CACHE',Path(folder)):
   f.save_public_cache(provider,{'result':result,'expires':22600})
   self.assertEqual(f.read_public_cache(provider,1001)['result'],result)
   self.assertIsNone(f.read_public_cache(provider,22601));
   stale=f.read_public_cache(provider,22601,stable_only=True);self.assertEqual([x['field'] for x in stale['result']['facts']],['experience']);self.assertEqual(stale['result']['source']['checkedAt'],checked);self.assertIsNone(f.read_public_cache(provider,1000+7*86400,stable_only=True));
   self.assertIsNone(f.read_public_cache(provider,999))
   wrong={**result,'source':{**result['source'],'url':'https://wrong.example'}}
   f.save_public_cache(provider,{'result':wrong,'expires':22600});self.assertIsNone(f.read_public_cache(provider,1001))
 def test_failure_does_not_replace_success_and_cached_artifacts_are_not_public(self):
  provider=next(p for p in f.PROVIDERS if p['parser']=='trip')
  with tempfile.TemporaryDirectory() as folder,patch.object(f,'PUBLIC_CACHE',Path(folder)):
   f.save_public_cache(provider,{'result':{'facts':[]},'expires':2000});self.assertFalse(f.cache_file(provider).exists())
  self.assertTrue(f.PUBLIC_CACHE.relative_to(Path(__file__).resolve().parents[2]).parts[0].startswith('.'))

if __name__=='__main__':unittest.main()
