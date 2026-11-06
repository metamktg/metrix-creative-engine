"""Private content-addressed client library and agent-mediated Drive sync plans.

No network, credential discovery, provider calls, deletion, or background watcher.
The connected Drive tool executes explicit plans; verified readbacks close receipts.
"""
from pathlib import Path
import argparse,hashlib,json,mimetypes,re,shutil,zipfile

ROLES={'brand','ui','broll','voice','music','recipe','review','workflow','approval','source','final'}
STATES={'accepted_scoped','reference','candidate','rejected','deprecated'}
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')
def read(path):return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def write(path,value):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name(path.name+'.tmp');tmp.write_text(json.dumps(value,indent=2,sort_keys=True,ensure_ascii=False)+'\n',encoding='utf-8');tmp.replace(path)
def contained(root,name):
 root=Path(root).resolve();name=Path(name)
 if name.is_absolute():raise ValueError('Library member must be relative')
 p=(root/name).resolve()
 if not p.is_relative_to(root):raise ValueError('Path escapes library')
 return p
def load_library(root):
 root=Path(root).resolve();catalog=read(root/'client-library.json')
 if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}',catalog['client_id']):raise ValueError('Invalid client_id')
 for asset in catalog['assets']:
  if asset['role'] not in ROLES or asset['status'] not in STATES or asset['sha256'] not in catalog['objects']:raise ValueError('Invalid asset record')
  if asset['role']=='final':
   a=asset.get('approval',{})
   if asset['status']!='accepted_scoped' or a.get('decision','').lower()!='pass' or a.get('sha256')!=asset['sha256'] or not a.get('evidence'):raise ValueError('Stale final approval')
 required={a['sha256'] for a in catalog['assets'] if a['status'] in {'accepted_scoped','reference'}}
 for h,obj in catalog['objects'].items():
  p=contained(root,obj['path'])
  if (p.exists() and (not p.is_file() or digest(p)!=obj['sha256'])) or (h in required and not p.is_file()):raise ValueError('Missing or changed library object')
 return catalog
def ingest(spec_path,root):
 spec_path=Path(spec_path).resolve();spec=read(spec_path);root=Path(root).resolve()
 client=spec['client_id']
 if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}',client):raise ValueError('Invalid client_id')
 prior=read(root/'client-library.json') if (root/'client-library.json').exists() else {'objects':{}}
 if prior.get('client_id',client)!=client:raise ValueError('Client namespace mismatch')
 objects=dict(prior['objects']);assets=[];seen=set()
 # Validate all records before copying anything.
 prepared=[]
 for asset in spec['assets']:
  if asset['id'] in seen:raise ValueError('Duplicate asset id')
  seen.add(asset['id']);role=asset['role'];state=asset['status']
  if role not in ROLES or state not in STATES:raise ValueError('Unknown role/status')
  source=Path(asset['source']);source=source if source.is_absolute() else spec_path.parent/source
  if not source.is_file():raise ValueError('Source is not a file')
  name=source.name
  if name.startswith('.env') or source.suffix.lower() in {'.pem','.key','.pfx'} or re.search(r'(credentials?|cookies?|session[-_]?store|secret[-_]?key)',name,re.I):raise ValueError('Credential/session material is not a creative asset')
  if not asset.get('rights'):raise ValueError('Rights/provenance scope required')
  sha=digest(source)
  if role=='final':
   approval=asset.get('approval',{})
   if state!='accepted_scoped' or approval.get('decision','').lower()!='pass' or approval.get('sha256')!=sha or not approval.get('evidence'):raise ValueError('Final needs current exact-file approval')
  for span in asset.get('usable_intervals_seconds',[]):
   if len(span)!=2 or span[0]<0 or span[1]<=span[0]:raise ValueError('Invalid source interval')
  prepared.append((asset,source,sha))
 for asset,source,sha in prepared:
  if sha not in objects:
   safe=re.sub(r'[^A-Za-z0-9._-]','_',source.name)
   rel=f'objects/{sha}/{safe}';target=contained(root,rel);target.parent.mkdir(parents=True,exist_ok=True)
   if target.exists() and digest(target)!=sha:raise ValueError('Immutable object collision')
   if not target.exists():shutil.copy2(source,target)
   objects[sha]={'sha256':sha,'path':rel,'bytes':target.stat().st_size,'mime_type':mimetypes.guess_type(source.name)[0] or 'application/octet-stream'}
  record={k:v for k,v in asset.items() if k!='source'};record['sha256']=sha;assets.append(record)
 merged={a['id']:a for a in prior.get('assets',[])};merged.update({a['id']:a for a in assets})
 catalog={'schema_version':1,'client_id':client,'profile':spec['profile'],'assets':sorted(merged.values(),key=lambda a:a['id']),'objects':objects}
 write(root/'client-library.json',catalog);load_library(root);return catalog
