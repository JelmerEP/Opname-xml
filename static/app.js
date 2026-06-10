'use strict';
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const LS_LIST = 'vabi_opnames', LS_DRAFT = 'vabi_draft';
const BUILD = 'dev26';   // WERKKOPIE (dev-tak); versie-stempel in header
let state = {};

// ---------- helpers ----------
function toast(msg){ let t=$('.toast'); if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);} t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
function load(k,d){ try{return JSON.parse(localStorage.getItem(k))??d}catch{return d} }
function save(k,v){ localStorage.setItem(k,JSON.stringify(v)); }
function naamVan(o){ const hnr=[o.huisnummer,o.huisletter].filter(Boolean).join(' '); const r=[o.straat,hnr].filter(Boolean).join(' '); const pc=[o.postcode,o.woonplaats].filter(Boolean).join(' '); return [r,pc].filter(Boolean).join(', ') || 'Nieuwe opname'; }

// ---------- systeem-sjabloon instantiëren (1 bron -> systeem 1 én 2) ----------
function buildSystems(){
  const inst=(tplId,id,n)=>{ const t=document.getElementById(tplId), el=document.getElementById(id); if(t&&el) el.innerHTML=t.innerHTML.replace(/__N__/g,n); };
  inst('sysTemplate','sys1','1');  inst('sysTemplate','sys2','2');    // tapwater
  inst('vopwTemplate','vopw1','1'); inst('vopwTemplate','vopw2','2'); // verwarming-opwekkers
  inst('koTemplate','kopw1','1'); inst('koTemplate','kopw2','2'); inst('koTemplate','kopw3','3'); // koeling-opwekkers
}

// ---------- afgeleide vlaggen voor samengestelde conditionals ----------
function deriveFlags(){
  ['1','2'].forEach(n=>{
    const to = state['tw'+n+'_type_opwekker'];
    const toestel = state['tw'+n+'_toestel'];
    // Voorraadvaten: bij indirect vat, of compleet + elektrische boiler / kokend waterkraan
    state['tw'+n+'_show_vaten'] = (to==='indirect' || (to==='compleet' && (toestel==='eboiler' || toestel==='kokend'))) ? 'ja' : '';
  });
  // koeling: checkbox-booleans -> string-vlag zodat data-show erop kan reageren
  state.koel_show        = state.koel_aanwezig            ? 'ja' : '';
  state.koel_vent_show   = state.koel_ventilatorvermogen  ? 'ja' : '';
  state.koel_pomp2_show  = state.koel_aanvullende_pompen  ? 'ja' : '';
  state.koel_leiding_show= state.koel_leidingen_ongekoeld ? 'ja' : '';
  state.pv_show          = state.pv_aanwezig              ? 'ja' : '';
  state.zb_show          = state.zb_aanwezig              ? 'ja' : '';
  state.vw_onverwarmd_show = state.vw_onverwarmd_leidingen ? 'ja' : '';
}

