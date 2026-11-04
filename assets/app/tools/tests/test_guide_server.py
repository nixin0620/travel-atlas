"""Offline fixtures test parsing logic only, not real-link accessibility."""
import sys, json, unittest, tempfile, base64
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import guide_server as g

class Parsing(unittest.TestCase):
    def test_links_and_tracking(self):
        text='分享 https://www.xiaohongshu.com/discovery/item/0123456789abcdef01234567?xsec_token=FAKE&appuid=PERSONAL；https://www.xiaohongshu.com/s/dot?dot_share_id=EXAMPLE&file_id=active_search/test'
        urls=g.links(text)
        self.assertEqual(len(urls),2)
        self.assertNotIn('PERSONAL',' '.join(urls))
        self.assertNotIn('FAKE',g.normalize(urls[0],False))
        self.assertEqual(len(g.links('['+text.split('；')[0]+'](https://xhslink.com/a/example)')),2)
    def test_reject_hosts_and_credentials(self):
        for url in ['http://127.0.0.1/','https://www.xiaohongshu.com.evil.test/s/dot','https://u:p@www.xiaohongshu.com/s/dot','file:///etc/passwd']:
            with self.assertRaises(g.ImportFailure): g.normalize(url)
    def test_ssr_is_json_not_javascript(self):
        note={'title':'测试正文','desc':'1. 测试植物园\n花木很多\n2. 测试咖啡店\n窗边可坐','imageList':[]}
        doc='<script>window.__INITIAL_STATE__='+json.dumps({'note':{'noteDetailMap':{'x':{'note':note}}}},ensure_ascii=False)+'</script>'
        parsed=g.note_content(doc)
        self.assertEqual(parsed['text'],note['desc'])
        self.assertEqual([p['name'] for p in g.text_places(parsed['text'])],['测试植物园','测试咖啡店'])
        self.assertEqual(g.note_content('<script>window.__INITIAL_STATE__=runMalicious()</script>'),None)
    def test_requested_note_only(self):
        notes={'one':{'note':{'title':'第一篇','desc':'第一篇正文'}},'two':{'note':{'title':'第二篇','desc':'第二篇正文'}}}
        doc='<script>window.__INITIAL_STATE__='+json.dumps({'note':{'noteDetailMap':notes}})+'</script>'
        self.assertEqual(g.note_content(doc,'two')['title'],'第二篇')
        self.assertIsNone(g.note_content(doc,'missing'))
    def test_undefined_inside_string_unchanged(self):
        doc='<script>window.__INITIAL_STATE__={"ignored":undefined,"note":{"noteDetailMap":{"a":{"note":{"title":"测试","desc":"literal undefined stays"}}}}}</script>'
        self.assertEqual(g.note_content(doc)['text'],'literal undefined stays')
    def test_summary_not_claimed_as_full_text(self):
        self.assertIsNone(g.note_content('<meta name="description" content="登录看全文"><h1>只有标题</h1>'))
    def test_unstructured_prose_not_invented(self):
        self.assertEqual(g.text_places('这里风景很好，建议吃完午饭再去。'),[])
    def test_access_restriction_stops(self):
        with patch.object(g.ur.OpenerDirector,'open',side_effect=g.AccessRestricted()):
            with self.assertRaises(g.ImportFailure) as e: g.fetch('https://www.xiaohongshu.com/',100)
            self.assertEqual(e.exception.code,'access_restricted')
    def test_blocked_html_not_saved(self):
        with patch.object(g,'fetch',return_value=(b'<h1>\xe5\xae\x89\xe5\x85\xa8\xe9\xaa\x8c\xe8\xaf\x81</h1>','https://www.xiaohongshu.com/explore/0123456789abcdef01234567')):
            with self.assertRaises(g.ImportFailure) as e:g.parse('https://www.xiaohongshu.com/explore/0123456789abcdef01234567')
            self.assertEqual(e.exception.code,'access_restricted')
if __name__=='__main__':unittest.main()

