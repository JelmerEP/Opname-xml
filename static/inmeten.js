'use strict';
// ---------- Inmeet-module (werkkopie) ----------
// Per verdieping: een orthogonale SCHETS (tik om hoeken te zetten, muren blijven haaks),
// per muur een lengte -> automatisch vloeroppervlak. Plus ramen/deuren (m2 + type).
// Foto's + foto naar muur slepen volgen in de volgende slice.
// Gebruikt globals uit app.js: $, $$, state, saveDraft.

const BEGLAZING = ['Enkel glas', 'Dubbel glas', 'HR', 'HR+', 'HR++', 'HR+++ / triple', 'Onbekend'];
const GRID = 12;            // snap-raster (px) in de schets
const SV_W = 360, SV_H = 420, SV_PAD = 32;

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

// --- polygoon-helpers voor zone-opdeling ---
function imPolyArea(poly){
  let a = 0; const n = poly.length;
  for(let i = 0; i < n; i++){ const p1 = poly[i], p2 = poly[(i + 1) % n]; a += p1[0] * p2[1] - p2[0] * p1[1]; }
  return Math.abs(a) / 2;
}
function imPolyMid(poly){                         // gemiddelde van de hoekpunten (label-positie)
  const n = poly.length || 1; let x = 0, y = 0;
  poly.forEach(c => { x += c[0]; y += c[1]; });
  return [x / n, y / n];
}
function imClipHalf(poly, ax, val, keepLess){     // Sutherland-Hodgman: hou het halfvlak ax<=val (of ax>=val)
  const res = [], n = poly.length, k = ax === 'x' ? 0 : 1;
  for(let i = 0; i < n; i++){
    const cur = poly[i], nxt = poly[(i + 1) % n];
    const ci = keepLess ? cur[k] <= val : cur[k] >= val, ni = keepLess ? nxt[k] <= val : nxt[k] >= val;
    if(ci) res.push(cur);
    if(ci !== ni){ const t = (val - cur[k]) / (nxt[k] - cur[k]); res.push([cur[0] + t * (nxt[0] - cur[0]), cur[1] + t * (nxt[1] - cur[1])]); }
  }
  return res;
}
// zone-opdeling: 1 rechte scheidingslijn (verticaal of horizontaal) -> 2 zones met echt oppervlak (m²)
function imZones(v){
  if(!v.split || !v.sketch.gesloten) return null;
  const rc = imReal(v); if(!rc) return null;       // alleen met volledige muurmaten
  const real = rc.slice(0, rc.length - 1);
  const ax = v.split.axis === 'h' ? 'y' : 'x', k = ax === 'x' ? 0 : 1;
  const co = real.map(c => c[k]), lo = Math.min(...co), hi = Math.max(...co);
  const pos = v.split.pos == null ? 0.5 : v.split.pos, cut = lo + pos * (hi - lo);
  const a = imClipHalf(real, ax, cut, true), b = imClipHalf(real, ax, cut, false);
  return { ax, k, cut, lo, hi, areaA: imPolyArea(a), areaB: imPolyArea(b), names: v.split.names || ['Zone 1', 'Zone 2'] };
}
function imZonePct(v){ return Math.round(((v.split && v.split.pos != null) ? v.split.pos : 0.5) * 100); }
function imSnapPos(v, z, pos){                     // snap de scheiding op een binnenhoek (bv. de knik van een L-vorm)
  const rc = imReal(v); if(!rc) return pos;
  const real = rc.slice(0, rc.length - 1), span = (z.hi - z.lo) || 1;
  let best = pos, bestD = 0.06;
  real.forEach(c => { const f = (c[z.k] - z.lo) / span; if(f > 0.02 && f < 0.98){ const d = Math.abs(f - pos); if(d < bestD){ bestD = d; best = f; } } });
  return best;
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
  // gesloten: vorm op schaal (op echte maten als die er zijn, anders de getekende schets).
  // Elke muur is een aantikbare lijn; geselecteerde muur licht op; lege muur krijgt een '?'-markering.
  const rc = imReal(v);
  const n = v.sketch.punten.length;
  const base = rc ? rc.slice(0, n) : v.sketch.punten;
  const xs = base.map(c => c[0]), ys = base.map(c => c[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const w = (maxx - minx) || 1, h = (maxy - miny) || 1;
  const sc = Math.min((SV_W - 2 * SV_PAD) / w, (SV_H - 2 * SV_PAD) / h);
  const ox = (SV_W - w * sc) / 2 - minx * sc, oy = (SV_H - h * sc) / 2 - miny * sc;
  const M = base.map(c => [+(c[0] * sc + ox).toFixed(1), +(c[1] * sc + oy).toFixed(1)]);
  const sel = v.selWall;
  const cx = M.reduce((s, c) => s + c[0], 0) / M.length, cy = M.reduce((s, c) => s + c[1], 0) / M.length;
  const z = imZones(v);
  if(z){
    const axX = z.ax === 'x', cutM = z.cut * sc + (axX ? ox : oy);
    const pa = imClipHalf(M, z.ax, cutM, true), pb = imClipHalf(M, z.ax, cutM, false);
    const bx = M.map(c => c[0]), by = M.map(c => c[1]);
    inner += `<polygon points="${pa.map(c => c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ')}" class="zone-a"/>`;
    inner += `<polygon points="${pb.map(c => c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ')}" class="zone-b"/>`;
    if(axX) inner += `<line x1="${cutM.toFixed(1)}" y1="${Math.min(...by)}" x2="${cutM.toFixed(1)}" y2="${Math.max(...by)}" class="zone-cut"/>`;
    else inner += `<line x1="${Math.min(...bx)}" y1="${cutM.toFixed(1)}" x2="${Math.max(...bx)}" y2="${cutM.toFixed(1)}" class="zone-cut"/>`;
    const ma = imPolyMid(pa), mb = imPolyMid(pb);
    inner += `<text x="${ma[0].toFixed(1)}" y="${(ma[1] - 3).toFixed(1)}" text-anchor="middle" class="zone-lbl">${imEsc(z.names[0])}</text><text x="${ma[0].toFixed(1)}" y="${(ma[1] + 12).toFixed(1)}" text-anchor="middle" class="zone-lbl-area">${z.areaA.toFixed(2)} m&#178;</text>`;
    inner += `<text x="${mb[0].toFixed(1)}" y="${(mb[1] - 3).toFixed(1)}" text-anchor="middle" class="zone-lbl">${imEsc(z.names[1])}</text><text x="${mb[0].toFixed(1)}" y="${(mb[1] + 12).toFixed(1)}" text-anchor="middle" class="zone-lbl-area">${z.areaB.toFixed(2)} m&#178;</text>`;
  } else {
    inner += `<polygon points="${M.map(c => c[0] + ',' + c[1]).join(' ')}" class="plan-rect"/>`;
    if(rc) inner += `<text x="${SV_W / 2}" y="${SV_H / 2 + 5}" text-anchor="middle" class="plan-area">${imArea(v).toFixed(2)} m&#178;</text>`;
    else inner += `<text x="${SV_W / 2}" y="${SV_H / 2 + 5}" text-anchor="middle" class="plan-hint">tik een muur &amp; vul de lengte in</text>`;
  }
  for(let i = 0; i < n; i++){
    const a = M[i], b = M[(i + 1) % n], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, isSel = sel === i;
    const vert = Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1]);
    inner += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="plan-wall${isSel ? ' plan-wall-sel' : ''}"/>`;
    const len = ((v.muren && v.muren[i]) || '').trim();
    if(len){
      let tx = mx, ty = my, anchor = 'middle', bl = '';
      if(vert){ const right = mx >= cx; tx = mx + (right ? 9 : -9); anchor = right ? 'start' : 'end'; bl = ' dominant-baseline="middle"'; }
      else { ty = my + (my >= cy ? 15 : -7); }
      inner += `<text x="${tx}" y="${ty}" text-anchor="${anchor}"${bl} class="plan-dim${isSel ? ' plan-dim-sel' : ''}">${imEsc(len)}</text>`;
    } else inner += `<circle cx="${mx}" cy="${my}" r="10" class="plan-wmark${isSel ? ' plan-wmark-sel' : ''}"/><text x="${mx}" y="${my + 4}" text-anchor="middle" class="plan-wmark-tx">?</text>`;
  }
  for(let i = 0; i < n; i++){ const a = M[i], b = M[(i + 1) % n]; inner += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="plan-wall-hit" data-vid="${v.id}" data-i="${i}"/>`; }
  if(rc && !imSluit(v)) inner += `<text x="${SV_W / 2}" y="${SV_H - 8}" text-anchor="middle" class="plan-warn">sluit niet helemaal — controleer maten</text>`;
  return `<svg class="plan" data-vid="${v.id}" viewBox="0 0 ${SV_W} ${SV_H}">${inner}</svg>`;
}

