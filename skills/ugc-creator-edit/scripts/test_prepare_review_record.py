"""Initializer regression tests use neutral synthetic files, never real reviews."""
from pathlib import Path
import contextlib,io,json,shutil,sys,unittest,uuid
import prepare_review_record as prepare
import validate_review_gates as gates
from test_validate_review_gates import make_valid_record

class PrepareTests(unittest.TestCase):
 def setUp(self):
  self.base=Path(__file__).parent.resolve()
  self.root=self.base/("prepare-test-"+uuid.uuid4().hex);self.root.mkdir(mode=0o777)
  self.record=make_valid_record(self.root)
  self.manifest={"artifacts":{k:v["path"] for k,v in self.record["artifacts"].items()},
      "contributors":self.record["contributors"],"iap":self.record["iap"],"production":self.record["production"]}
  self.source=self.root/"review-manifest.json";self.write()
 def write(self):self.source.write_text(json.dumps(self.manifest),encoding="utf-8")
 def tearDown(self):
  actual=self.root.resolve();self.assertEqual(actual.parent,self.base);self.assertTrue(actual.name.startswith("prepare-test-"));shutil.rmtree(actual)
 def call(self,*extra):
  with contextlib.redirect_stdout(io.StringIO()):
   return prepare.main([str(self.source),"--root",str(self.root),*extra])
 def test_creates_pending_without_approvals_or_source_changes(self):
  before={k:gates.file_hash(self.root/v["path"]) for k,v in self.record["artifacts"].items()}
  self.assertEqual(self.call(),0)
  pending=json.loads((self.root/"production-review.json").read_text())
  self.assertTrue(all(v["status"]=="PENDING" and v["reviewer"] is None for v in pending["gates"].values()))
  self.assertNotEqual(gates.validate_record(pending,self.root)["status"],"READY")
  self.assertEqual(before,{k:gates.file_hash(self.root/v["path"]) for k,v in self.record["artifacts"].items()})
 def test_refuses_overwriting_review_history(self):
  self.assertEqual(self.call(),0);path=self.root/"production-review.json";before=path.read_bytes()
  self.assertEqual(self.call(),1);self.assertEqual(path.read_bytes(),before)
 def test_output_cannot_escape_root(self):
  name=self.root.name+"-escape.json";target=self.base/name
  self.assertFalse(target.exists());self.assertEqual(self.call("--out","../"+name),1);self.assertFalse(target.exists())
 def test_source_path_cannot_escape_root(self):
  self.manifest["artifacts"]["master"]="../outside.mp4";self.write()
  self.assertEqual(self.call(),1);self.assertFalse((self.root/"production-review.json").exists())
 def test_manifest_addressed_through_a_junction_prepares(self):
  if sys.platform!="win32":self.skipTest("Junctions are a Windows construct.")
  import _winapi
  link=self.base/("prepare-junction-"+uuid.uuid4().hex)
  try:_winapi.CreateJunction(str(self.root),str(link))
  except OSError:self.skipTest("This host does not permit creating junctions.")
  self.addCleanup(link.rmdir)
  with contextlib.redirect_stdout(io.StringIO()):
   code=prepare.main([str(link/"review-manifest.json"),"--root",str(link)])
  self.assertEqual(code,0);self.assertTrue((self.root/"production-review.json").exists())
 def test_missing_artifact_is_not_review_failure(self):
  self.manifest["artifacts"]["master"]="unavailable.mp4";self.write()
  self.assertEqual(self.call(),2);self.assertFalse((self.root/"production-review.json").exists())

if __name__=="__main__":unittest.main()
