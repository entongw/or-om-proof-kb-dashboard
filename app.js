'use strict';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Number(n).toLocaleString('en-US');
const accepted = x => x.status === 'semantically_accepted_existing_proof';
const labels = {overview:'知识库概览',interfaces:'数学接口',papers:'论文池',proofs:'假设与后悔界',mcp:'DeepSeek 用量'};
const domains = {inventory:'库存与新闻商',optimization:'在线优化',probability:'概率与随机过程',regret_accounting:'后悔界记账',revenue_management:'收益管理',composition:'组合与应用'};
const statusLabel = s => ({semantically_accepted_existing_proof:'已独立验收',verification_failed:'验证失败',legacy_evidence_available_mapping_pending:'冻结 · 无最终验证回执',accepted_full_regret:'修正版完整上界已验收',verified_component:'仅组件已验证',statement_pending:'陈述 / 证明待完成',not_in_table:'不在目标表内'}[s] || s);
const badge = s => `<span class="badge ${s.includes('accepted')?'accepted':s.includes('failed')?'failed':s.includes('pending')?'pending':s.includes('component')?'neutral':'pending'}">${esc(statusLabel(s))}</span>`;
let data, view, latest;
function title(eyebrow,heading,description,action=''){return `<div class="page-title"><div><span class="eyebrow">${eyebrow}</span><h1>${heading}</h1><p>${description}</p></div>${action}</div>`;}
function metric(label,value,note,extra=''){return `<article class="metric"><div class="metric-label">${label}<span>${extra}</span></div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`;}
function panel(name,body,link=''){return `<section class="panel"><div class="panel-head"><h2>${name}</h2>${link}</div>${body}</section>`;}
function table(rows,headers){return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;}
function interfaceRows(list){return list.map(x=>`<tr data-open="interface:${esc(x.id)}:${x.version}" tabindex="0" aria-label="查看 ${esc(x.title)} v${x.version}"><td><strong>${esc(x.title)}</strong><small>${esc(x.id)}</small></td><td>${esc(domains[x.domain] || x.domain)}</td><td>v${x.version}</td><td>${badge(x.status)}</td><td class="table-action">↗</td></tr>`);}
function interfacesView(){return title('VERSIONED MATHEMATICS','数学接口','查看数学假设、Definition–Lemma–Theorem 文档，以及与冻结材料绑定的验证及验收回执。')+
 `<div class="toolbar"><input id="interface-search" class="search" aria-label="搜索数学接口" placeholder="搜索接口、技巧或 Lean 声明…"><select id="domain-filter" aria-label="按数学模块筛选"><option value="">全部数学模块</option>${Object.entries(domains).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><select id="version-filter" aria-label="按版本状态筛选"><option value="latest">当前版本</option><option value="all">全部历史版本</option><option value="failed">验证失败</option><option value="interrupted">中断 / 无最终回执</option></select><span class="result-count" id="results-count"></span></div>`+
 panel('接口目录',`<div id="interface-table"></div>`)+`<p class="muted" style="font-size:11px">状态来自本地完整性校验及不可变回执；网页不会重新编译 Lean。历史冻结无最终回执的两个版本，不能显示为验证失败或已验收。</p>`;}
