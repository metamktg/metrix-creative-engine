import unittest,json,hashlib,importlib.util,uuid,shutil,zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('client_library',Path(__file__).with_name('client_library.py'));lib=importlib.util.module_from_spec(spec);spec.loader.exec_module(lib)
class LibraryTest(unittest.TestCase):
 def setUp(self):
  self.test_root=(Path.cwd()/'.cache/client-library-tests').resolve();self.base=(self.test_root/uuid.uuid4().hex).resolve();self.base.mkdir(parents=True);self.addCleanup(self.cleanup);self.root=self.base/'library';self.src=self.base/'source.mp4';self.src.write_bytes(b'synthetic motion storage fixture');self.spec=self.base/'spec.json'
  self.profile={'storage':{'root_folder_id':'source-folder','approved_exports_folder_id':'final-folder','authorization':{'approved':True,'root_folder_id':'source-folder','evidence':'Explicit user instruction'}}}
  self.asset={'id':'shot','source':str(self.src),'role':'broll','status':'accepted_scoped','rights':'Synthetic test bytes; no real media acceptance claimed','usable_intervals_seconds':[[0,1]]}
 def cleanup(self):
  if not self.base.is_relative_to(self.test_root) or self.base==self.test_root:raise ValueError('Unsafe test cleanup')
  shutil.rmtree(self.base)
 def ingest(self,assets=None,client='sample-client'):
  lib.write(self.spec,{'client_id':client,'profile':self.profile,'assets':assets or [self.asset]});return lib.ingest(self.spec,self.root)
 def accept(self,plan,index):
  a=plan['items'][index];return lib.record(self.root,self.root/'sync-plan.json',index,{'id':'drive-'+str(index),'size':str(a['bytes']),'parent_ids':[a['destination_folder_id']],'url':'https://drive.google.com/file/d/test/view'})
 def test_deduplicates_bytes_preserves_alias_and_old_assets(self):
  alias=dict(self.asset,id='another-name');c=self.ingest([self.asset,alias]);self.assertEqual(len(c['objects']),1);self.assertEqual(len(c['assets']),2)
  self.src.write_bytes(b'new source content');c=self.ingest([dict(self.asset,id='new-shot')]);self.assertEqual(len(c['assets']),3);self.assertEqual(len(c['objects']),2)
 def test_idempotent_after_readback_and_metadata_only_update(self):
  self.ingest();p=lib.make_plan(self.root)
  self.assertEqual(p['items'][0]['mime_type'],'application/zip')
  for i in range(len(p['items'])):self.accept(p,i)
  self.assertEqual(lib.make_plan(self.root)['items'],[])
  self.profile['feedback']={'provider':'gemini'};self.ingest();new=lib.make_plan(self.root);self.assertEqual(len(new['items']),1);self.assertEqual(new['items'][0]['tool_action'],'update_file')
 def test_unknown_never_blindly_reuploads(self):
  self.ingest();lib.make_plan(self.root);lib.record(self.root,self.root/'sync-plan.json',0,unknown=True);p=lib.make_plan(self.root);self.assertFalse(p['items']);self.assertTrue(p['reconcile_unknown'])
 def test_wrong_parent_or_size_cannot_close_receipt(self):
  self.ingest();p=lib.make_plan(self.root);a=p['items'][0]
  for md in [{'id':'id','size':a['bytes'],'parents':['wrong']},{'id':'id','size':a['bytes']+1,'parents':[a['destination_folder_id']]}]:
   with self.assertRaises(ValueError):lib.record(self.root,self.root/'sync-plan.json',0,md)
 def test_changed_upload_bytes_rejected(self):
  self.ingest();p=lib.make_plan(self.root);Path(p['items'][0]['path']).write_bytes(b'changed')
  with self.assertRaises(ValueError):self.accept(p,0)
 def test_path_escape_and_secret_filename_rejected(self):
  with self.assertRaises(ValueError):lib.contained(self.root,'../outside')
  secret=self.base/'.env';secret.write_text('not a real secret')
  with self.assertRaises(ValueError):self.ingest([dict(self.asset,source=str(secret))])
 def test_namespace_does_not_cross_clients(self):
  self.ingest()
  with self.assertRaises(ValueError):self.ingest(client='different-client')
 def test_final_needs_exact_approval_and_separate_destination(self):
  final=dict(self.asset,role='final')
  with self.assertRaises(ValueError):self.ingest([final])
  final['approval']={'decision':'pass','sha256':lib.digest(self.src),'evidence':'User accepted exact output'};self.ingest([final]);p=lib.make_plan(self.root);f=next(x for x in p['items'] if x['kind']=='final');self.assertEqual(f['destination_folder_id'],'final-folder')
  c=lib.read(self.root/'client-library.json');c['assets'][0]['approval']['sha256']='0'*64;lib.write(self.root/'client-library.json',c)
  with self.assertRaises(ValueError):lib.make_plan(self.root)
 def test_object_tamper_and_corrupt_bundle_fail(self):
  c=self.ingest();p=lib.make_plan(self.root);bundle=Path(p['items'][0]['path']);bundle.write_bytes(b'not zip')
  with self.assertRaises(zipfile.BadZipFile):lib.make_plan(self.root)
  lib.contained(self.root,next(iter(c['objects'].values()))['path']).write_bytes(b'tampered')
  with self.assertRaises(ValueError):lib.load_library(self.root)
 def test_rejected_media_not_queued(self):
  self.ingest([dict(self.asset,status='rejected')]);p=lib.make_plan(self.root);self.assertEqual([x['kind'] for x in p['items']],['catalog'])
 def test_recipe_cache_is_not_frame_count_only(self):
  s={'source_sha256':'s','source_intervals':[[0,1]],'overlays':['a'],'audio_sha256':'v','dimensions':[100,100],'fps':30,'encoder':{'codec':'example'}}
  one=lib.cache_key(s);self.assertNotEqual(one,lib.cache_key(dict(s,overlays=['b'])));self.assertNotEqual(one,lib.cache_key(dict(s,source_intervals=[[1,2]])))
  with self.assertRaises(ValueError):lib.cache_key({'frames':30})
 def test_current_restore_does_not_require_superseded_unuploaded_object(self):
  first=self.ingest();old=next(iter(first['objects'].values()));self.src.write_bytes(b'replacement source');self.ingest();lib.contained(self.root,old['path']).unlink();self.assertEqual(lib.load_library(self.root)['assets'][0]['sha256'],lib.digest(self.src))
if __name__=='__main__':unittest.main()
