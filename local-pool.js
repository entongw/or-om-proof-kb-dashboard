/* Local-folder storage only. No PDF or manifest is sent over the network. */
(function(global){
 'use strict';
 const MANIFEST='paper-pool.json',PDFS='pdfs',MAX_BYTES=100*1024*1024;
 const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
 const safePDF=name=>/^[a-f0-9]{64}\.pdf$/.test(name);
 function validateManifest(value){
  if(!value||value.schema_version!==1||!Array.isArray(value.papers))throw Error('论文池索引格式不正确；未改写原文件。');
  const ids=new Set();
  for(const p of value.papers){
   if(typeof p.id!=='string'||!p.id||typeof p.title!=='string'||!p.title.trim()||ids.has(p.id))throw Error('论文池存在无效或重复记录；未改写原文件。');
   ids.add(p.id);
   if(p.pdf&&(!safePDF(p.pdf.name)||p.pdf.name!==p.pdf.sha256+'.pdf'))throw Error('PDF 索引含有不安全路径；未读取该文件。');
  }
  return value;
 }
 async function writeJSON(directory,name,value){
  const file=await directory.getFileHandle(name,{create:true});const writer=await file.createWritable();
  try{await writer.write(JSON.stringify(value,null,2)+'\n');await writer.close();}catch(e){try{await writer.abort();}catch{}throw e;}
 }
 class LocalPaperPool{
  constructor(directory,seeds=[]){this.directory=directory;this.seeds=seeds;this.manifest={schema_version:1,papers:[]};}
  async load(initialize=false){
   try{const file=await(await this.directory.getFileHandle(MANIFEST)).getFile();this.manifest=validateManifest(JSON.parse(await file.text()));}
   catch(e){if(e.name!=='NotFoundError')throw e;if(!initialize)throw Error('文件夹中没有 paper-pool.json，请点击连接并初始化论文池。');
    this.manifest={schema_version:1,papers:this.seeds.map(p=>({id:p.id,title:p.title,authors:p.authors,year:p.year,origin:'existing_knowledge',pdf:null}))};await this.save();}
   return this.manifest;
  }
  async save(){this.manifest.updated_at=new Date().toISOString();validateManifest(this.manifest);await writeJSON(this.directory,MANIFEST,this.manifest);}
  async importPDF(file,metadata={}){
   if(!/\.pdf$/i.test(file.name)||file.size===0||file.size>MAX_BYTES)throw Error('请选择非空 PDF，单个文件不超过 100 MiB。');
   if(!(new TextDecoder().decode(await file.slice(0,1024).arrayBuffer())).includes('%PDF-'))throw Error('文件内容不包含 PDF 标识；没有写入论文池。');
   const raw=await file.arrayBuffer(),hash=hex(await global.crypto.subtle.digest('SHA-256',raw));
   // Re-read before every mutation; a session must not overwrite newer folder metadata.
   await this.load();
   let existing=this.manifest.papers.find(p=>p.pdf?.sha256===hash);
   if(existing){try{await this.getPDF(existing);return {paper:existing,duplicate:true};}catch(e){if(e.name==='NotAllowedError')throw e;}}
   const seed=this.seeds.find(p=>(p.expected_pdf_sha256||[]).includes(hash));
   existing=existing||(seed?this.manifest.papers.find(p=>p.id===seed.id):null);
   const dir=await this.directory.getDirectoryHandle(PDFS,{create:true}),name=hash+'.pdf';
   const dest=await dir.getFileHandle(name,{create:true}),writer=await dest.createWritable();
   try{await writer.write(raw);await writer.close();}catch(e){try{await writer.abort();}catch{}throw e;}
   const paper=existing||{id:seed?.id||'local-'+hash.slice(0,24),title:metadata.title?.trim()||seed?.title||file.name.replace(/\.pdf$/i,''),
    authors:metadata.authors?.trim()||seed?.authors||'',year:metadata.year||seed?.year||null,
    origin:seed?'existing_knowledge':'local_upload',progress:'未核读',added_at:new Date().toISOString()};
   paper.pdf={name,sha256:hash,bytes:file.size,original_name:file.name};
   if(!existing)this.manifest.papers.push(paper);
   try{await this.save();}catch{throw Error('PDF 已写入本地，但索引保存失败。请重新连接后使用“扫描补录”恢复，勿重复覆盖原始文件。');}
   return {paper,duplicate:false};
  }
  async getPDF(paper){
   if(!paper?.pdf||!safePDF(paper.pdf.name))throw Error('此论文尚未在连接的文件夹中保存 PDF。');
   const file=await(await(await this.directory.getDirectoryHandle(PDFS)).getFileHandle(paper.pdf.name)).getFile();
   const hash=hex(await global.crypto.subtle.digest('SHA-256',await file.arrayBuffer()));
   if(hash!==paper.pdf.sha256)throw Error('本地 PDF 与索引指纹不一致。请重新导入原文件，不将变更后的文件与既有证明混用。');
   return file;
  }
  async rescan(){
   await this.load();let count=0;let dir;
   try{dir=await this.directory.getDirectoryHandle(PDFS);}catch(e){if(e.name==='NotFoundError')return 0;throw e;}
   for await(const [name,handle] of dir.entries()){
    if(handle.kind!=='file'||!safePDF(name)||this.manifest.papers.some(p=>p.pdf?.name===name))continue;
    const file=await handle.getFile(),hash=hex(await global.crypto.subtle.digest('SHA-256',await file.arrayBuffer()));
    if(name!==hash+'.pdf')continue;
    const seed=this.seeds.find(p=>(p.expected_pdf_sha256||[]).includes(hash));
    const paper=seed?this.manifest.papers.find(p=>p.id===seed.id):null;
    const record=paper||{id:seed?.id||'local-'+hash.slice(0,24),title:seed?.title||'待整理论文 '+hash.slice(0,8),origin:'local_upload',progress:'未核读',authors:'',year:null};
    record.pdf={name,sha256:hash,bytes:file.size,original_name:file.name};if(!paper)this.manifest.papers.push(record);count++;
   }
   if(count)await this.save();return count;
  }
 }
 async function remember(handle){
  return new Promise((resolve,reject)=>{const request=indexedDB.open('proof-atlas-local',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('handles');
   request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('handles','readwrite');
    try{tx.objectStore('handles').put(handle,'paper-pool');}catch(e){db.close();reject(e);return;}tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};});
 }
 async function recalled(){
  return new Promise(resolve=>{const request=indexedDB.open('proof-atlas-local',1);request.onupgradeneeded=()=>request.result.createObjectStore('handles');
   request.onerror=()=>resolve(null);request.onsuccess=()=>{const db=request.result,tx=db.transaction('handles','readonly'),query=tx.objectStore('handles').get('paper-pool');
    query.onsuccess=()=>resolve(query.result||null);query.onerror=()=>resolve(null);tx.oncomplete=()=>db.close();};});
 }
 const api={LocalPaperPool,validateManifest,remember,recalled,MAX_BYTES};
 global.ProofAtlasLocalPool=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
