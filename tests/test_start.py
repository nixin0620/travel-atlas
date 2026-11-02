"""Workspace preparation preserves user files and isolates the optional demo."""
import importlib.util
import json
from pathlib import Path
import re
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('travel_start', ROOT / 'scripts/start.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class WorkspaceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def seed(self, folder):
        html = (folder / 'index.html').read_text()
        return json.loads(re.search(r'<script[^>]*id="journey-seed"[^>]*>(.*?)</script>', html, re.S)[1])

    def test_personal_stays_empty(self):
        target = self.root / 'personal'
        launcher.prepare(target)
        self.assertEqual(self.seed(target)['stays'], [])
        self.assertFalse((target / 'public-demo.js').exists())
        self.assertIn("scope: 'travel-atlas-public-v1'", (target / 'preview-workspace.js').read_text())

    def test_demo_is_separate_and_contains_only_labelled_placeholders(self):
        target = self.root / 'demo'
        launcher.prepare(target, demo=True)
        seed = self.seed(target)
        self.assertEqual([s['city'] for s in seed['stays']], ['西双版纳', '普洱', '玉溪', '昆明'])
        self.assertEqual(seed['transports'], [])
        self.assertTrue(all('示例' in s['hotel'] and '未预订' in s['hotel'] and not s['price'] for s in seed['stays']))
        self.assertIn("scope: 'travel-atlas-demo-v1'", (target / 'preview-workspace.js').read_text())
        self.assertIn('public-demo.js', (target / 'index.html').read_text())
        self.assertEqual((target / 'index.html').read_text().count('<script src="public-demo.js"></script>'), 1)
        self.assertIn('values: {}', (target / 'preview-workspace.js').read_text())
        self.assertEqual(self.seed(ROOT / 'assets/app')['stays'], [])

    def test_relaunch_preserves_edited_app_and_local_configuration(self):
        for demo in [False, True]:
            target = self.root / str(demo)
            launcher.prepare(target, demo=demo)
            (target / 'index.html').write_text('user-edited file')
            (target / '.env.local').write_text('local configuration')
            launcher.prepare(target, demo=demo)
            self.assertEqual((target / 'index.html').read_text(), 'user-edited file')
            self.assertEqual((target / '.env.local').read_text(), 'local configuration')

    def test_modes_cannot_overwrite_each_other(self):
        for demo in [False, True]:
            target = self.root / str(demo)
            launcher.prepare(target, demo=demo)
            before = (target / 'index.html').read_bytes()
            with self.assertRaises(ValueError):
                launcher.prepare(target, demo=not demo)
            self.assertEqual((target / 'index.html').read_bytes(), before)

    def test_old_personal_marker_remains_compatible(self):
        target = self.root / 'old'
        launcher.prepare(target)
        (target / launcher.MARKER).write_text(json.dumps({'app': 'travel-atlas', 'version': 1}))
        launcher.prepare(target)
        with self.assertRaises(ValueError):
            launcher.prepare(target, demo=True)

    def test_unrelated_directory_is_not_overwritten(self):
        target = self.root / 'other'
        target.mkdir()
        (target / 'notes.txt').write_text('keep this')
        with self.assertRaises(ValueError):
            launcher.prepare(target, demo=True)
        self.assertEqual(list(target.iterdir()), [target / 'notes.txt'])


if __name__ == '__main__':
    unittest.main()
