"""Upgrades must preserve existing user content and refuse unreviewed code conflicts."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('atlas_update',Path(__file__).resolve().parents[1]/'scripts/update.py')
update=importlib.util.module_from_spec(spec);spec.loader.exec_module(update)

class UpgradeTest(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  self.root=Path(self.temp.name);self.release=self.root/'release';self.app=self.release/'assets/app';self.app.mkdir(parents=True)
  self.workspace=self.root/'personal';self.workspace.mkdir()
  for name,contents in {'index.html':'old-app','travel-plan-seed.js':'personal-plan','preview-workspace.js':'original-storage-scope','tools/server.py':'old-server'}.items():
   p=self.workspace/name;p.parent.mkdir(exist_ok=True);p.write_text(contents)
   q=self.app/name;q.parent.mkdir(exist_ok=True);q.write_text('new-'+contents)
  baseline={str(p.relative_to(self.workspace)):update.digest(p) for p in self.workspace.rglob('*') if p.is_file()}
  (self.release/'assets/upgrade-baseline.json').write_text(json.dumps(baseline))
  (self.workspace/update.MARKER).write_text(json.dumps({'app':'travel-atlas','port':8937,'version':1}))
  (self.workspace/'.env.local').write_text('local settings')
  (self.workspace/'private-photo.jpg').write_bytes(b'user photo')
  self.patch=patch.object(update,'ROOT',self.release);self.patch.start();self.addCleanup(self.patch.stop)
 def test_upgrade_snapshots_and_preserves_plan_config_scope_photos_and_port(self):
  result=update.upgrade(self.workspace);self.assertEqual(result['updated'],2);self.assertEqual(result['port'],8937)
  for name,expected in {'travel-plan-seed.js':'personal-plan','preview-workspace.js':'original-storage-scope','.env.local':'local settings','private-photo.jpg':'user photo'}.items():self.assertEqual((self.workspace/name).read_text(),expected)
  self.assertEqual((Path(result['snapshot'])/'index.html').read_text(),'old-app')
  self.assertEqual((self.workspace/'index.html').read_text(),'new-old-app')
  self.assertEqual(update.upgrade(self.workspace)['updated'],0)
 def test_custom_code_conflict_aborts_before_any_write(self):
  (self.workspace/'tools/server.py').write_text('my customization')
  with self.assertRaises(ValueError):update.upgrade(self.workspace)
  self.assertEqual((self.workspace/'index.html').read_text(),'old-app');self.assertEqual((self.workspace/'tools/server.py').read_text(),'my customization')
 def test_symlink_parent_cannot_redirect_an_update(self):
  (self.workspace/'tools/server.py').unlink();(self.workspace/'tools').rmdir();outside=self.root/'outside';outside.mkdir();(outside/'server.py').write_text('old-server');(self.workspace/'tools').symlink_to(outside,target_is_directory=True)
  with self.assertRaises(ValueError):update.upgrade(self.workspace)
  self.assertEqual((outside/'server.py').read_text(),'old-server')
 def test_partial_copy_failure_rolls_back_and_keeps_snapshot(self):
  original=update.shutil.copy2;failed=False
  def copy(source,target,*args,**kwargs):
   nonlocal failed
   if str(target).endswith('server.py.update-tmp') and not failed:failed=True;raise OSError('simulated disk full')
   return original(source,target,*args,**kwargs)
  with patch.object(update.shutil,'copy2',side_effect=copy),self.assertRaises(OSError):update.upgrade(self.workspace)
  self.assertEqual((self.workspace/'index.html').read_text(),'old-app');self.assertEqual((self.workspace/'tools/server.py').read_text(),'old-server')
  self.assertEqual(len(list(self.root.glob('personal-before-update-*'))),1)
 def test_demo_never_overwrites_personal_data(self):
  (self.workspace/update.MARKER).write_text(json.dumps({'app':'travel-atlas','demo':True}))
  with self.assertRaises(ValueError):update.upgrade(self.workspace)
  self.assertEqual((self.workspace/'index.html').read_text(),'old-app')
