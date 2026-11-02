#!/usr/bin/env python3
"""Geometry-based extraction from real OCR observations. Contains no destination dictionary."""
import argparse
import json
from pathlib import Path
import re
from difflib import SequenceMatcher
from probe import sha


def norm(text):
    return re.sub(r'\s+', '', text)


def deduplicate(observations):
    rows = []
    for row in sorted(observations, key=lambda r:(r['bbox'][1],r['bbox'][0])):
        same = next((r for r in rows[-15:] if abs(r['bbox'][1]-row['bbox'][1])<22
                     and abs(r['bbox'][0]-row['bbox'][0])<75
                     and SequenceMatcher(None,norm(r['text']),norm(row['text'])).ratio()>.70),None)
        if same:
            if (row['confidence'],len(row['text']))>(same['confidence'],len(same['text'])):
                rows[rows.index(same)] = row
        else:
            rows.append(dict(row))
    return sorted(rows,key=lambda r:(r['bbox'][1],r['bbox'][0]))


def extract(ocr):
    rows=deduplicate(ocr['observations']); width=ocr['width']
    headings=[]
    for row in rows:
        m=re.match(r'^\s*(\d{1,2})[.．、]\s*([\u3400-\u9fff].+?)\s*$',row['text'])
        if m and row['bbox'][0]<width*.2 and row['bbox'][3]>width*.025:
            headings.append((int(m[1]),m[2],row))
    percentages=[r for r in rows if re.search(r'(\d+(?:\.\d+)?)\s*[%％]\s*人推荐',r['text'])]
    places=[]
    for i,(rank,name,heading) in enumerate(headings):
        y=heading['bbox'][1]; end=headings[i+1][2]['bbox'][1] if i+1<len(headings) else ocr['height']
        section=[r for r in rows if y<=r['bbox'][1]<end]
        rate=next((r for r in percentages if abs(r['bbox'][1]-y)<width*.05),None)
        percentage=float(re.search(r'(\d+(?:\.\d+)?)\s*[%％]',rate['text'])[1]) if rate else None
        if percentage is not None and percentage.is_integer():percentage=int(percentage)
        alias=next((r for r in section if width*.18<r['bbox'][0]<width*.4 and width*.06<r['bbox'][1]-y<width*.15),None)
        paragraphs=[]
        for r in section:
            if r['bbox'][3]<width*.034 or r['bbox'][0]>width*.3:continue
            label=re.search(r'([\u3400-\u9fff]{1,8})[：:]',r['text'])
            if label:
                raw=r['text'][label.start():]
                paragraphs.append({'label':label[1],'text':raw,'ocr_line_texts':[r['text']],
                                   'evidence_boxes':[r['bbox']],'tiles':[r['tile']],
                                   'ocr_confidence_min':r['confidence'],'verification':'ocr_unverified'})
            elif paragraphs:
                current=paragraphs[-1]; previous=current['evidence_boxes'][-1]
                if 20<r['bbox'][1]-previous[1]<width*.085:
                    current['text']+=r['text']; current['ocr_line_texts'].append(r['text'])
                    current['evidence_boxes'].append(r['bbox']);current['tiles'].append(r['tile'])
                    current['ocr_confidence_min']=min(current['ocr_confidence_min'],r['confidence'])
        table_rate=None
        before=[r for r in rows if r['bbox'][1]<headings[0][2]['bbox'][1] and norm(r['text'])==norm(name)]
        if before:
            pair=next((r for r in percentages if 0<=r['bbox'][1]-before[0]['bbox'][1]<width*.07),None)
            if pair:table_rate=float(re.search(r'(\d+(?:\.\d+)?)\s*[%％]',pair['text'])[1])
        places.append({'rank':rank,'name':name,'card_name':alias['text'] if alias else None,
                       'recommendation_percentage':percentage,'recommendation_label':rate['text'] if rate else None,
                       'percentage_denominator':None,'overview_percentage':table_rate,
                       'overview_detail_consistent':table_rate==percentage if table_rate is not None and percentage is not None else None,
                       'reasons':paragraphs,'evidence':{'heading_bbox':heading['bbox'],'heading_tile':heading['tile'],
                                                     'card_name_bbox':alias['bbox'] if alias else None,
                                                     'percentage_bbox':rate['bbox'] if rate else None},
                       'coordinates':None,'canonical_place_id':None,
                       'unconfirmed':['Percent denominator/statistical method not published in the share.',
                                      'Place identity, coordinates and current travel facts not independently verified.',
                                      'OCR paragraphs may contain substitutions; raw lines and image boxes retained.']})
    reference=next((re.search(r'参考\s*(\d+)\s*人',r['text']) for r in rows if re.search(r'参考\s*(\d+)\s*人',r['text'])),None)
    return {'places':places,'reference_experience_count_as_displayed':int(reference[1]) if reference else None,
            'ocr_lines':rows, 'heading_ranks_contiguous':bool(headings) and [p['rank'] for p in places]==list(range(1,len(places)+1))}


def process(out):
    result=json.loads((out/'result.json').read_text());ocr=json.loads((out/'ocr.json').read_text())
    image=result['answer']['long_images'][0]
    if sha((out/image['file']).read_bytes())!=image['sha256']:raise ValueError('Image evidence hash mismatch.')
    if ocr.get('source_image_sha256')!=image['sha256']:raise ValueError('OCR source image hash mismatch; rerun OCR.')
    result.pop('verification', None)  # Fresh OCR must not inherit a prior verification.
    extracted=extract(ocr)
    image['dimensions']={'width':ocr['width'],'height':ocr['height']}
    result['places']=extracted['places']
    result['answer'].update({'ocr_engine':ocr['engine'],'ocr_observations_file':'ocr.json',
                            'ocr_text_file':'answer.ocr.txt','ocr_text':'\n'.join(r['text'] for r in extracted['ocr_lines']),
                            'completeness':'full_shared_image_downloaded; OCR text requires verification; original app answer scope unknown',
                            'reference_experience_count_as_displayed':extracted['reference_experience_count_as_displayed']})
    result['status']='image_ocr_extracted' if result['places'] else 'image_acquired_no_places_extracted'
    result['automatic_checks']={'heading_ranks_contiguous':extracted['heading_ranks_contiguous'],
                                 'overview_detail_percentages_consistent':bool(result['places']) and all(p['overview_detail_consistent'] is True for p in result['places']),
                                 'places':len(result['places']),'reason_paragraphs':sum(len(p['reasons']) for p in result['places'])}
    result['unconfirmed']=['No full native answer text found in this public share page; only title and introduction are present in SSR metadata.',
                          'Full image bytes and pixel height are acquired, but content outside this shared image in the original app is unknown.',
                          'Displayed recommendation percentages are not model confidence or verified visitor statistics.',
                          'An OCR confidence score is not calibrated field accuracy.']
    (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    (out/'answer.ocr.txt').write_text(result['answer']['ocr_text']+'\n')
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--out',default='out');args=parser.parse_args()
    result=process(Path(args.out));print(json.dumps(result['automatic_checks'],ensure_ascii=False))
