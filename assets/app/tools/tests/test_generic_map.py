"""Generic city searches use researched centers or unambiguous geocoding, never POI centroids."""
import sys
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit,parse_qs
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import travel_map_service as m

class GenericMapTest(unittest.TestCase):
 def setUp(self):m.CACHE.clear();m.CITY_CACHE.clear()
 def test_generic_city_resolution_and_cached_country_scope(self):
  payload={'results':[{'name':'京都市','latitude':35.01,'longitude':135.77,'country_code':'JP','timezone':'Asia/Tokyo','id':1}]}
  with patch.object(m,'fetch_json',return_value=payload) as fetch:
   c=m.resolve_city('京都','JP');self.assertEqual(c['center'],[135.77,35.01]);self.assertNotIn('candidates',c);self.assertEqual(m.resolve_city('京都','JP'),c);self.assertEqual(fetch.call_count,1)
   self.assertEqual(parse_qs(urlsplit(fetch.call_args.args[0]).query)['countryCode'],['JP'])
 def test_ambiguous_city_or_wrong_country_does_not_get_a_guessed_center(self):
  city={'name':'测试城','latitude':35,'longitude':135,'country_code':'JP'}
  for payload in [{'results':[city,{**city,'latitude':30}]},{'results':[{**city,'country_code':'CN'}]},[]]:
   with patch.object(m,'fetch_json',return_value=payload),self.assertRaises(m.ApiError):m.resolve_city('测试城','JP')
 def test_researched_center_searches_without_geocoder_and_rejects_wrong_country(self):
  def feature(oid,country,lat=35.02,key='tourism'):
   return {'type':'Feature','geometry':{'type':'Point','coordinates':[135.78,lat]},'properties':{'name':'测试景点','osm_type':'N','osm_id':oid,'countrycode':country,'city':'京都市','osm_key':key}}
  payload={'features':[feature(1,'JP'),feature(2,'CN'),feature(3,'JP',40),feature(4,'JP',key='place')]}
  with patch.object(m,'configured',return_value=False),patch.object(m,'resolve_city',side_effect=AssertionError('No geocoding needed')),patch.object(m,'fetch_json',return_value=payload) as fetch:
   result=m.search('测试景点','new-city','京都','JP',[135.77,35.01]);self.assertEqual(len(result['candidates']),1);self.assertEqual(result['candidates'][0]['coordinateSystem'],'WGS84');self.assertEqual(result['candidates'][0]['match'],'candidate');self.assertEqual(urlsplit(fetch.call_args.args[0]).hostname,'photon.komoot.io')
   query=parse_qs(urlsplit(fetch.call_args.args[0]).query);self.assertEqual(query['countrycode'],['JP']);self.assertIn('京都',query['q'][0])
 def test_invalid_center_cannot_start_a_network_request(self):
  for center in [[200,35],[135,91],[float('nan'),35]]:
   with patch.object(m,'fetch_json',side_effect=AssertionError('unexpected fetch')),self.assertRaises(m.ApiError):m.search('测试','new','京都','JP',center)
