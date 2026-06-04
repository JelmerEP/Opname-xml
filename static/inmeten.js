'use strict';
// ---------- Inmeet-module (werkkopie) ----------
// Per verdieping een plattegrond (rechthoek: maten -> oppervlak) + ramen/deuren.
// Gebruikt globals uit app.js: $, $$, state, saveDraft, toast.
// Foto's, L-vormen en de PDF-uitdraai komen in volgende slices.

const BEGLAZING = ['Enkel glas', 'Dubbel glas', 'HR', 'HR+', 'HR++', 'HR+++ / triple', 'Onbekend'];
const ORIENTATIES = ['', 'Noord', 'Oost', 'Zuid', 'West'];

function imData(){ if(!state.inmeten) state.inmeten = { verdiepingen: [] }; return state.inmeten; }
function imId(){ return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function imNum(s){ return parseFloat(String(s == null ? '' : s).replace(',', '.')) || 0; }
function imEsc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function imVerd(vid){ return imData().verdiepingen.find(v => v.id === vid); }
function imOpen(vid, oid){ const v = imVerd(vid); return v ? v.openingen.find(o => o.id === oid) : null; }
function imOpp(v){ const l = imNum(v.l), b = imNum(v.b); return l > 0 && b > 0 ? l * b : 0; }

function imAddVerd(){
  const d = imData(), nr = d.verdiepingen.length;
  const naam = nr === 0 ? 'Begane grond' : (nr + 'e verdieping');
  d.verdiepingen.push({ id: imId(), naam, l: '', b: '', hoogte: '', openingen: [] });
  saveDraft(); imRender();
}
function imDelVerd(vid){ const d = imData(); d.verdiepingen = d.verdiepingen.filter(v => v.id !== vid); saveDraft(); imRender(); }
function imAddOpen(vid){ const v = imVerd(vid); if(!v) return; v.openingen.push({ id: imId(), type: 'raam', orientatie: '', b: '', h: '', beglazing: '', notitie: '' }); saveDraft(); imRender(); }
function imDelOpen(vid, oid){ const v = imVerd(vid); if(!v) return; v.openingen = v.openingen.filter(o => o.id !== oid); saveDraft(); imRender(); }

function imPlanSvg(v){
  const l = imNum(v.l), b = imNum(v.b), W = 300, H = 190, pad = 38;
  if(!(l > 0 && b > 0)) return `<svg class="plan" viewBox="0 0 ${W} ${H}"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="plan-hint">vul lengte en breedte in</text></svg>`;
  const sc = Math.min((W - 2 * pad) / l, (H - 2 * pad) / b);
  const rw = l * sc, rh = b * sc, x = (W - rw) / 2, y = (H - rh) / 2;
  return `<svg class="plan" viewBox="0 0 ${W} ${H}">
    <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" class="plan-rect"/>
    <text x="${(x + rw / 2).toFixed(1)}" y="${(y - 12).toFixed(1)}" text-anchor="middle" class="plan-dim">${imEsc(v.l)} m</text>
    <text x="${(x - 12).toFixed(1)}" y="${(y + rh / 2).toFixed(1)}" text-anchor="middle" transform="rotate(-90 ${(x - 12).toFixed(1)} ${(y + rh / 2).toFixed(1)})" class="plan-dim">${imEsc(v.b)} m</text>
    <text x="${(x + rw / 2).toFixed(1)}" y="${(y + rh / 2 + 5).toFixed(1)}" text-anchor="middle" class="plan-area">${imOpp(v).toFixed(2)} m&#178;</text>
  </svg>`;
}

function imOpenHtml(vid, o){
  const opt = (arr, val, withKies) => (withKies ? `<option value=""${!val ? ' selected' : ''}>— kies —</option>` : '') +
    arr.filter(a => a !== '').map(a => `<option${val === a ? ' selected' : ''}>${imEsc(a)}</option>`).join('');
  return `<div class="op" data-vid="${vid}" data-oid="${o.id}">
    <div class="row">
      <label>Type<select class="op-f" data-k="type" data-vid="${vid}" data-oid="${o.id}">
        <option value="raam"${o.type === 'raam' ? ' selected' : ''}>Raam</option>
        <option value="deur"${o.type === 'deur' ? ' selected' : ''}>Deur</option></select></label>
      <label>Oriëntatie<select class="op-f" data-k="orientatie" data-vid="${vid}" data-oid="${o.id}">
        <option value=""${!o.orientatie ? ' selected' : ''}>—</option>${ORIENTATIES.filter(x => x).map(x => `<option${o.orientatie === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
    </div>
    <div class="row">
      <label>Breedte (m)<input class="op-f" data-k="b" inputmode="decimal" data-vid="${vid}" data-oid="${o.id}" value="${imEsc(o.b)}"></label>
      <label>Hoogte (m)<input class="op-f" data-k="h" inputmode="decimal" data-vid="${vid}" data-oid="${o.id}" value="${imEsc(o.h)}"></label>
    </div>
    <label>Beglazing<select class="op-f" data-k="beglazing" data-vid="${vid}" data-oid="${o.id}">${opt(BEGLAZING, o.beglazing, true)}</select></label>
    <label>Notitie<input class="op-f" data-k="notitie" data-vid="${vid}" data-oid="${o.id}" value="${imEsc(o.notitie)}"></label>
    <button type="button" class="op-del" data-vid="${vid}" data-oid="${o.id}">Verwijder raam/deur</button>
  </div>`;
}

function imRender(){
  const host = $('#inmeten'); if(!host) return;
  const d = imData();
  let html = '';
  d.verdiepingen.forEach(v => {
    html += `<div class="vd" data-vid="${v.id}">
      <div class="vd-head"><input class="vd-f vd-naam" data-k="naam" data-vid="${v.id}" value="${imEsc(v.naam)}" placeholder="Naam verdieping">
        <button type="button" class="vd-del" data-vid="${v.id}" title="Verwijder verdieping">×</button></div>
      ${imPlanSvg(v)}
      <div class="row">
        <label>Lengte (m)<input class="vd-dim" data-k="l" inputmode="decimal" data-vid="${v.id}" value="${imEsc(v.l)}" placeholder="bv. 8"></label>
        <label>Breedte (m)<input class="vd-dim" data-k="b" inputmode="decimal" data-vid="${v.id}" value="${imEsc(v.b)}" placeholder="bv. 4"></label>
        <label>Hoogte (m)<input class="vd-f" data-k="hoogte" inputmode="decimal" data-vid="${v.id}" value="${imEsc(v.hoogte)}" placeholder="bv. 2.5"></label>
      </div>
      <div class="vd-area">Vloeroppervlak: <strong>${imOpp(v) ? imOpp(v).toFixed(2) + ' m²' : '—'}</strong></div>
      <h4>Ramen &amp; deuren</h4>
      <div class="ops">${v.openingen.map(o => imOpenHtml(v.id, o)).join('')}</div>
      <button type="button" class="op-add" data-vid="${v.id}">+ Raam / deur</button>
    </div>`;
  });
  html += `<button type="button" id="vd-add" class="vd-add-btn">+ Verdieping toevoegen</button>`;
  host.innerHTML = html;
  imBind();
}

function imUpdatePlan(vid){
  const v = imVerd(vid); if(!v) return;
  const card = $(`#inmeten .vd[data-vid="${vid}"]`); if(!card) return;
  const svg = card.querySelector('.plan'); if(svg) svg.outerHTML = imPlanSvg(v);
  const area = card.querySelector('.vd-area strong'); if(area) area.textContent = imOpp(v) ? imOpp(v).toFixed(2) + ' m²' : '—';
}

function imBind(){
  const add = $('#vd-add'); if(add) add.onclick = imAddVerd;
  $$('#inmeten .vd-del').forEach(b => b.onclick = () => { if(confirm('Verdieping verwijderen?')) imDelVerd(b.dataset.vid); });
  $$('#inmeten .op-add').forEach(b => b.onclick = () => imAddOpen(b.dataset.vid));
  $$('#inmeten .op-del').forEach(b => b.onclick = () => imDelOpen(b.dataset.vid, b.dataset.oid));
  // verdieping-velden (naam, hoogte): direct in state, geen rebuild
  $$('#inmeten .vd-f').forEach(i => i.oninput = () => { const v = imVerd(i.dataset.vid); if(v){ v[i.dataset.k] = i.value; saveDraft(); } });
  // lengte/breedte: state + live plattegrond bijwerken (geen rebuild -> focus blijft)
  $$('#inmeten .vd-dim').forEach(i => i.oninput = () => { const v = imVerd(i.dataset.vid); if(v){ v[i.dataset.k] = i.value; saveDraft(); imUpdatePlan(i.dataset.vid); } });
  // opening-velden
  $$('#inmeten .op-f').forEach(el => { const ev = el.tagName === 'SELECT' ? 'onchange' : 'oninput'; el[ev] = () => { const o = imOpen(el.dataset.vid, el.dataset.oid); if(o){ o[el.dataset.k] = el.value; saveDraft(); } }; });
}

// init + opnieuw renderen wanneer een opname geladen/geleegd wordt (app.js roept window.imRender aan)
window.imRender = imRender;
window.addEventListener('DOMContentLoaded', imRender);
