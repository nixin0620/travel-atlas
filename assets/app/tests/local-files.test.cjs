/* Run: node tests/local-files.test.cjs. Uses only temporary, synthetic data. */
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const C=require('../local-files-core.js');
class Directory {
  constructor(root,locks=new Set()){this.root=root;this.locks=locks;this.name=path.basename(root)}
  async *entries(){for(const name of await fs.readdir(this.root))yield [name,{kind:(await fs.stat(path.join(this.root,name))).isFile()?'file':'directory'}]}
  async removeEntry(name){await fs.unlink(path.join(this.root,name))}
  async getDirectoryHandle(name,{create=false}={}){const root=path.join(this.root,name);if(create)await fs.mkdir(root,{recursive:true});await fs.stat(root);return new Directory(root,this.locks)}
  async getFileHandle(name,{create=false}={}){const file=path.join(this.root,name),locks=this.locks;try{await fs.stat(file)}catch(e){if(!create){e.name='NotFoundError';throw e}await fs.writeFile(file,'',{flag:'wx'})}return {
    getFile:async()=>{const b=await fs.readFile(file);return {text:async()=>b.toString(),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),size:b.length}},
    createWritable:async options=>{assert.equal(options.mode,'exclusive');if(locks.has(file))throw Object.assign(Error('locked'),{name:'NoModificationAllowedError'});locks.add(file);let data='';return{write:async v=>{data=v},close:async()=>{await fs.writeFile(file+'.swap',data);await fs.rename(file+'.swap',file);locks.delete(file)},abort:async()=>{locks.delete(file)}}}
  }}
}
const backup=()=>({type:'travel-handbook-backup',version:1,tripId:'test',packingTripId:'test',createdAt:'2026-10-03T00:00:00Z',records:{journeyDraft:null,footprints:{type:'china-footprints',version:1,cities:[{id:'test',markedAt:'2026-10-03'}]}},media:{memories:[],references:[]}});
const settings={theme:'rainforest',lastSection:'route'};
const validate=v=>assert.equal(v.type,'travel-handbook-backup');
const inTemp=async fn=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'travel-save-test-'));try{await fn(new Directory(root))}finally{await fs.rm(root,{recursive:true,force:true})}};
test('images deduplicate and all data round-trip, including two references to one screenshot',async()=>inTemp(async dir=>{const raw=backup(),photo='data:image/jpeg;base64,YWJj';raw.records.journeyDraft={attachment:{src:photo,name:'test'}};raw.media.memories=[{id:'test',note:'旅途中的一段话',photos:[{id:'one',data:photo}]}];const packed=await C.pack(raw,settings,1);assert.equal(packed.assets.size,1);assert(!packed.text.includes('base64'));const hash=await C.save(dir,packed,null);const loaded=await C.read(dir,validate);assert.equal(hash,loaded.hash);assert.deepEqual(loaded.data.backup,raw);assert.deepEqual(loaded.data.settings,settings)}));
test('old JSON is backed up before commit; stale writers never overwrite newer file',async()=>inTemp(async dir=>{const first=await C.pack(backup(),settings,1);const h=await C.save(dir,first,null);const raw=backup();raw.records.footprints.cities=[];const second=await C.pack(raw,settings,2);await C.save(dir,second,h);const names=await fs.readdir(path.join(dir.root,'backups'));assert.equal(names.length,1);assert.equal(await fs.readFile(path.join(dir.root,'backups',names[0]),'utf8'),first.text);await assert.rejects(()=>C.save(dir,first,h),e=>e.code==='CONFLICT');assert.equal((await C.read(dir,validate)).text,second.text)}));
test('failed image write leaves old travel.json unchanged',async()=>inTemp(async dir=>{const first=await C.pack(backup(),settings,1),h=await C.save(dir,first,null);const raw=backup();raw.media.references=[{dataUrl:'data:image/png;base64,YWJj'}];const packed=await C.pack(raw,settings,2);const name=[...packed.assets.keys()][0].slice(7);await fs.writeFile(path.join(dir.root,'images',name),'broken');await assert.rejects(()=>C.save(dir,packed,h),/损坏/);assert.equal((await C.read(dir,validate)).text,first.text)}));
test('path traversal and corrupted image checksums are rejected',async()=>{const p=await C.pack(backup(),settings,1);p.document.backup.media.memories=[{$image:'../secret'}];await assert.rejects(()=>C.unpack(p.document,()=>{throw Error('should not read')},validate),/路径/);p.document.backup.media.memories=[{$image:'images/'+'0'.repeat(64)+'.jpg'}];await assert.rejects(()=>C.unpack(p.document,async()=>new Uint8Array([1]),validate),/损坏/)});
test('invalid schema and prototype keys cannot become a saved state',async()=>{const p=await C.pack(backup(),settings,1);p.document.backup.records.footprints=null;await assert.rejects(()=>C.unpack(p.document,()=>{},()=>{throw Error('bad schema')}),/bad schema/);const malicious=JSON.parse('{"__proto__":{"polluted":true}}');await assert.rejects(()=>C.pack(malicious,settings,1),/字段/);assert.equal({}.polluted,undefined)});
test('merge retains both footprint sets; conflicts are explicit and do not mutate inputs',()=>{const a=backup(),b=backup();b.records.footprints.cities=[{id:'other',markedAt:'2026-10-01'}];a.records.journeyDraft={name:'browser'};b.records.journeyDraft={name:'disk'};const result=C.merge(a,b,'file');assert.equal(result.backup.records.footprints.cities.length,2);assert.deepEqual(result.conflicts,['journeyDraft']);assert.equal(result.backup.records.journeyDraft.name,'disk');assert.equal(a.records.journeyDraft.name,'browser')});
test('exclusive writer blocks competing saves',async()=>inTemp(async dir=>{const first=await C.pack(backup(),settings,1);const h=await C.save(dir,first,null);const file=await dir.getFileHandle('travel.json');const writer=await file.createWritable({mode:'exclusive'});await assert.rejects(()=>C.save(dir,first,h),e=>e.name==='NoModificationAllowedError');await writer.abort();assert.equal((await C.read(dir,validate)).hash,h)}));

test('automatic file history keeps five versions, preserves manual files and coalesces typing saves',async()=>inTemp(async dir=>{
 let h=await C.save(dir,await C.pack(backup(),settings,1),null);
 const history=await dir.getDirectoryHandle('backups',{create:true});
 for(let i=1;i<=8;i++)await fs.writeFile(path.join(history.root,`travel-2020-01-0${i}T00-00-00-000Z-1234567890.json`),'old');
 await fs.writeFile(path.join(history.root,'my-manual-backup.json'),'keep');
 for(let i=2;i<=4;i++){const raw=backup();raw.records.test=i;h=await C.save(dir,await C.pack(raw,settings,i),h);}
 const names=await fs.readdir(history.root);assert.equal(names.filter(n=>n.startsWith('travel-')).length,5);
 assert.equal(names.filter(n=>!n.includes('2020')&&n.startsWith('travel-')).length,1);
 assert.equal(await fs.readFile(path.join(history.root,'my-manual-backup.json'),'utf8'),'keep');
}));