// ---------- form binding ----------
function applyState(){
  // dropdowns zonder lege eerste optie (bv. Type installatie = Individueel) hun default in de state zetten,
  // anders faalt een data-show die op die default reageert (Type opwekker bleef verborgen)
  $$('#opname select').forEach(s=>{ if(state[s.name]==null && s.options.length) state[s.name]=s.options[0].value; });
  deriveFlags();
  // tekst-/nummervelden + textareas
  $$('#opname input:not([type=checkbox]), #opname textarea').forEach(i=>{ if(i.name && state[i.name]!=null) i.value=state[i.name]; });
  // checkboxes
  $$('#opname input[type=checkbox]').forEach(c=>{ c.checked = !!state[c.name]; });
  // dropdowns
  $$('#opname select').forEach(s=>{ if(state[s.name]!=null) s.value=state[s.name]; });
  // keuzeknoppen
  $$('.opts').forEach(g=>{ const n=g.dataset.name; $$('button',g).forEach(b=>b.classList.toggle('sel', state[n]===b.dataset.val)); });
  // conditionele blokken (data-show="key=val" of "key=val1,val2")
  $$('[data-show]').forEach(fs=>{ const [k,v]=fs.dataset.show.split('='); fs.hidden = !v.split(',').includes(state[k]); });
  showBagFoto(state.bag_x, state.bag_y);
}
function bind(){
  $$('#opname input:not([type=checkbox]), #opname textarea').forEach(i=>i.addEventListener('input',()=>{ if(!i.name)return; state[i.name]=i.value; saveDraft(); }));
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
  $$('#list .ed').forEach(b=>b.onclick=()=>{ state={...opnames().find(x=>x._id===b.dataset.id)}; applyState(); if(window.imRender)imRender(); saveDraft(); window.scrollTo(0,0); });
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

// ---------- verzenden (XML + PDF per e-mail) ----------
function fieldLabel(el){
  const lab=el.closest('label');
  if(lab){ for(const n of lab.childNodes){ if(n.nodeType===3 && n.textContent.trim()) return n.textContent.trim(); } }
  return el.name||'';
}
function collectSummary(){
  // leesbare samenvatting (label -> gekozen tekst) per zichtbare sectie, voor de PDF
  const out=[];
  $$('#opname > fieldset').forEach(fs=>{
    if(fs.hidden) return;                                   // sectie niet van toepassing
    const lg=fs.querySelector('legend');
    const section=lg?lg.textContent.replace(/[▾▸]/g,'').trim():'';
    const rows=[];
    fs.querySelectorAll('select, input, textarea, .opts').forEach(el=>{
      if(el.closest('[hidden]')) return;                    // conditioneel verborgen -> overslaan
      if(el.classList && el.classList.contains('opts')){    // keuzeknoppen
        const b=el.querySelector('button.sel'); if(!b) return;
        let p=el.previousElementSibling;
        while(p && !(p.classList && p.classList.contains('lbl')) && p.tagName!=='LEGEND') p=p.previousElementSibling;
        rows.push([p?p.textContent.replace(/[▾▸]/g,'').trim():(el.dataset.name||''), b.textContent.trim()]);
        return;
      }
      if(el.id==='sendmail' || el.id==='bagzoek' || !el.name) return;
      if(el.type==='checkbox'){ if(el.checked) rows.push([fieldLabel(el),'ja']); return; }
      let val=(el.value||'').trim(); if(!val) return;
      if(el.tagName==='SELECT'){ const op=el.options[el.selectedIndex]; if(!op || op.value==='') return; val=op.text.trim(); }
      rows.push([fieldLabel(el), val]);
    });
    if(rows.length) out.push({section, rows});
  });
  return out;
}
async function send(){
  const email=($('#sendmail').value||'').trim();
  if(!/.+@.+\..+/.test(email)){ toast('Vul een geldig e-mailadres in'); return; }
  if(!state.straat && !state.huisnummer){ toast('Vul minimaal een adres in'); return; }
  if(!navigator.onLine){ toast('Verzenden kan alleen online'); return; }
  saveOpname();                                             // ook lokaal bewaren (niet kwijtraken)
  const btn=$('#send'), old=btn.textContent; btn.disabled=true; btn.textContent='Versturen…';
  let pdf_base64=null;
  try{ if(window.imPdfBase64) pdf_base64=await window.imPdfBase64(); }catch(e){ /* val terug op server-PDF */ }
  try{
    const r=await fetch('api/send',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({opname:state, summary:collectSummary(), email, pdf_base64})});
    const j=await r.json().catch(()=>({}));
    if(r.ok && j.ok){ toast('✓ Verzonden naar '+email); $('#sendmail').value=''; }
    else toast('Verzenden mislukt: '+(j.error||('fout '+r.status)));
  }catch(e){ toast('Verzenden mislukt: '+e.message); }
  finally{ btn.disabled=false; btn.textContent=old; }
}

