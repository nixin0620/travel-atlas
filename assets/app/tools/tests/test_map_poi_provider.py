import sys
import os
from pathlib import Path
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import travel_map_service as s


def feature(**props):
    return {'properties': {'osm_type': 'W', 'osm_id': 288655553, 'name': '曼听公园', 'osm_key': 'leisure', 'countrycode': 'CN', **props},
            'geometry': {'type': 'Point', 'coordinates': [100.805389, 21.9933452]}}


class ProviderTests(unittest.TestCase):
    def setUp(self):
        s.CACHE.clear()
        local = patch.object(s, 'LOCAL_CONFIG', {})
        local.start()
        self.addCleanup(local.stop)

    def test_photon_preserves_source_and_marks_candidate_not_confirmed(self):
        rows = s.photon_candidates({'features': [feature()]}, s.CITIES['banna'])
        self.assertEqual(rows[0]['id'], 'osm:W:288655553')
        self.assertEqual(rows[0]['coordinateSystem'], 'WGS84')
        self.assertEqual(rows[0]['match'], 'candidate')
        self.assertNotIn('confirmedAt', rows[0])

    def test_reject_centroids_invalid_ids_other_cities_and_duplicate_results(self):
        elsewhere = feature(osm_id=2)
        elsewhere['geometry']['coordinates'] = [116.4, 39.9]
        invalid = feature(osm_id=3)
        invalid['geometry']['coordinates'] = [True, None]
        rows = s.photon_candidates({'features': [feature(), feature(), feature(osm_key='place'), feature(osm_id='x'), elsewhere, invalid]}, s.CITIES['banna'])
        self.assertEqual(len(rows), 1)

    def test_amap_keeps_gcj02_and_limits_city(self):
        p = {'id': 'B001', 'name': '曼听公园', 'location': '100.805389,21.9933452', 'adcode': '532801', 'address': []}
        rows = s.amap_candidates({'status': '1', 'pois': [p, {**p, 'id': 'B002', 'adcode': '530100'}]}, s.CITIES['banna'])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['coordinateSystem'], 'GCJ02')

    @patch.dict(os.environ, {}, clear=True)
    def test_config_and_search_have_no_key_and_cache_repeated_query(self):
        with patch.object(s, 'fetch_json', return_value={'features': [feature()]}) as fetch:
            one = s.search('曼听公园', 'banna')
            self.assertEqual(s.search('曼听公园', 'banna'), one)
            self.assertEqual(fetch.call_count, 1)
        self.assertFalse(s.public_config()['amapConfigured'])

    @patch.dict(os.environ, {'TRAVEL_AMAP_WEB_KEY': 'test-secret'})
    def test_key_never_in_response_or_provider_error(self):
        self.assertNotIn('test-secret', str(s.public_config()))
        with patch.object(s, 'fetch_json', return_value={'status': '0', 'info': 'test-secret'}):
            with self.assertRaises(s.ApiError) as caught:
                s.search('曼听公园', 'banna')
        self.assertNotIn('test-secret', caught.exception.message)

    def test_query_needs_city_and_actual_name(self):
        for q, city in [('', 'banna'), ('a', 'banna'), ('曼听公园', 'all'), ('x' * 121, 'banna')]:
            with self.assertRaises(s.ApiError):
                s.search(q, city)

    @patch.dict(os.environ, {}, clear=True)
    def test_network_failure_never_cached_or_fabricated(self):
        with patch.object(s, 'fetch_json', side_effect=s.ApiError('网络失败', 502)):
            with self.assertRaises(s.ApiError):
                s.search('曼听公园', 'banna')
        self.assertFalse(s.CACHE)


if __name__ == '__main__':
    unittest.main()