function filterInterfaces(){const q=$('#interface-search').value.toLowerCase(),d=$('#domain-filter').value,v=$('#version-filter').value;
 let list=v==='latest'?latest:data.interfaces;
 if(v==='failed')list=list.filter(x=>x.status==='verification_failed');
 if(v==='interrupted')list=list.filter(x=>!accepted(x)&&x.status!=='verification_failed');
 list=list.filter(x=>(!d||x.domain===d)&&JSON.stringify([x.id,x.title,x.lean,x.techniques]).toLowerCase().includes(q));
 $('#results-count').textContent=`${list.length} 个版本`;
 $('#interface-table').innerHTML=list.length?table(interfaceRows(list),['接口','数学模块','版本','证据状态','']):'<div class="empty">没有符合条件的接口。试试其他关键词或筛选条件。</div>';
}
function list(items){return `<ul>${(items||[]).map(x=>`<li>${esc(typeof x==='string'?x:JSON.stringify(x))}</li>`).join('')}</ul>`;}
function showDetail(key){const [kind,id,version]=key.split(':');let heading,body;
 if(kind==='interface'){const x=data.interfaces.find(x=>x.id===id&&x.version===Number(version));if(!x)return;heading=`${x.title} · v${x.version}`;
 body=`${badge(x.status)} <span class="tag">${esc(domains[x.domain])}</span><h3>数学假设</h3>${list(x.assumptions.map(a=>a.id+' · '+a.meaning))}<h3>适用边界与未闭合义务</h3>${list([...x.scope_notes,...x.obligations])}${Object.entries(x.documents).map(([k,v])=>`<details><summary>${{definitions:'Definition · 数学对象',lemmas:'Lemma · 局部可复用性质',theorems:'Theorem · 组合结果'}[k]}</summary><pre>${esc(v)}</pre></details>`).join('')}<h3>Lean 对应声明</h3><pre>${esc(JSON.stringify(x.lean,null,2))}</pre><details><summary>实际项目依赖及公理</summary><pre>${esc(JSON.stringify({project_dependencies:x.dependencies,axioms:x.axioms},null,2))}</pre></details><h3>回执与材料指纹</h3><p>独立验收者：${esc(x.reviewer||'无最终验收回执')}</p><pre>${esc(JSON.stringify({material_sha256:x.material_sha256,...x.receipts},null,2))}</pre><p>原有技巧：${esc(x.techniques.join(' · '))}</p><a class="subtle-button" target="_blank" rel="noopener" href="https://github.com/entongw/or-om-proof-kb/tree/codex/mathematical-interface-dashboard/${encodeURI(x.path)}">GitHub 接口记录 ↗</a>`;
 }else return;
 openDialog('MATHEMATICAL INTERFACE',heading,body);
}

function openDialog(kind,heading,body){$('#detail-kind').textContent=kind;$('#detail-title').textContent=heading;$('#detail-body').innerHTML=body;if(!$('#detail').open)$('#detail').showModal();}
function render(){view=location.hash.slice(1)||'overview';if(!labels[view])view='overview';$('#breadcrumb').textContent=labels[view];document.title=`${labels[view]} · Proof Atlas`;
 document.querySelectorAll('nav a').forEach(a=>{a.classList.toggle('active',a.dataset.view===view);if(a.dataset.view===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 $('#content').innerHTML={overview,interfaces:interfacesView,papers:papersView,mcp:mcpView,proofs:proofsView}[view]();
 if(view==='interfaces'){filterInterfaces();['interface-search','domain-filter','version-filter'].forEach(id=>$('#'+id).addEventListener(id.includes('search')?'input':'change',filterInterfaces));}
 bindWorkspace();window.scrollTo(0,0);
}
document.addEventListener('click',e=>{const el=e.target.closest('[data-open]');if(el)showDetail(el.dataset.open);});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('tr[data-open]')){e.preventDefault();showDetail(e.target.dataset.open);}});
$('#close-detail').addEventListener('click',()=>$('#detail').close());
$('#detail').addEventListener('click',e=>{if(e.target===$('#detail')){const b=$('#detail').getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)$('#detail').close();}});
document.addEventListener('DOMContentLoaded',()=>fetch('data/knowledge.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).then(d=>{
 data=d;const current=new Map();data.interfaces.forEach(x=>{if(!current.has(x.id)||current.get(x.id).version<x.version)current.set(x.id,x);});latest=[...current.values()];$('#interface-count').textContent=latest.length;$('#snapshot-date').textContent='用量 / 证据快照 '+data.generated_at.slice(0,10);$('#loading').remove();render();window.addEventListener('hashchange',render);window.dispatchEvent(new Event('proof-atlas-ready'));
}).catch(()=>{const loading=$('#loading');if(loading)loading.innerHTML='快照加载失败。请刷新页面，或使用 HTTP 服务打开网页目录。';}));