// ---------- BAG adres-zoeken (typeahead) ----------
function showBag(t,cls){ const m=$('#bagmsg'); if(!m)return; m.hidden=false; m.textContent=t; m.className='bagmsg'+(cls?' '+cls:''); }
function hideBagSug(){ const ul=$('#bagsug'); if(ul){ ul.hidden=true; ul.innerHTML=''; } }
let bagTimer;
function bagInput(){
  const q=$('#bagzoek').value.trim();
  clearTimeout(bagTimer);
  if(q.length<3){ hideBagSug(); return; }
  bagTimer=setTimeout(async()=>{
    try{ const r=await fetch('api/bag/suggest?q='+encodeURIComponent(q)); const j=await r.json(); if(Array.isArray(j)) renderBagSug(j); }catch(e){}
  },250);
}
function renderBagSug(list){
  const ul=$('#bagsug'); ul.innerHTML='';
  if(!list.length){ hideBagSug(); return; }
  list.forEach(s=>{ const li=document.createElement('li'); li.textContent=s.label; li.onmousedown=e=>{ e.preventDefault(); pickBag(s.id); }; ul.appendChild(li); });
  ul.hidden=false;
}
function showBagFoto(x,y){
  const foto=$('#bagfoto'), cap=$('#bagfotocap'); if(!foto) return;
  if(x && y){
    const d=20;   // ~40 m beeld rond het pand
    foto.onerror=()=>{ foto.hidden=true; if(cap) cap.hidden=true; };
    foto.src='https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Actueel_orthoHR&SRS=EPSG:28992&STYLES=&FORMAT=image/jpeg&WIDTH=480&HEIGHT=480&BBOX='+[x-d,y-d,x+d,y+d].join(',');
    foto.hidden=false; if(cap) cap.hidden=false;
  } else { foto.hidden=true; foto.removeAttribute('src'); if(cap) cap.hidden=true; }
}
async function pickBag(id){
  hideBagSug(); $('#bagzoek').value=''; showBag('Ophalen…','');
  try{
    const r=await fetch('api/bag/lookup?id='+encodeURIComponent(id)); const j=await r.json();
    if(!r.ok||j.error){ showBag('Fout: '+(j.error||r.status),'err'); return; }
    state.straat=j.straat||''; state.huisnummer=j.huisnummer||''; state.huisletter=j.huisletter||'';
    state.postcode=j.postcode||''; state.woonplaats=j.woonplaats||'';
    if(j.bouwjaar) state.bouwjaar=String(j.bouwjaar);
    if(j.hoogte!=null) state.gebouwhoogte=String(j.hoogte);
    state.bag_x=j.x; state.bag_y=j.y;
    applyState(); saveDraft();
    const adr=[j.straat,(''+(j.huisnummer||''))+(j.huisletter||'')].filter(Boolean).join(' ');
    showBag('✓ '+adr+' — bouwjaar '+(j.bouwjaar||'?')+', hoogte '+(j.hoogte!=null?j.hoogte+' m':'?'),'');
  }catch(e){ showBag('Fout: '+e.message,'err'); }
}

// ---------- net-status ----------
function net(){ const e=$('#net'); const on=navigator.onLine; e.textContent=on?'online':'offline'; e.classList.toggle('off',!on); }

// ---------- init ----------
window.addEventListener('DOMContentLoaded',()=>{
  state = load(LS_DRAFT, {});
  if(!state.opnamedatum) state.opnamedatum = new Date().toISOString().slice(0,10);
  buildSystems(); bind(); applyState(); renderList(); net();
  // inklapbare secties: klik op de eerste legend van een fieldset
  $$('#opname > fieldset > legend:first-of-type').forEach(lg=>lg.addEventListener('click',()=>lg.parentElement.classList.toggle('collapsed')));
  const bz=$('#bagzoek'); if(bz){ bz.addEventListener('input',bagInput); bz.addEventListener('blur',()=>setTimeout(hideBagSug,150)); }
  $('#save').onclick=saveOpname;
  $('#gen').onclick=()=>{ saveOpname(); generate(); };
  $('#send').onclick=send;
  $('#reset').onclick=()=>{
    if(!confirm('Formulier legen en met een leeg adres beginnen?\nJe opgeslagen opnames in de lijst blijven bewaard.')) return;
    state={opnamedatum:new Date().toISOString().slice(0,10)};
    const bz=$('#bagzoek'); if(bz) bz.value='';
    const bm=$('#bagmsg'); if(bm){ bm.hidden=true; bm.textContent=''; }
    hideBagSug(); applyState(); if(window.imRender)imRender(); saveDraft(); window.scrollTo(0,0);
    toast('Leeg — klaar voor het volgende adres');
  };
  window.addEventListener('online',net); window.addEventListener('offline',net);
  // versie tonen + automatisch verversen bij een nieuwe deploy (geen incognito meer nodig)
  const verEl=$('#ver'); if(verEl) verEl.textContent=BUILD;
  if('serviceWorker' in navigator){
    let reloaded=false;
    const hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(reloaded || !hadController) return;   // eerste registratie niet herladen, echte update wel
      reloaded=true; location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(reg=>{
      reg.update();                               // check meteen op een nieuwe versie
      setInterval(()=>reg.update(), 60000);       // en elke minuut zolang de app open staat
      reg.addEventListener('updatefound',()=>{
        const nw=reg.installing;
        if(nw) nw.addEventListener('statechange',()=>{
          if(nw.state==='installed' && navigator.serviceWorker.controller) toast('Nieuwe versie wordt geladen…');
        });
      });
    }).catch(()=>{});
  }
});
