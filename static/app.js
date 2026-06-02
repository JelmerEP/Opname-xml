'use strict';
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const LS_LIST = 'vabi_opnames', LS_DRAFT = 'vabi_draft';
let state = {};

// ---------- helpers ----------
function toast(msg){ let t=$('.toast'); if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);} t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
function load(k,d){ try{return JSON.parse(localStorage.getItem(k))??d}catch{return d} }
function save(k,v){ localStorage.setItem(k,JSON.stringify(v)); }
function naamVan(o){ const hnr=[o.huisnummer,o.huisletter].filter(Boolean).join(' '); const r=[o.straat,hnr].filter(Boolean).join(' '); const pc=[o.postcode,o.woonplaats].filter(Boolean).join(' '); return [r,pc].filter(Boolean).join(', ') || 'Nieuwe opname'; }

// ---------- systeem-sjabloon instantiëren (1 bron -> systeem 1 én 2) ----------
function buildSystems(){
  const tpl = document.getElementById('sysTemplate');
  if(!tpl) return;
  const html = tpl.innerHTML;
  const s1 = document.getElementById('sys1'), s2 = document.getElementById('sys2');
  if(s1) s1.innerHTML = html.replace(/__N__/g,'1');
  if(s2) s2.innerHTML = html.replace(/__N__/g,'2');
}

// ---------- afgeleide vlaggen voor samengestelde conditionals ----------
function deriveFlags(){
  ['1','2'].forEach(n=>{
    const to = state['tw'+n+'_type_opwekker'];
    const toestel = state['tw'+n+'_toestel'];
    // Voorraadvaten: bij indirect vat, of compleet + elektrische boiler / kokend waterkraan
    state['tw'+n+'_show_vaten'] = (to==='indirect' || (to==='compleet' && (toestel==='eboiler' || toestel==='kokend'))) ? 'ja' : '';
  });
}

// ---------- form binding ----------
function applyState(){
  deriveFlags();
  // tekst-/nummervelden + textareas
  $$('#opname input:not([type=checkbox]), #opname textarea').forEach(i=>{ if(state[i.name]!=null) i.value=state[i.name]; });
  // checkboxes
  $$('#opname input[type=checkbox]').forEach(c=>{ c.checked = !!state[c.name]; });
  // dropdowns
  $$('#opname select').forEach(s=>{ if(state[s.name]!=null) s.value=state[s.name]; });
  // keuzeknoppen
  $$('.opts').forEach(g=>{ const n=g.dataset.name; $$('button',g).forEach(b=>b.classList.toggle('sel', state[n]===b.dataset.val)); });
  // conditionele blokken (data-show="key=val" of "key=val1,val2")
  $$('[data-show]').forEach(fs=>{ const [k,v]=fs.dataset.show.split('='); fs.hidden = !v.split(',').includes(state[k]); });
}
function bind(){
  $$('#opname input:not([type=checkbox]), #opname textarea').forEach(i=>i.addEventListener('input',()=>{ state[i.name]=i.value; saveDraft(); }));
  $$('#opname input[type=checkbox]').forEach(c=>c.addEventListener('change',()=>{ state[c.name]=c.checked; applyState(); saveDraft(); }));
  $$('#opname select').forEach(s=>s.addEventListener('change',()=>{ state[s.name]=s.value; applyState(); saveDraft(); }));
  $$('.opts button').forEach(b=>b.addEventListener('click',()=>{
    const n=b.parentElement.dataset.name;
    state[n] = (state[n]===b.dataset.val) ? '' : b.dataset.val;  // toggle
    applyState(); saveDraft();
  }));
}
function saveDraft(){ save(LS_DRAFT, state); }

// ---------- opslaan / lijst ----------
function opnames(){ return load(LS_LIST, []); }
function renderList(){
  const list=opnames(); $('#count').textContent=list.length;
  const ul=$('#list'); ul.innerHTML='';
  list.slice().reverse().forEach(o=>{
    const li=document.createElement('li');
    li.innerHTML=`<div><strong>${naamVan(o)}</strong><div class="meta">${new Date(o._ts).toLocaleString('nl-NL')}</div></div>
      <div class="li-act"><button data-id="${o._id}" class="dl">XML</button><button data-id="${o._id}" class="ed">Open</button><button data-id="${o._id}" class="del">×</button></div>`;
    ul.appendChild(li);
  });
  $$('#list .dl').forEach(b=>b.onclick=()=>generate(opnames().find(x=>x._id===b.dataset.id)));
  $$('#list .ed').forEach(b=>b.onclick=()=>{ state={...opnames().find(x=>x._id===b.dataset.id)}; applyState(); saveDraft(); window.scrollTo(0,0); });
  $$('#list .del').forEach(b=>b.onclick=()=>{ save(LS_LIST, opnames().filter(x=>x._id!==b.dataset.id)); renderList(); });
}
function saveOpname(){
  if(!state.straat && !state.huisnummer){ toast('Vul minimaal een adres in'); return; }
  const list=opnames();
  const rec={...state, _id: state._id||('o'+Date.now()), _ts: Date.now()};
  const i=list.findIndex(x=>x._id===rec._id);
  if(i>=0) list[i]=rec; else list.push(rec);
  save(LS_LIST,list); state._id=rec._id; saveDraft(); renderList(); toast('Opgeslagen op dit apparaat');
}

// ---------- XML genereren ----------
async function generate(o){
  o = o || state;
  if(!navigator.onLine){ toast('Genereren kan alleen online — opname is wél lokaal opgeslagen'); return; }
  try{
    const r=await fetch('api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});
    if(!r.ok){ toast('Fout bij genereren ('+r.status+')'); return; }
    const blob=await r.blob();
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=('VabiImport_'+naamVan(o).replace(/[ ,]/g,'_'))+'.zip'; a.click();
    URL.revokeObjectURL(a.href); toast('XML gedownload');
  }catch(e){ toast('Genereren mislukt: '+e.message); }
}

// ---------- net-status ----------
function net(){ const e=$('#net'); const on=navigator.onLine; e.textContent=on?'online':'offline'; e.classList.toggle('off',!on); }

// ---------- init ----------
window.addEventListener('DOMContentLoaded',()=>{
  state = load(LS_DRAFT, {});
  if(!state.opnamedatum) state.opnamedatum = new Date().toISOString().slice(0,10);
  buildSystems(); bind(); applyState(); renderList(); net();
  $('#save').onclick=saveOpname;
  $('#gen').onclick=()=>{ saveOpname(); generate(); };
  $('#reset').onclick=()=>{ state={opnamedatum:new Date().toISOString().slice(0,10)}; applyState(); saveDraft(); toast('Nieuw formulier'); };
  window.addEventListener('online',net); window.addEventListener('offline',net);
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
});