def ledger_for(root,client):
 p=Path(root)/'sync-ledger.json';ledger=read(p) if p.exists() else {'schema_version':1,'client_id':client,'uploads':{}}
 if ledger['client_id']!=client:raise ValueError('Ledger client mismatch')
 return ledger
def make_plan(root,max_bytes=8*1024*1024):
 if max_bytes<=0:raise ValueError('Package target must be positive')
 root=Path(root).resolve();cat=load_library(root);profile=cat['profile'];storage=profile['storage'];auth=storage.get('authorization',{})
 if not auth.get('approved') or auth.get('root_folder_id')!=storage['root_folder_id'] or not auth.get('evidence'):raise ValueError('Bound standing storage authorization required')
 dest=storage['root_folder_id'];ledger=ledger_for(root,cat['client_id'])
 reusable={a['sha256'] for a in cat['assets'] if a['role']!='final' and a['status'] in {'accepted_scoped','reference'}}
 known=set();items=[]
 for entry in ledger['uploads'].values():
  if entry['destination_folder_id']==dest and entry['status']=='verified':known.update(entry.get('object_sha256',[]))
  if entry['destination_folder_id']==dest and entry['status']=='unknown':
   plan={'schema_version':1,'client_id':cat['client_id'],'items':[],'reconcile_unknown':[entry],'reason':'Read destination by name/size before retry; never blindly duplicate an unknown upload'};write(root/'sync-plan.json',plan);return plan
 pending=sorted(reusable-known);batches=[];batch=[];size=0
 for sha in pending:
  obj=cat['objects'][sha]
  if batch and size+obj['bytes']>max_bytes:batches.append(batch);batch=[];size=0
  batch.append(sha);size+=obj['bytes']
 if batch:batches.append(batch)
 for hashes in batches:
  key=hashlib.sha256(canonical(hashes)).hexdigest()[:16];relative=f'packages/reusable-{key}.zip';target=contained(root,relative);target.parent.mkdir(exist_ok=True)
  if not target.exists():
   partial=target.with_name(target.name+'.part')
   with zipfile.ZipFile(partial,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    index={sha:cat['objects'][sha] for sha in hashes}
    for member,data in [('bundle-index.json',canonical(index))]+[(cat['objects'][sha]['path'],contained(root,cat['objects'][sha]['path']).read_bytes()) for sha in hashes]:
     info=zipfile.ZipInfo(member,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o600<<16;z.writestr(info,data)
   partial.replace(target)
  with zipfile.ZipFile(target) as z:
   if set(json.loads(z.read('bundle-index.json')))!=set(hashes):raise ValueError('Changed bundle index')
   for sha in hashes:
    if hashlib.sha256(z.read(cat['objects'][sha]['path'])).hexdigest()!=sha:raise ValueError('Changed bundle bytes')
  items.append(item(root,target,dest,'bundle',hashes,ledger))
 items.append(item(root,root/'client-library.json',dest,'catalog',[],ledger))
 # Final exports have a separate exact-file authorization and destination.
 for asset in cat['assets']:
  if asset['role']=='final':
   target=contained(root,cat['objects'][asset['sha256']]['path']);final_dest=storage.get('approved_exports_folder_id')
   if not final_dest:raise ValueError('Final export destination missing')
   items.append(item(root,target,final_dest,'final',[asset['sha256']],ledger))
 plan={'schema_version':1,'client_id':cat['client_id'],'catalog_sha256':digest(root/'client-library.json'),'items':[x for x in items if x is not None],'reconcile_unknown':[]}
 write(root/'sync-plan.json',plan);return plan
def item(root,path,dest,kind,hashes,ledger):
 sha=digest(path);key=f'{dest}:{kind}:{sha}'
 if ledger['uploads'].get(key,{}).get('status')=='verified':return None
 previous=next((x for x in ledger['uploads'].values() if kind=='catalog' and x['kind']=='catalog' and x['destination_folder_id']==dest and x['status']=='verified'),None)
 action='update_file' if previous else 'upload_file'
 return {'key':key,'kind':kind,'path':str(path.resolve()),'sha256':sha,'bytes':path.stat().st_size,'destination_folder_id':dest,'object_sha256':hashes,'tool_action':action,'file_id':previous['drive_file_id'] if previous else None,'file_name':path.name,'mime_type':'application/zip' if path.suffix.lower()=='.zip' else (mimetypes.guess_type(path.name)[0] or 'application/octet-stream')}
def record(root,plan_path,index,metadata=None,unknown=False):
 root=Path(root).resolve();cat=load_library(root);plan=read(plan_path)
 if plan['client_id']!=cat['client_id']:raise ValueError('Plan client mismatch')
 action=plan['items'][index];path=Path(action['path']).resolve()
 if not path.is_relative_to(root) or digest(path)!=action['sha256']:raise ValueError('Stale or uncontained sync bytes')
 ledger=ledger_for(root,cat['client_id']);entry=dict(action)
 if unknown:entry['status']='unknown'
 else:
  metadata=read(metadata) if isinstance(metadata,(str,Path)) else metadata
  if metadata is None:raise ValueError('Verified Drive metadata required')
  parents=metadata.get('parent_ids',metadata.get('parents',[]))
  if not metadata.get('id') or int(metadata.get('size',-1))!=action['bytes'] or action['destination_folder_id'] not in parents:raise ValueError('Drive readback size/parent mismatch')
  entry.update(status='verified',drive_file_id=metadata['id'],url=metadata.get('url',metadata.get('webViewLink')),verification='Local SHA binds upload bytes; remote metadata verifies ID, parent and size, not a remote checksum')
 ledger['uploads'][action['key']]=entry;write(root/'sync-ledger.json',ledger);return entry
def cache_key(spec):
 # Caller supplies exact source intervals, overlay/audio hashes, dimensions/fps,
 # colour and encoder settings. File length/frame count alone is not a cache key.
 required={'source_sha256','source_intervals','overlays','audio_sha256','dimensions','fps','encoder'}
 if not required.issubset(spec):raise ValueError('Incomplete render-cache identity')
 return hashlib.sha256(canonical(spec)).hexdigest()
def main():
 ap=argparse.ArgumentParser();sub=ap.add_subparsers(dest='command',required=True)
 p=sub.add_parser('ingest');p.add_argument('--spec',required=True);p.add_argument('--root',required=True)
 p=sub.add_parser('plan-sync');p.add_argument('--root',required=True);p.add_argument('--max-package-mib',type=int,default=8)
 p=sub.add_parser('record-sync');p.add_argument('--root',required=True);p.add_argument('--plan',required=True);p.add_argument('--index',type=int,required=True);p.add_argument('--metadata');p.add_argument('--unknown',action='store_true')
 p=sub.add_parser('verify');p.add_argument('--root',required=True)
 p=sub.add_parser('cache-key');p.add_argument('--spec',required=True)
 args=ap.parse_args()
 if args.command=='ingest':result=ingest(args.spec,args.root);result={'client_id':result['client_id'],'assets':len(result['assets']),'objects':len(result['objects'])}
 elif args.command=='plan-sync':result=make_plan(args.root,args.max_package_mib*1024*1024)
 elif args.command=='record-sync':result=record(args.root,args.plan,args.index,args.metadata,args.unknown)
 elif args.command=='verify':c=load_library(args.root);result={'client_id':c['client_id'],'status':'PASS','required_objects':len({a['sha256'] for a in c['assets'] if a['status'] in {'accepted_scoped','reference'}}),'recorded_objects':len(c['objects'])}
 else:result={'cache_key':cache_key(read(args.spec))}
 print(json.dumps(result,indent=2))
if __name__=='__main__':main()
