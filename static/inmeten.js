'use strict';
// ---------- Inmeet-module (werkkopie) ----------
// Per verdieping: een orthogonale SCHETS (tik om hoeken te zetten, muren blijven haaks),
// per muur een lengte -> automatisch vloeroppervlak. Plus ramen/deuren (m2 + type).
// Foto's + foto naar muur slepen volgen in de volgende slice.
// Gebruikt globals uit app.js: $, $$, state, saveDraft.

const BEGLAZING = ['Enkel glas', 'Dubbel glas', 'HR', 'HR+', 'HR++', 'HR+++ / triple', 'Onbekend'];
const GRID = 12;            // snap-raster (px) in de schets
const SV_W = 300, SV_H = 220, SV_PAD = 26;

function imData(){ if(!state.inmeten) state.inmeten = { verdiepingen: [] }; return state.inmeten; }
function imId(){ return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function imNum(s){ return parseFloat(String(s == null ? '' : s).replace(',', '.')) || 0; }
function imEsc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function imVerd(vid){ return imData().verdiepingen.find(v => v.id === vid); }
function imOpen(vid, oid){ const v = imVerd(vid); return v ? v.openingen.find(o => o.id === oid) : null; }
function imSnap(n){ return Math.round(n / GRID) * GRID; }

// --- geometrie: echte coordinaten uit (getekende richtingen + ingevoerde lengtes) ---
function imReal(v){
  const p = v.sketch.punten, m = v.muren || [];
  if(!v.sketch.gesloten || p.length < 3) return null;
  let x = 0, y = 0; const rc = [[0, 0]];
  for(let i = 0; i < p.length; i++){
    const a = p[i], b = p[(i + 1) % p.length], len = imNum(m[i]);
    if(!len) return null;                       // nog niet alle muren ingevuld
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if(Math.abs(dx) >= Math.abs(dy)) x += Math.sign(dx) * len; else y += Math.sign(dy) * len;
    rc.push([x, y]);
  }
  return rc;                                     // N+1 punten; rc[N] ~ rc[0]
}
function imArea(v){
  const rc = imReal(v); if(!rc) return 0;
  const n = rc.length - 1; let a = 0;
  for(let i = 0; i < n; i++){ const p1 = rc[i], p2 = rc[(i + 1) % n]; a += p1[0] * p2[1] - p2[0] * p1[1]; }
  return Math.abs(a) / 2;
}
function imSluit(v){                              // sluit de getekende vorm met de ingevoerde maten?
  const rc = imReal(v); if(!rc) return true;
  const last = rc[rc.length - 1];
  return Math.hypot(last[0], last[1]) < 0.05;
}

function imGridBg(){
  let g = '';
  for(let x = 0; x <= SV_W; x += 20) g += `<line x1="${x}" y1="0" x2="${x}" y2="${SV_H}" class="plan-grid"/>`;
  for(let y = 0; y <= SV_H; y += 20) g += `<line x1="0" y1="${y}" x2="${SV_W}" y2="${y}" class="plan-grid"/>`;
  return g;
}

function imSketchSvg(v){
  const s = v.sketch, p = s.punten;
  let inner = imGridBg();
  if(!s.gesloten){
    if(p.length === 0){
      inner += `<text x="${SV_W / 2}" y="${SV_H / 2}" text-anchor="middle" class="plan-hint">tik om de hoeken te plaatsen</text>`;
    } else {
      const pts = p.map(q => q[0] + ',' + q[1]).join(' ');
      inner += `<polyline points="${pts}" class="plan-line"/>`;
      p.forEach((q, i) => { inner += `<circle cx="${q[0]}" cy="${q[1]}" r="${i === 0 && p.length >= 3 ? 7 : 4}" class="plan-pt${i === 0 && p.length >= 3 ? ' plan-pt-close' : ''}"/>`; });
      if(p.length >= 3) inner += `<text x="${SV_W / 2}" y="${SV_H - 6}" text-anchor="middle" class="plan-hint">tik op het groene punt om te sluiten</text>`;
    }
    return `<svg class="plan plan-draw" data-vid="${v.id}" viewBox="0 0 ${SV_W} ${SV_H}">${inner}</svg>`;
  }
  // gesloten: teken op schaal als alle maten er zijn, anders de ruwe schets
  const rc = imReal(v);
  if(rc){
    const xs = rc.map(c => c[0]), ys = rc.map(c => c[1]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const w = (maxx - minx) || 1, h = (maxy - miny) || 1;
    const sc = Math.min((SV_W - 2 * SV_PAD) / w, (SV_H - 2 * SV_PAD) / h);
    const ox = (SV_W - w * sc) / 2 - minx * sc, oy = (SV_H - h * sc) / 2 - miny * sc;
    const X = c => (c[0] * sc + ox).toFixed(1), Y = c => (c[1] * sc + oy).toFixed(1);
    const n = rc.length - 1;
    const poly = rc.slice(0, n).map(c => X(c) + ',' + Y(c)).join(' ');
    inner += `<polygon points="${poly}" class="plan-rect"/>`;
    for(let i = 0; i < n; i++){ const a = rc[i], b = rc[(i + 1) % n]; inner += `<text x="${(parseFloat(X(a)) + parseFloat(X(b))) / 2}" y="${(parseFloat(Y(a)) + parseFloat(Y(b))) / 2 - 3}" text-anchor="middle" class="plan-dim">${imEsc(v.muren[i])}</text>`; }
    inner += `<text x="${SV_W / 2}" y="${SV_H / 2 + 5}" text-anchor="middle" class="plan-area">${imArea(v).toFixed(2)} m&#178;</text>`;
    if(!imSluit(v)) inner += `<text x="${SV_W / 2}" y="${SV_H - 6}" text-anchor="middle" class="plan-warn">sluit niet helemaal — controleer maten</text>`;
  } else {
    const pts = p.map(q => q[0] + ',' + q[1]).join(' ');
    inner += `<polygon points="${pts}" class="plan-rect"/>`;
    inner += `<text x="${SV_W / 2}" y="${SV_H / 2 + 5}" text-anchor="middle" class="plan-hint">vul de muurlengtes in</text>`;
  }
  return `<svg class="plan" data-vid="${v.id}" viewBox="0 0 ${SV_W} ${SV_H}">${inner}</svg>`;
}

function imWallsHtml(v){
  if(!v.sketch.gesloten) return '';
  const p = v.sketch.punten;
  let rows = '';
  for(let i = 0; i < p.length; i++){
    const a = p[i], b = p[(i + 1) % p.length];
    const horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
    rows += `<label class="wall">Muur ${i + 1} ${horiz ? '↔' : '↕'}<input class="wall-len" inputmode="decimal" data-vid="${v.id}" data-i="${i}" value="${imEsc((v.muren && v.muren[i]) || '')}" placeholder="m"></label>`;
  }
  return `<div class="walls">${rows}</div>`;
}

function imOpenHtml(vid, o){
  return `<div class="op" data-vid="${vid}" data-oid="${o.id}">
    <div class="row">
      <label>Type<select class="op-f" data-k="type" data-vid="${vid}" data-oid="${o.id}">
        <option value="raam"${o.type === 'raam' ? ' selected' : ''}>Raam</option>
        <option value="deur"${o.type === 'deur' ? ' selected' : ''}>Deur</option></select></label>
      <label>Oppervlak (m²)<input class="op-f" data-k="m2" inputmode="decimal" data-vid="${vid}" data-oid="${o.id}" value="${imEsc(o.m2)}"></label>
    </div>
    <label>Beglazing<select class="op-f" data-k="beglazing" data-vid="${vid}" data-oid="${o.id}">
      <option value=""${!o.beglazing ? ' selected' : ''}>— kies —</option>
      ${BEGLAZING.map(b => `<option${o.beglazing === b ? ' selected' : ''}>${imEsc(b)}</option>`).join('')}</select></label>
    <label>Notitie<input class="op-f" data-k="notitie" data-vid="${vid}" data-oid="${o.id}" value="${imEsc(o.notitie)}"></label>
    <button type="button" class="op-del" data-vid="${vid}" data-oid="${o.id}">Verwijder</button>
  </div>`;
}

function imCardHtml(v){
  return `<div class="vd" data-vid="${v.id}">
    <div class="vd-head"><input class="vd-f vd-naam" data-k="naam" data-vid="${v.id}" value="${imEsc(v.naam)}" placeholder="Naam verdieping">
      <button type="button" class="vd-del" data-vid="${v.id}" title="Verwijder verdieping">×</button></div>
    ${imSketchSvg(v)}
    <div class="sketch-act">
      ${v.sketch.gesloten ? `<button type="button" class="sk-clear" data-vid="${v.id}">↺ Opnieuw tekenen</button>` :
        (v.sketch.punten.length ? `<button type="button" class="sk-undo" data-vid="${v.id}">↶ Laatste punt</button><button type="button" class="sk-clear" data-vid="${v.id}">↺ Wissen</button>` : '')}
    </div>
    ${imWallsHtml(v)}
    <div class="row"><label>Hoogte (m)<input class="vd-f" data-k="hoogte" inputmode="decimal" data-vid="${v.id}" value="${imEsc(v.hoogte)}" placeholder="bv. 2.5"></label>
      <div class="vd-area">Vloeroppervlak<strong>${imArea(v) ? imArea(v).toFixed(2) + ' m²' : '—'}</strong></div></div>
    <h4>Ramen &amp; deuren</h4>
    <div class="ops">${v.openingen.map(o => imOpenHtml(v.id, o)).join('')}</div>
    <button type="button" class="op-add" data-vid="${v.id}">+ Raam / deur</button>
  </div>`;
}

function imRender(){
  const host = $('#inmeten'); if(!host) return;
  host.innerHTML = imData().verdiepingen.map(imCardHtml).join('') + `<button type="button" id="vd-add" class="vd-add-btn">+ Verdieping toevoegen</button>`;
  imBind();
}
function imRenderCard(vid){
  const card = $(`#inmeten .vd[data-vid="${vid}"]`); const v = imVerd(vid); if(!card || !v) return;
  card.outerHTML = imCardHtml(v); imBind();
}
function imRefreshSketch(vid){   // alleen schets + oppervlak verversen (zonder de muur-inputs te herbouwen -> focus blijft)
  const v = imVerd(vid), card = $(`#inmeten .vd[data-vid="${vid}"]`); if(!v || !card) return;
  const svg = card.querySelector('.plan'); if(svg) svg.outerHTML = imSketchSvg(v);
  const area = card.querySelector('.vd-area strong'); if(area) area.textContent = imArea(v) ? imArea(v).toFixed(2) + ' m²' : '—';
  const draw = card.querySelector('.plan-draw'); if(draw) imBindSketch(draw);
}

function imSvgPoint(svg, e){
  const pt = svg.createSVGPoint(), t = e.touches ? e.touches[0] : e;
  pt.x = t.clientX; pt.y = t.clientY;
  const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [Math.max(0, Math.min(SV_W, loc.x)), Math.max(0, Math.min(SV_H, loc.y))];
}
function imTap(vid, sx, sy){
  const v = imVerd(vid); if(!v || v.sketch.gesloten) return;
  const p = v.sketch.punten;
  let nx = imSnap(sx), ny = imSnap(sy);
  if(p.length === 0){ p.push([nx, ny]); }
  else {
    const last = p[p.length - 1];
    // sluiten? dichtbij eerste punt + minstens 3 hoeken
    if(p.length >= 3 && Math.hypot(sx - p[0][0], sy - p[0][1]) < 16){
      v.sketch.gesloten = true; v.muren = p.map(() => ''); saveDraft(); imRenderCard(vid); return;
    }
    // haaks maken t.o.v. vorige punt
    if(Math.abs(nx - last[0]) >= Math.abs(ny - last[1])) ny = last[1]; else nx = last[0];
    if(nx === last[0] && ny === last[1]) return;     // geen nul-muur
    p.push([nx, ny]);
  }
  saveDraft(); imRenderCard(vid);   // volledige kaart -> undo/wissen-knoppen verschijnen
}

function imBindSketch(svg){
  if(!svg || svg._b) return; svg._b = true;
  svg.addEventListener('click', e => { const [x, y] = imSvgPoint(svg, e); imTap(svg.dataset.vid, x, y); });
}
function imBind(){
  const add = $('#vd-add'); if(add) add.onclick = () => { const d = imData(), nr = d.verdiepingen.length; d.verdiepingen.push({ id: imId(), naam: nr === 0 ? 'Begane grond' : nr + 'e verdieping', sketch: { punten: [], gesloten: false }, muren: [], hoogte: '', openingen: [] }); saveDraft(); imRender(); };
  $$('#inmeten .plan-draw').forEach(imBindSketch);
  $$('#inmeten .sk-undo').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.sketch.punten.pop(); saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .sk-clear').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.sketch = { punten: [], gesloten: false }; v.muren = []; saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .vd-del').forEach(b => b.onclick = () => { if(confirm('Verdieping verwijderen?')){ const d = imData(); d.verdiepingen = d.verdiepingen.filter(v => v.id !== b.dataset.vid); saveDraft(); imRender(); } });
  $$('#inmeten .op-add').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.openingen.push({ id: imId(), type: 'raam', m2: '', beglazing: '', notitie: '' }); saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .op-del').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.openingen = v.openingen.filter(o => o.id !== b.dataset.oid); saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .vd-f').forEach(i => i.oninput = () => { const v = imVerd(i.dataset.vid); if(v){ v[i.dataset.k] = i.value; saveDraft(); } });
  $$('#inmeten .wall-len').forEach(i => i.oninput = () => { const v = imVerd(i.dataset.vid); if(v){ v.muren[+i.dataset.i] = i.value; saveDraft(); imRefreshSketch(i.dataset.vid); } });
  $$('#inmeten .op-f').forEach(el => { const ev = el.tagName === 'SELECT' ? 'onchange' : 'oninput'; el[ev] = () => { const o = imOpen(el.dataset.vid, el.dataset.oid); if(o){ o[el.dataset.k] = el.value; saveDraft(); } }; });
}

window.imRender = imRender;
window.addEventListener('DOMContentLoaded', imRender);
