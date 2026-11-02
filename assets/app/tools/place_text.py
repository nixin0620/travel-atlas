"""Explicit place mentions only; never turn topic tags or menu items into venues."""
import re, unicodedata

# Keep aligned with dot-import-core.js; shared fixtures verify both runtimes.
KIND_RULES = {'food': {'name': '(?:餐厅|餐馆|饭店|饭铺|小食馆|小吃馆|小馆|面馆|咖啡馆|咖啡店|茶室|冰屋|冷饮店|甜品店|米线(?:店|馆)?|早点|早餐|火锅(?:店)?|烧烤|卤烤|铁板烧|糯米饭|香芋包|小吃|凉拌)$',
          'hint': '美食|餐饮|咖啡|冷饮|甜品|米线|火锅|烧烤|小吃|糯米饭|炒冰|饭铺',
          'groups': ['美食|餐厅|餐馆|饭铺|小吃|米线|糯米饭|炒冰|火锅|烧烤|菜品|甜品|咖啡|猪油|番茄牛腩|手抓饭|烤鸡|烤鱼|傣味',
                     '口味|口感|味道|好吃|爱去吃|下饭|招牌菜|推荐菜|点单|续饭|加饭|奶香|汤底',
                     '人均|菜单|用餐|堂食|饭点|排队点餐|免费米饭|米饭自助']},
 'sight': {'name': '(?:植物园|公园|花卉园|博物馆|古寨|古城|寺|景区|瀑布|山)$',
           'hint': '植物园|公园|博物馆|景区|古城|古寨|寺庙|瀑布',
           'groups': ['游览|观景|风景|景观|植物|古迹|文物|建筑|展览|雨林', '门票|入园|景区|景点|景色|观光|栈道|登顶']},
 'shopping': {'name': '(?:购物中心|商场|买手店|百货|市集|集市|商店|书店)$',
              'hint': '购物|商场|买手店|百货|市集|集市|商店|书店',
              'groups': ['购物|买手|逛店|伴手礼|纪念品|特产|文创商品', '购买|选购|商品|零售|砍价|服饰|首饰|买回|茶叶店']},
 'experience': {'name': '(?:徒步|漂流|溯溪|手作|制陶|骑行|演出|体验(?:馆|课)?)$',
                'hint': '徒步|漂流|溯溪|手作|制陶|骑行|演出|体验课',
                'groups': ['徒步|漂流|溯溪|骑行|演出|制陶|陶艺|手作|手工课程', '向导|教练|课程|亲手|教学|预约体验|装备|排练|制作体验']}}
HEADING = re.compile(r'^\s*(?:[0-9]{1,2}\s*[.、．)）]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|📍|(?:店名|地点|店铺)\s*[:：])\s*(.{2,60})$')
LIST = re.compile(r'(?:依次是|分别是|店名(?:清单)?[：:]|店铺(?:清单)?[：:]|推荐(?:的)?(?:店铺|餐厅|景点)[：:])\s*([^。！!？?\n#]+)')

def kind(name, context='', title='', aliases=()):
    names = list(dict.fromkeys(re.sub(r'（[^）]*）|\([^)]*\)', '', unicodedata.normalize('NFKC', n)).strip() for n in [name, *aliases] if n))
    strong = [k for k, r in KIND_RULES.items() if any(re.search(r['name'], n) for n in names)]
    if len(strong) == 1: return strong[0]
    scores = sorted([(k, (4 if len(strong) < 2 and any(re.search(r['hint'], n) for n in names) else 0)
        + sum(2 for pattern in r['groups'] if re.search(pattern, context))
        + (1 if re.search(r['hint'], title) else 0)) for k, r in KIND_RULES.items()], key=lambda x: -x[1])
    return scores[0][0] if scores[0][1] >= 4 and scores[0][1] - scores[1][1] >= 2 else None

def classify_place(place, title=''):
    context = '\n'.join((r.get('label', '') + ' ' + r.get('text', '')) for r in place.get('reasons', []))
    context += '\n' + place.get('evidence', {}).get('classificationContext', '')
    place['kind'] = kind(place['name'], context, title, [place.get('card_name'), *place.get('aliases', [])])
    return place

def clean_name(value):
    return value.strip().strip('「」【】[] \t，,；;。')

def valid_name(name):
    return 2 <= len(name) <= 40 and not re.search(r'https?://|#|[，,。！!？?]|建议|注意事项|小贴士|交通方式|住宿推荐|营业时间|人均|必吃推荐|必打卡|攻略|合集|第[一二三四五六七八九十\d]+天|^\d+[月日点:：]', name)

def text_places(text, title=''):
    lines=text.splitlines(); headings=[]; result=[]; seen=set()
    def add(name, excerpt, evidence, context):
        name=clean_name(name); key=re.sub(r'\s+', '', name)
        if not valid_name(name) or key in seen: return
        seen.add(key)
        result.append({'rank':len(result)+1,'name':name,'kind':kind(name,excerpt or context,title),'card_name':None,
            'reasons':[{'label':'原文摘录','text':excerpt}] if excerpt else [],
            'recommendation_percentage':None,'evidence':{'text':evidence,'classificationContext':'' if excerpt else context},'unconfirmed':['具体地图位置待确认']})
    for i,line in enumerate(lines):
        m=HEADING.match(line)
        if m:
            parts=re.split(r'\s*[：:｜|—–]\s*',m[1],maxsplit=1)
            if valid_name(clean_name(parts[0])):headings.append((i,parts[0],parts[1] if len(parts)>1 else ''))
    for n,(i,name,inline) in enumerate(headings):
        end=headings[n+1][0] if n+1<len(headings) else len(lines)
        excerpt='\n'.join([inline]+[re.split(r'#',x)[0] for x in lines[i+1:end]]).strip()
        add(name,excerpt,lines[i],'')
    for match in LIST.finditer(text):
        parts=re.split(r'[、，,；;]',match[1])
        if len(parts)<2:continue
        for part in parts:add(part,'',match[0],text[max(0,match.start()-300):match.start()].split('#')[0])
    return result[:100]


def match_images(places, images):
    """Only attach a whole note image if its OCR names exactly one known venue."""
    def norm(value):return re.sub(r'[\s·•・，,。()（）\-—]', '', value).lower()
    for p in places:p['image_indices']=[]
    for i,image in enumerate(images):
        raw=norm(image.get('ocrText',''))
        found=[p for p in places if len(norm(p['name']))>=3 and norm(p['name']) in raw]
        if len(found)==1:
            p=found[0];p['image_indices'].append(i)
            p.setdefault('evidence',{}).setdefault('image_matches',[]).append({'image_index':i,'name':p['name'],'method':'ocr_name_match'})
            excerpt='\n'.join(line.strip() for line in image.get('ocrText','').splitlines()
                if line.strip() and norm(p['name']) not in norm(line) and not line.strip().startswith('#'))
            if excerpt and not any(r['text']==excerpt for r in p['reasons']):
                p['reasons'].append({'label':'配图摘录','text':excerpt,'image_index':i})
    return places