function imWallEditHtml(v){
  if(!v.sketch.gesloten) return '';
  const p = v.sketch.punten, sel = v.selWall;
  if(sel == null || sel < 0 || sel >= p.length){
    const allFilled = v.muren && v.muren.length === p.length && v.muren.every(m => (m || '').trim());
    return `<p class="wall-hint">${allFilled ? 'Alle muren ingevuld — tik een muur om te wijzigen.' : 'Tik op een muur in de schets en vul de lengte in.'}</p>`;
  }
  const a = p[sel], b = p[(sel + 1) % p.length];
  const horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  return `<div class="wall-edit"><label>Muur ${sel + 1} ${horiz ? '↔ breedte' : '↕ hoogte'} (m)<input class="wall-len" inputmode="decimal" data-vid="${v.id}" data-i="${sel}" value="${imEsc((v.muren && v.muren[sel]) || '')}" placeholder="lengte in meter"></label></div>`;
}

function imZoneControlsHtml(v){
  if(!v.sketch.gesloten) return '';
  if(!v.split) return `<button type="button" class="zone-add" data-vid="${v.id}">✂ Splits in 2 zones</button>`;
  const z = imZones(v), horiz = v.split.axis === 'h', nm = v.split.names || ['Zone 1', 'Zone 2'];
  return `<div class="zone-box">
    <div class="zone-or">
      <button type="button" class="zone-axis${!horiz ? ' on' : ''}" data-vid="${v.id}" data-ax="v">↕ verticale lijn</button>
      <button type="button" class="zone-axis${horiz ? ' on' : ''}" data-vid="${v.id}" data-ax="h">↔ horizontale lijn</button>
    </div>
    <label class="zone-pos">Schuif de scheiding<input type="range" class="zone-slider" min="2" max="98" value="${imZonePct(v)}" data-vid="${v.id}"></label>
    <div class="zone-names">
      <label>Naam zone 1 <span class="zone-area" data-z="0">${z ? '· ' + z.areaA.toFixed(2) + ' m²' : ''}</span><input class="zone-name" data-vid="${v.id}" data-z="0" value="${imEsc(nm[0])}"></label>
      <label>Naam zone 2 <span class="zone-area" data-z="1">${z ? '· ' + z.areaB.toFixed(2) + ' m²' : ''}</span><input class="zone-name" data-vid="${v.id}" data-z="1" value="${imEsc(nm[1])}"></label>
    </div>
    ${z ? '' : '<p class="wall-hint">Vul eerst alle muurmaten in; dan berekent hij de oppervlaktes per zone.</p>'}
    <button type="button" class="zone-del" data-vid="${v.id}">Scheiding verwijderen</button>
  </div>`;
}
function imUpdateZoneAreas(vid){
  const v = imVerd(vid), z = imZones(v); if(!z) return;
  const card = $(`#inmeten .vd[data-vid="${vid}"]`); if(!card) return;
  const sa = card.querySelector('.zone-area[data-z="0"]'), sb = card.querySelector('.zone-area[data-z="1"]');
  if(sa) sa.textContent = '· ' + z.areaA.toFixed(2) + ' m²';
  if(sb) sb.textContent = '· ' + z.areaB.toFixed(2) + ' m²';
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
    ${imWallEditHtml(v)}
    ${imZoneControlsHtml(v)}
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
  imUpdateZoneAreas(vid);
  imBindPlan(card);
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
      v.sketch.gesloten = true; v.muren = p.map(() => ''); v.selWall = 0; saveDraft(); imRenderCard(vid);
      const inp = $(`#inmeten .vd[data-vid="${vid}"] .wall-len`); if(inp) inp.focus();
      return;
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
function imBindPlan(root){   // bindt teken-taps (open) + muur-taps (gesloten) binnen root
  $$('.plan-draw', root).forEach(imBindSketch);
  $$('.plan-wall-hit', root).forEach(h => { if(h._b) return; h._b = true; h.addEventListener('click', () => imSelWall(h.dataset.vid, +h.dataset.i)); });
}
function imSelWall(vid, i){
  const v = imVerd(vid); if(!v) return;
  v.selWall = i; saveDraft(); imRenderCard(vid);
  const inp = $(`#inmeten .vd[data-vid="${vid}"] .wall-len`); if(inp){ inp.focus(); if(inp.select) inp.select(); }
}
function imBind(){
  const add = $('#vd-add'); if(add) add.onclick = () => { const d = imData(), nr = d.verdiepingen.length; d.verdiepingen.push({ id: imId(), naam: nr === 0 ? 'Begane grond' : nr + 'e verdieping', sketch: { punten: [], gesloten: false }, muren: [], hoogte: '', openingen: [] }); saveDraft(); imRender(); };
  imBindPlan(document);
  $$('#inmeten .sk-undo').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.sketch.punten.pop(); saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .sk-clear').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.sketch = { punten: [], gesloten: false }; v.muren = []; v.selWall = null; saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .vd-del').forEach(b => b.onclick = () => { if(confirm('Verdieping verwijderen?')){ const d = imData(); d.verdiepingen = d.verdiepingen.filter(v => v.id !== b.dataset.vid); saveDraft(); imRender(); } });
  $$('#inmeten .op-add').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.openingen.push({ id: imId(), type: 'raam', m2: '', beglazing: '', notitie: '' }); saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .op-del').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.openingen = v.openingen.filter(o => o.id !== b.dataset.oid); saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .vd-f').forEach(i => i.oninput = () => { const v = imVerd(i.dataset.vid); if(v){ v[i.dataset.k] = i.value; saveDraft(); } });
  $$('#inmeten .wall-len').forEach(i => i.oninput = () => { const v = imVerd(i.dataset.vid); if(v){ v.muren[+i.dataset.i] = i.value; saveDraft(); imRefreshSketch(i.dataset.vid); } });
  $$('#inmeten .zone-add').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.split = { axis: 'v', pos: 0.5, names: ['Zone 1', 'Zone 2'] }; saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .zone-axis').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v && v.split){ v.split.axis = b.dataset.ax; v.split.pos = 0.5; saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .zone-del').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.split = null; saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .zone-slider').forEach(s => s.oninput = () => { const v = imVerd(s.dataset.vid); if(!v || !v.split) return; const z = imZones(v); let pos = +s.value / 100; if(z) pos = imSnapPos(v, z, pos); v.split.pos = pos; saveDraft(); imRefreshSketch(s.dataset.vid); });
  $$('#inmeten .zone-name').forEach(i => i.oninput = () => { const v = imVerd(i.dataset.vid); if(v && v.split){ if(!v.split.names) v.split.names = ['Zone 1', 'Zone 2']; v.split.names[+i.dataset.z] = i.value; saveDraft(); imRefreshSketch(i.dataset.vid); } });
  $$('#inmeten .op-f').forEach(el => { const ev = el.tagName === 'SELECT' ? 'onchange' : 'oninput'; el[ev] = () => { const o = imOpen(el.dataset.vid, el.dataset.oid); if(o){ o[el.dataset.k] = el.value; saveDraft(); } }; });
}

window.imRender = imRender;
window.addEventListener('DOMContentLoaded', imRender);