class PlaceEntities(unittest.TestCase):
    def test_full_body_and_every_matched_image_excerpt_kept(self):
        reason='正文理由。'*500
        s={'title':'美食合集','text':'1. 测试茶室\n'+reason,'images':[{'ocrText':'测试茶室\n周一休息'},{'ocrText':'测试茶室\n请提前预约'}]}
        p=g.note_places(s)[0]
        self.assertEqual([r['text'] for r in p['reasons']],[reason,'周一休息','请提前预约'])
        self.assertEqual(p['image_indices'],[0,1])
    def test_original_image_bytes_and_dimensions_preserved_without_recompression(self):
        original=b'\x89PNG'+b'x'*(4*1024*1024)
        with tempfile.TemporaryDirectory() as tmp, patch.object(g,'fetch',return_value=(original,'')), patch.object(g.subprocess,'run',return_value=SimpleNamespace(stdout='pixelWidth: 1800\npixelHeight: 2400')) as process:
            image,ocr=g.image_data('https://sns-webpic-qc.xhscdn.com/test.jpg',Path(tmp),0)
        self.assertEqual(base64.b64decode(image['data'].split(',',1)[1]),original)
        self.assertEqual((image['width'],image['height']),(1800,2400))
        self.assertEqual(image['kind'],'original');self.assertIsNone(ocr)
        self.assertNotIn('--resampleWidth',process.call_args.args[0])
    def test_synthetic_enumeration_keeps_all_13_mentions_not_title_count(self):
        fixture=json.loads((Path(__file__).resolve().parents[2]/'tests/fixtures/food-list.json').read_text())
        places=g.text_places(fixture['text'],fixture['title'])
        self.assertEqual([p['name'] for p in places],fixture['names'])
        self.assertEqual({p['kind'] for p in places},{'food'})
        self.assertTrue(all(not p['reasons'] for p in places)) # no made-up per-shop reasons
        self.assertTrue(all(p['evidence']['text'].startswith('依次是') for p in places))
    def test_categories_and_no_menu_or_topic_entities(self):
        places=g.text_places('1. 测试植物园\n绿荫很多\n2. 测试咖啡馆\n3. 制陶体验\n4. 测试商场')
        self.assertEqual([p['kind'] for p in places],['sight','food','experience','shopping'])
        self.assertEqual(g.text_places('推荐菜：米线、火锅、凉拌菜\n#餐馆[话题]#\n1. 注意事项\n2. 人均60元'),[])
    def test_image_names_match_one_place_without_using_list_order(self):
        source={'title':'小店合集','text':'依次是测试小馆、测试咖啡馆、测试茶室','images':[
            {'ocrText':'测试茶室\n门口绿植很多'},
            {'ocrText':'测试小馆 和 测试咖啡馆 合集封面'},
            {'ocrText':'测试咖啡馆\n窗边座位'},
            {'ocrText':'纯风景，不含店名'}]}
        p=g.note_places(source)
        self.assertEqual([x['image_indices'] for x in p],[[],[2],[0]])
    def test_image_only_explicit_shop_names_are_extracted(self):
        s={'title':'美食合集','text':'小店推荐','images':[{'ocrText':'店名：测试米线店\n汤底浓郁'}]}
        p=g.note_places(s)
        self.assertEqual(p[0]['name'],'测试米线店');self.assertEqual(p[0]['image_indices'],[0])
    def test_reparse_saved_text_is_network_free(self):
        with patch.object(g,'fetch',side_effect=AssertionError('network must not run')):
            r=g.reparse_saved({'url':'https://www.xiaohongshu.com/explore/0123456789abcdef01234567','title':'美食','text':'依次是测试小馆、测试茶室','images':[]})
        self.assertEqual(len(r['places']),2)
    def test_reparse_rejects_non_image_and_oversized_arrays(self):
        s={'url':'https://www.xiaohongshu.com/explore/0123456789abcdef01234567','text':'正文','images':[{'data':'data:image/svg+xml,<svg/>'}]}
        with self.assertRaises(g.ImportFailure):g.reparse_saved(s)
        s['images']=[{}]*25
        with self.assertRaises(g.ImportFailure):g.reparse_saved(s)

class CategoryRegression(unittest.TestCase):
    def test_same_classification_contract_in_python_and_browser(self):
        from place_text import kind
        cases=json.loads((Path(__file__).resolve().parents[2]/'tests/fixtures/place-classification.json').read_text())
        for case in cases:
            with self.subTest(name=case['name'],context=case['context']):
                self.assertEqual(kind(case['name'],case['context'],case.get('title',''),case.get('aliases',[])),case['expected'])
    def test_dot_uses_per_place_reasons_and_title_without_name_only_overwrite(self):
        place={'rank':1,'name':'南风','card_name':None,'reasons':[{'label':'招牌','text':'炒冰口感绵密，人均30元。'}],'evidence':{}}
        with patch.object(g,'extract',return_value={'places':[place]}):
            rows=g.dot_places({'width':100,'height':100},None,{'title':'旅行推荐','images':[]},{},None)
        self.assertEqual(rows[0]['kind'],'food')
    def test_note_uses_matching_image_reason_after_ocr(self):
        source={'title':'旅行攻略','text':'1. 测试南风','images':[{'ocrText':'测试南风\n炒冰口感绵密，人均30元。'}]}
        rows=g.note_places(source)
        self.assertEqual(rows[0]['kind'],'food');self.assertEqual(rows[0]['image_indices'],[0])
    def test_neighbouring_places_do_not_inherit_the_previous_paragraph(self):
        rows=g.text_places('1. 南风\n炒冰口感绵密，人均30元。\n2. 北风\n位于市区，交通方便。','美食攻略')
        self.assertEqual([p['kind'] for p in rows],['food',None])

class PlacePhotos(unittest.TestCase):
    def fixture(self, folder):
        from PIL import Image, ImageDraw
        image=Image.new('RGB',(600,1100),'white');draw=ImageDraw.Draw(image)
        # Fine text / divider and a flat coloured panel must not become photos.
        draw.rectangle((40,80,550,90),fill=(60,100,80));draw.rectangle((40,150,550,260),fill=(180,200,130))
        # A textured photo within the SECOND place's section.
        pixels=image.load()
        for y in range(700,950):
            for x in range(40,290):pixels[x,y]=((x*3+y)%180+30,(y*2)%160+20,(x+y*3)%150+10)
        path=Path(folder)/'source.png';image.save(path)
        places=[{'rank':1,'name':'测试一','sourceId':'dot:one','evidence':{'heading_bbox':[40,20,200,30]}},
                {'rank':2,'name':'测试二','sourceId':'dot:two','evidence':{'heading_bbox':[40,600,200,30]}}]
        return path,places
    def test_section_matching_never_uses_neighbouring_photos_or_flat_panels(self):
        from place_photos import section_photos
        with tempfile.TemporaryDirectory() as folder:
            path,places=self.fixture(folder);boxes=section_photos(path,places,600,1100)
        self.assertNotIn(1,boxes);self.assertIn(2,boxes);x,y,w,h=boxes[2]
        self.assertGreater(y,600);self.assertLessEqual(y+h,1100)
    def test_saved_image_repair_is_network_free_preserves_original_and_matches_place_id(self):
        with tempfile.TemporaryDirectory() as folder:
            path,places=self.fixture(folder);raw=path.read_bytes()
            payload={'image':{'data':'data:image/png;base64,'+base64.b64encode(raw).decode(),'width':600,'height':1100,'sha256':g.sha(raw)},'places':places}
            before=json.dumps(payload)
            with patch.object(g,'fetch',side_effect=AssertionError('must not fetch')),patch.object(g,'recognize',side_effect=AssertionError('must not OCR')):
                repaired=g.repair_photos(payload)
            self.assertEqual(path.read_bytes(),raw)
        self.assertEqual(len(repaired['images']),1);self.assertEqual(repaired['matches'][0]['sourceId'],'dot:two')
        self.assertEqual(repaired['parentSha256'],g.sha(raw));self.assertEqual(repaired['images'][0]['crop']['method'],'section_photo_region')
    def test_repair_rejects_bad_image_hash_and_out_of_bounds_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            path,places=self.fixture(folder);raw=path.read_bytes()
            payload={'image':{'data':'data:image/png;base64,'+base64.b64encode(raw).decode(),'width':600,'height':1100,'sha256':'invalid'},'places':places}
            with self.assertRaises(g.ImportFailure):g.repair_photos(payload)
            payload['image']['sha256']=g.sha(raw);places[0]['evidence']['heading_bbox']=[0,-50,200,30]
            with self.assertRaises(g.ImportFailure):g.repair_photos(payload)
    def test_missing_optional_image_decoder_keeps_safe_fallback(self):
        import place_photos
        with patch.object(place_photos,'Image',None):self.assertEqual(place_photos.section_photos(None,[],600,1100),{})
