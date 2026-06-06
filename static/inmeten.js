'use strict';
// ---------- Inmeet-module (werkkopie) ----------
// Per verdieping: een orthogonale SCHETS (tik om hoeken te zetten, muren blijven haaks),
// per muur een lengte -> automatisch vloeroppervlak. Plus ramen/deuren (m2 + type).
// Foto's + foto naar muur slepen volgen in de volgende slice.
// Gebruikt globals uit app.js: $, $$, state, saveDraft.

const BEGLAZING = ['Enkel glas', 'Dubbel glas', 'HR', 'HR+', 'HR++', 'HR+++ / triple', 'Onbekend'];
const ORIENT8 = ['Noord', 'Noordoost', 'Oost', 'Zuidoost', 'Zuid', 'Zuidwest', 'West', 'Noordwest'];
// gevels + hun draaiing t.o.v. de voorgevel (stappen van 45°, met de klok mee). voor=0, links=+90, achter=+180, rechts=+270
const GEVELS = [['voor', 'Voorgevel', 0], ['achter', 'Achtergevel', 4], ['links', 'Linkergevel', 2], ['rechts', 'Rechtergevel', 6]];
function imGevelNaam(key){ const g = GEVELS.find(x => x[0] === key); return g ? g[1] : ''; }
function imGevelOrient(key){ const vi = ORIENT8.indexOf(imData().voorgevel), g = GEVELS.find(x => x[0] === key); return (vi < 0 || !g) ? '' : ORIENT8[(vi + g[2]) % 8]; }
const GRID = 12;            // snap-raster (px) in de schets
const SV_W = 360, SV_H = 420, SV_PAD = 32;

function imData(){ if(!state.inmeten) state.inmeten = { verdiepingen: [] }; return state.inmeten; }
function imId(){ return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function imNum(s){ return parseFloat(String(s == null ? '' : s).replace(',', '.')) || 0; }
function imEsc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function imVerd(vid){ return imData().verdiepingen.find(v => v.id === vid); }
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

// --- polygoon-helpers voor zone-opdeling (scheiding tekenen) ---
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
// schaal/verschuiving om de (echte) vorm passend in het tekenvlak te leggen — 1 uniforme affiene transform
function imFit(v){
  const rc = imReal(v), n = v.sketch.punten.length;
  const base = rc ? rc.slice(0, n) : v.sketch.punten;
  if(!base.length) return null;
  const xs = base.map(c => c[0]), ys = base.map(c => c[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const w = (maxx - minx) || 1, h = (maxy - miny) || 1;
  const sc = Math.min((SV_W - 2 * SV_PAD) / w, (SV_H - 2 * SV_PAD) / h);
  const ox = (SV_W - w * sc) / 2 - minx * sc, oy = (SV_H - h * sc) / 2 - miny * sc;
  const M = base.map(c => [+(c[0] * sc + ox).toFixed(1), +(c[1] * sc + oy).toFixed(1)]);
  return { rc, real: base, n, minx, maxx, miny, maxy, w, h, sc, ox, oy, M };
}
function imNearestEdge(real, pt){                 // dichtstbijzijnde muur + projectie van pt erop
  let best = null; const N = real.length;
  for(let i = 0; i < N; i++){
    const a = real[i], b = real[(i + 1) % N], abx = b[0] - a[0], aby = b[1] - a[1], L2 = abx * abx + aby * aby || 1;
    let t = ((pt[0] - a[0]) * abx + (pt[1] - a[1]) * aby) / L2; t = Math.max(0, Math.min(1, t));
    const px = a[0] + t * abx, py = a[1] + t * aby, d = Math.hypot(pt[0] - px, pt[1] - py);
    if(!best || d < best.d) best = { d, i, t, p: [px, py] };
  }
  return best;
}
function imSnapOnEdge(real, e){                    // startpunt netjes op de muur (hoek/midden/kwart of 0,1 m)
  const a = real[e.i], b = real[(e.i + 1) % real.length], fr = [0, .25, .5, .75, 1];
  let t = e.t, snapped = false;
  for(const ff of fr){ if(Math.abs(t - ff) < 0.08){ t = ff; snapped = true; break; } }
  if(!snapped){ const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; t = Math.round(t * len / 0.1) * 0.1 / len; }
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}
function imSnapEnd(real, e, r){                    // eindpunt loodrecht op de muur projecteren (uitgelijnde as behouden)
  const a = real[e.i], b = real[(e.i + 1) % real.length];
  if(Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1])){ const y = Math.max(Math.min(a[1], b[1]), Math.min(Math.max(a[1], b[1]), r[1])); return [a[0], y]; }
  const x = Math.max(Math.min(a[0], b[0]), Math.min(Math.max(a[0], b[0]), r[0])); return [x, a[1]];
}
// effectieve scheiding: getekende richtingen + (ingevoerde of gemeten) lengtes; startpunt
// wordt opgelost zodat het eindpunt op zijn muur blijft -> exacte maatvoering mogelijk
function imDividerGeom(v){
  const f = imFit(v); if(!f || !f.rc) return null;
  const real = f.real, div = v.zone && v.zone.div; if(!div || div.length < 2) return null;
  const es = imNearestEdge(real, div[0]), ee = imNearestEdge(real, div[div.length - 1]);
  if(!es || !ee || es.i === ee.i) return null;
  const dirs = [], meas = [];
  for(let i = 0; i < div.length - 1; i++){
    const dx = div[i + 1][0] - div[i][0], dy = div[i + 1][1] - div[i][1];
    dirs.push(Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1]);
    meas.push(Math.hypot(dx, dy));
  }
  const lens = dirs.map((d, i) => { const num = imNum(v.zone.lens && v.zone.lens[i]); return num > 0 ? num : meas[i]; });
  let Dx = 0, Dy = 0; dirs.forEach((d, i) => { Dx += d[0] * lens[i]; Dy += d[1] * lens[i]; });
  const aS = real[es.i], bS = real[(es.i + 1) % real.length], sHoriz = Math.abs(bS[0] - aS[0]) >= Math.abs(bS[1] - aS[1]);
  const aE = real[ee.i], bE = real[(ee.i + 1) % real.length], eVert = Math.abs(bE[0] - aE[0]) < Math.abs(bE[1] - aE[1]);
  const cS = sHoriz ? aS[1] : aS[0], cE = eVert ? aE[0] : aE[1], sd = div[0];
  let S;
  if(sHoriz) S = eVert ? [cE - Dx, cS] : [sd[0], cS];          // start op muur_S; los vrije as op
  else       S = !eVert ? [cS, cE - Dy] : [cS, sd[1]];
  const pts = [S]; let cur = S;
  for(let i = 0; i < dirs.length; i++){ cur = [cur[0] + dirs[i][0] * lens[i], cur[1] + dirs[i][1] * lens[i]]; pts.push(cur); }
  const within = (p, a, b) => p[0] >= Math.min(a[0], b[0]) - 0.02 && p[0] <= Math.max(a[0], b[0]) + 0.02 && p[1] >= Math.min(a[1], b[1]) - 0.02 && p[1] <= Math.max(a[1], b[1]) + 0.02;
  const valid = within(pts[0], aS, bS) && within(pts[pts.length - 1], aE, bE);
  return { pts, es, ee, dirs, lens, meas, valid };
}
// splits de vorm langs de scheiding in 2 gebieden (echte m²)
function imRegionPolys(v){
  const g = imDividerGeom(v); if(!g) return null;
  const real = imFit(v).real, N = real.length, div = g.pts;
  const fwd = (from, to) => { const res = []; let i = (from + 1) % N, gg = 0; while(gg++ <= N){ res.push(real[i]); if(i === to) break; i = (i + 1) % N; } return res; };
  const S = div[0], E = div[div.length - 1], interior = div.slice(1, -1);
  const a = [S].concat(fwd(g.es.i, g.ee.i), [E], interior.slice().reverse());
  const b = [E].concat(fwd(g.ee.i, g.es.i), [S], interior);
  return { a, b, pts: div, lens: g.lens, dirs: g.dirs, valid: g.valid, areaA: imPolyArea(a), areaB: imPolyArea(b), total: imPolyArea(real), names: v.zone.names || ['Zone 1', 'Zone 2'] };
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
  const f = imFit(v), M = f.M, n = f.n, sc = f.sc, ox = f.ox, oy = f.oy, rc = f.rc;
  const sel = v.selWall;
  const cx = M.reduce((s, c) => s + c[0], 0) / M.length, cy = M.reduce((s, c) => s + c[1], 0) / M.length;
  const toS = r => [r[0] * sc + ox, r[1] * sc + oy];
  const reg = v.zoneDraw ? null : imRegionPolys(v);
  if(reg){
    const pa = reg.a.map(toS), pb = reg.b.map(toS), dp = reg.pts.map(toS), sseg = v.zone.sel;
    inner += `<polygon points="${pa.map(c => c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ')}" class="zone-a"/>`;
    inner += `<polygon points="${pb.map(c => c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ')}" class="zone-b"/>`;
    const ma = imPolyMid(pa), mb = imPolyMid(pb);
    inner += `<text x="${ma[0].toFixed(1)}" y="${(ma[1] - 3).toFixed(1)}" text-anchor="middle" class="zone-lbl">${imEsc(reg.names[0])}</text><text x="${ma[0].toFixed(1)}" y="${(ma[1] + 12).toFixed(1)}" text-anchor="middle" class="zone-lbl-area">${reg.areaA.toFixed(2)} m&#178;</text>`;
    inner += `<text x="${mb[0].toFixed(1)}" y="${(mb[1] - 3).toFixed(1)}" text-anchor="middle" class="zone-lbl">${imEsc(reg.names[1])}</text><text x="${mb[0].toFixed(1)}" y="${(mb[1] + 12).toFixed(1)}" text-anchor="middle" class="zone-lbl-area">${reg.areaB.toFixed(2)} m&#178;</text>`;
    for(let i = 0; i < dp.length - 1; i++){
      const A = dp[i], B = dp[i + 1], mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, isS = sseg === i;
      const dvert = Math.abs(B[0] - A[0]) < Math.abs(B[1] - A[1]);
      inner += `<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" class="zone-cut${isS ? ' zone-cut-sel' : ''}"/>`;
      if(dvert) inner += `<text x="${(mx + 8).toFixed(1)}" y="${my.toFixed(1)}" text-anchor="start" dominant-baseline="middle" class="zone-dim${isS ? ' zone-dim-sel' : ''}">${reg.lens[i].toFixed(2)}</text>`;
      else inner += `<text x="${mx.toFixed(1)}" y="${(my - 5).toFixed(1)}" text-anchor="middle" class="zone-dim${isS ? ' zone-dim-sel' : ''}">${reg.lens[i].toFixed(2)}</text>`;
    }
    if(!reg.valid) inner += `<text x="${SV_W / 2}" y="${SV_H - 8}" text-anchor="middle" class="plan-warn">scheiding valt buiten de muur — controleer maten</text>`;
    for(let i = 0; i < dp.length - 1; i++){ const A = dp[i], B = dp[i + 1]; inner += `<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" class="plan-zwall-hit" data-vid="${v.id}" data-i="${i}"/>`; }
  } else {
    inner += `<polygon points="${M.map(c => c[0] + ',' + c[1]).join(' ')}" class="plan-rect"/>`;
    if(rc) inner += `<text x="${SV_W / 2}" y="${SV_H / 2 + 5}" text-anchor="middle" class="plan-area">${imArea(v).toFixed(2)} m&#178;</text>`;
    else inner += `<text x="${SV_W / 2}" y="${SV_H / 2 + 5}" text-anchor="middle" class="plan-hint">tik een muur &amp; vul de lengte in</text>`;
    if(v.zoneDraw && rc && v.zone && v.zone.div.length){
      const dl = v.zone.div.map(toS);
      if(dl.length > 1) inner += `<polyline points="${dl.map(c => c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ')}" class="zone-line"/>`;
      dl.forEach(c => { inner += `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="4" class="zone-pt"/>`; });
    }
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
  if(!v.zoneDraw) for(let i = 0; i < n; i++){ const a = M[i], b = M[(i + 1) % n]; inner += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="plan-wall-hit" data-vid="${v.id}" data-i="${i}"/>`; }
  if(rc && !imSluit(v)) inner += `<text x="${SV_W / 2}" y="${SV_H - 8}" text-anchor="middle" class="plan-warn">sluit niet helemaal — controleer maten</text>`;
  return `<svg class="plan${v.zoneDraw ? ' plan-zonedraw' : ''}" data-vid="${v.id}" viewBox="0 0 ${SV_W} ${SV_H}">${inner}</svg>`;
}

function imWallEditHtml(v){
  if(!v.sketch.gesloten) return '';
  const p = v.sketch.punten, sel = v.selWall;
  if(sel != null && sel >= 0 && sel < p.length) return `<p class="wall-hint">Muur ${sel + 1} geselecteerd — vul de maat bovenin in.</p>`;
  const allFilled = v.muren && v.muren.length === p.length && v.muren.every(m => (m || '').trim());
  return `<p class="wall-hint">${allFilled ? 'Alle muren ingevuld — tik een muur om te wijzigen.' : 'Tik op een muur in de schets; de maat vul je bovenin in.'}</p>`;
}

function imZoneControlsHtml(v){
  if(!v.sketch.gesloten) return '';
  if(!imReal(v)) return `<p class="wall-hint">Vul eerst alle muurmaten in; daarna kun je een zone-scheiding tekenen.</p>`;
  if(v.zoneDraw) return `<div class="zone-box">
    <p class="wall-hint">Tik op een muur om te starten, tik de hoeken (blijft haaks), en eindig op een muur.</p>
    <div class="sketch-act"><button type="button" class="zone-undo" data-vid="${v.id}">↶ Punt terug</button><button type="button" class="zone-cancel" data-vid="${v.id}">Annuleer</button></div>
  </div>`;
  const reg = imRegionPolys(v);
  if(!reg) return `<button type="button" class="zone-add" data-vid="${v.id}">✏️ Teken zone-scheiding</button>`;
  const nm = v.zone.names || ['Zone 1', 'Zone 2'], sseg = v.zone.sel, nseg = reg.pts.length - 1;
  const segHint = (sseg != null && sseg >= 0 && sseg < nseg)
    ? `<p class="wall-hint">Scheidingsmuur ${sseg + 1} geselecteerd — vul de maat bovenin in.</p>`
    : `<p class="wall-hint">Tik op een scheidingsmuur in de schets; de maat vul je bovenin in.</p>`;
  return `<div class="zone-box">
    <div class="zone-names">
      <label>Naam zone 1 <span class="zone-area" data-z="0">· ${reg.areaA.toFixed(2)} m²</span><input class="zone-name" data-vid="${v.id}" data-z="0" value="${imEsc(nm[0])}"></label>
      <label>Naam zone 2 <span class="zone-area" data-z="1">· ${reg.areaB.toFixed(2)} m²</span><input class="zone-name" data-vid="${v.id}" data-z="1" value="${imEsc(nm[1])}"></label>
    </div>
    ${segHint}
    <div class="sketch-act"><button type="button" class="zone-add" data-vid="${v.id}">✏️ Opnieuw tekenen</button><button type="button" class="zone-del" data-vid="${v.id}">Verwijderen</button></div>
  </div>`;
}
function imUpdateZoneAreas(vid){
  const v = imVerd(vid), reg = imRegionPolys(v); if(!reg) return;
  const card = $(`#inmeten .vd[data-vid="${vid}"]`); if(!card) return;
  const sa = card.querySelector('.zone-area[data-z="0"]'), sb = card.querySelector('.zone-area[data-z="1"]');
  if(sa) sa.textContent = '· ' + reg.areaA.toFixed(2) + ' m²';
  if(sb) sb.textContent = '· ' + reg.areaB.toFixed(2) + ' m²';
}

// --- foto-opslag: data-URL strings (iOS Safari heeft bugs met Blobs in IndexedDB),
//     IndexedDB als het kan, anders terugval op localStorage ---
let _imDB = null;
function imDB(){
  if(_imDB) return _imDB;
  _imDB = new Promise((res, rej) => {
    let r; try { r = indexedDB.open('vabi_inmeet', 1); } catch(e){ return rej(e); }
    r.onupgradeneeded = () => { try { if(!r.result.objectStoreNames.contains('photos')) r.result.createObjectStore('photos'); } catch(e){} };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('idb'));
    r.onblocked = () => rej(new Error('idb-blocked'));
  });
  return _imDB;
}
async function imPhotoPut(id, durl){
  try {
    const db = await imDB();
    await new Promise((res, rej) => { const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').put(durl, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    return;
  } catch(e){ /* val terug op localStorage */ }
  try { localStorage.setItem('vabi_ph_' + id, durl); }
  catch(e){ throw new Error('foto-opslag niet beschikbaar of vol'); }
}
async function imPhotoGet(id){
  try { const db = await imDB(); const v = await new Promise((res, rej) => { const rq = db.transaction('photos', 'readonly').objectStore('photos').get(id); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); if(v) return v; } catch(e){}
  try { return localStorage.getItem('vabi_ph_' + id) || null; } catch(e){ return null; }
}
async function imPhotoDel(id){
  if(!id) return;
  try { const db = await imDB(); await new Promise(res => { const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').delete(id); tx.oncomplete = res; tx.onerror = res; }); } catch(e){}
  try { localStorage.removeItem('vabi_ph_' + id); } catch(e){}
}
// verklein een camera-/galerijfoto naar max-zijde en lever een kleine JPEG data-URL
function imResizeToDataURL(file, max, cb){
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    let w = img.width, h = img.height;
    if(Math.max(w, h) > max){ const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    let durl = null; try { durl = cv.toDataURL('image/jpeg', 0.72); } catch(e){}
    cb(durl);
  };
  img.onerror = () => { URL.revokeObjectURL(url); cb(null); };
  img.src = url;
}
const _imUrl = {};                                // cache van data-URLs per foto-id (geen geflikker bij re-render)
function imLoadImages(root){
  $$('.foto-img[data-foto]', root || document).forEach(img => {
    if(img._fl) return; img._fl = true;
    const id = img.dataset.foto;
    if(_imUrl[id]){ img.src = _imUrl[id]; return; }
    imPhotoGet(id).then(u => { if(u){ _imUrl[id] = u; img.src = u; } });
  });
}
function imFoto(vid, fid){ const v = imVerd(vid); return v && v.fotos ? v.fotos.find(f => f.id === fid) : null; }
function imMark(vid, fid, mid){ const f = imFoto(vid, fid); return f ? (f.marks || []).find(m => m.id === mid) : null; }

// --- vaste invul-balk bovenin (boven het toetsenbord); veld verschijnt hier i.p.v. onder de tik ---
let _imActive = null;   // { vid, type:'wall'|'zone'|'mark', fid? } | null
function imBar(){ let b = document.getElementById('im-editbar'); if(!b){ b = document.createElement('div'); b.id = 'im-editbar'; b.className = 'im-editbar'; b.hidden = true; document.body.appendChild(b); } return b; }
function imRenderEditBar(){
  const bar = imBar(), a = _imActive;
  const hide = () => { _imActive = null; bar.hidden = true; bar.innerHTML = ''; };
  if(!a){ bar.hidden = true; bar.innerHTML = ''; return; }
  const v = imVerd(a.vid); if(!v) return hide();
  let inner = '';
  if(a.type === 'wall'){
    const p = v.sketch.punten, sel = v.selWall; if(sel == null || sel >= p.length) return hide();
    const A = p[sel], B = p[(sel + 1) % p.length], horiz = Math.abs(B[0] - A[0]) >= Math.abs(B[1] - A[1]);
    inner = `<span class="im-bar-lbl">Muur ${sel + 1} ${horiz ? '↔' : '↕'} (m)</span><input class="im-bar-in im-wall-len" inputmode="decimal" data-vid="${a.vid}" data-i="${sel}" value="${imEsc((v.muren && v.muren[sel]) || '')}" placeholder="meter">`;
  } else if(a.type === 'zone'){
    const reg = imRegionPolys(v), sseg = v.zone && v.zone.sel; if(!reg || sseg == null) return hide();
    inner = `<span class="im-bar-lbl">Scheidingsmuur ${sseg + 1} (m)</span><input class="im-bar-in im-zone-len" inputmode="decimal" data-vid="${a.vid}" data-i="${sseg}" value="${imEsc((v.zone.lens && v.zone.lens[sseg]) || reg.lens[sseg].toFixed(2))}" placeholder="meter">`;
  } else if(a.type === 'mark'){
    const ft = imFoto(a.vid, a.fid), m = ft && (ft.marks || []).find(x => x.id === ft.sel); if(!m) return hide();
    const nr = ft.marks.indexOf(m) + 1;
    inner = `<span class="im-bar-lbl">Raam/deur ${nr}</span>
      <select class="im-bar-sel im-mk" data-k="type" data-vid="${a.vid}" data-fid="${a.fid}" data-mid="${m.id}"><option value="raam"${m.type === 'raam' ? ' selected' : ''}>Raam</option><option value="deur"${m.type === 'deur' ? ' selected' : ''}>Deur</option></select>
      <input class="im-bar-in im-mk" data-k="m2" inputmode="decimal" data-vid="${a.vid}" data-fid="${a.fid}" data-mid="${m.id}" value="${imEsc(m.m2)}" placeholder="m²">
      <select class="im-bar-sel im-mk" data-k="beglazing" data-vid="${a.vid}" data-fid="${a.fid}" data-mid="${m.id}"><option value=""${!m.beglazing ? ' selected' : ''}>beglazing…</option>${BEGLAZING.map(b => `<option${m.beglazing === b ? ' selected' : ''}>${imEsc(b)}</option>`).join('')}</select>`;
  } else return hide();
  bar.innerHTML = `<div class="im-bar-row">${inner}<button type="button" class="im-bar-done">Klaar</button></div>`;
  bar.hidden = false; imBindBar();
}
function imFocusBar(){ const inp = imBar().querySelector('.im-bar-in'); if(inp){ inp.focus({ preventScroll: true }); if(inp.select) try { inp.select(); } catch(e){} } }
function imBindBar(){
  const bar = imBar();
  bar.querySelectorAll('.im-wall-len').forEach(i => i.oninput = () => { const v = imVerd(i.dataset.vid); if(v){ v.muren[+i.dataset.i] = i.value; saveDraft(); imRefreshSketch(i.dataset.vid); } });
  bar.querySelectorAll('.im-zone-len').forEach(i => i.oninput = () => { const v = imVerd(i.dataset.vid); if(v && v.zone){ if(!v.zone.lens) v.zone.lens = []; v.zone.lens[+i.dataset.i] = i.value; saveDraft(); imRefreshSketch(i.dataset.vid); } });
  bar.querySelectorAll('.im-mk').forEach(el => { const ev = el.tagName === 'SELECT' ? 'onchange' : 'oninput'; el[ev] = () => { const m = imMark(el.dataset.vid, el.dataset.fid, el.dataset.mid); if(m){ m[el.dataset.k] = el.value; saveDraft(); } }; });
  const done = bar.querySelector('.im-bar-done'); if(done) done.onclick = imCloseBar;
}
function imCloseBar(){
  const a = _imActive; _imActive = null;
  if(a){ const v = imVerd(a.vid); if(v){ if(a.type === 'wall') v.selWall = null; else if(a.type === 'zone'){ if(v.zone) v.zone.sel = null; } else if(a.type === 'mark'){ const f = imFoto(a.vid, a.fid); if(f) f.sel = null; } } saveDraft(); if(a) imRenderCard(a.vid); }
  imRenderEditBar();
}
function imSelect(active){   // 1 selectie tegelijk; imRenderCard rendert de balk -> focus die
  const v = imVerd(active.vid); if(!v) return;
  if(_imActive && _imActive.vid !== active.vid){    // selectie op een andere kaart opruimen
    const pv = imVerd(_imActive.vid);
    if(pv){ pv.selWall = null; if(pv.zone) pv.zone.sel = null; (pv.fotos || []).forEach(f => f.sel = null);
      const pc = $(`#inmeten .vd[data-vid="${_imActive.vid}"]`); if(pc) pc.outerHTML = imCardHtml(pv); }
  }
  v.selWall = null; if(v.zone) v.zone.sel = null; (v.fotos || []).forEach(f => f.sel = null);
  if(active.type === 'wall') v.selWall = active.i;
  else if(active.type === 'zone'){ if(v.zone) v.zone.sel = active.i; }
  else if(active.type === 'mark'){ const f = imFoto(active.vid, active.fid); if(f) f.sel = active.mid; }
  _imActive = active; saveDraft(); imRenderCard(active.vid); imFocusBar();
}

function imFotoHtml(vid, ft){
  const marks = ft.marks || [];
  const pins = marks.map((m, i) => `<button type="button" class="foto-pin${ft.sel === m.id ? ' sel' : ''}" style="left:${(m.x * 100).toFixed(1)}%;top:${(m.y * 100).toFixed(1)}%" data-vid="${vid}" data-fid="${ft.id}" data-mid="${m.id}">${i + 1}</button>`).join('');
  return `<div class="foto" data-vid="${vid}" data-fid="${ft.id}">
    <div class="foto-wrap" data-vid="${vid}" data-fid="${ft.id}">
      <img class="foto-img" data-foto="${imEsc(ft.foto)}" alt="foto ramen/deuren">
      ${pins}
    </div>
    <p class="foto-hint">${marks.length ? 'Tik een raam/deur aan in de foto, of een bestaand bolletje — de gegevens vul je bovenin in.' : 'Tik op elk raam/deur in de foto; de gegevens vul je bovenin in.'}${ft.sel ? ' <button type="button" class="mark-del" data-vid="' + vid + '" data-fid="' + ft.id + '" data-mid="' + ft.sel + '">verwijder bolletje</button>' : ''}</p>
    <div class="foto-foot">
      <label class="foto-gevel">Gevel<select class="foto-gevel-sel" data-vid="${vid}" data-fid="${ft.id}"><option value="">— kies —</option>${GEVELS.map(g => { const o = imGevelOrient(g[0]); return `<option value="${g[0]}"${ft.gevel === g[0] ? ' selected' : ''}>${g[1]}${o ? ' (' + o + ')' : ''}</option>`; }).join('')}</select></label>
      <button type="button" class="foto-del" data-vid="${vid}" data-fid="${ft.id}">Foto verwijderen</button>
    </div>
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
    <h4>Ramen &amp; deuren — foto's</h4>
    <div class="fotos">${(v.fotos || []).map(ft => imFotoHtml(v.id, ft)).join('')}</div>
    <input type="file" accept="image/*" capture="environment" class="foto-cam" data-vid="${v.id}" hidden>
    <button type="button" class="foto-add" data-vid="${v.id}">📷 Foto toevoegen</button>
  </div>`;
}

function imRender(){
  const host = $('#inmeten'); if(!host) return;
  const vg = imData().voorgevel;
  const vgBlock = `<div class="im-voorgevel">
    <label>Oriëntatie voorgevel<select id="im-voorgevel"><option value="">— kies —</option>${ORIENT8.map(o => `<option${vg === o ? ' selected' : ''}>${o}</option>`).join('')}</select></label>
    ${vg ? `<p class="im-vg-hint">Voor: ${imGevelOrient('voor')} · Links: ${imGevelOrient('links')} · Achter: ${imGevelOrient('achter')} · Rechts: ${imGevelOrient('rechts')}</p>` : ''}
  </div>`;
  const pdfBtn = imData().verdiepingen.length ? `<button type="button" id="im-pdf" class="im-pdf-btn">📄 PDF-uitdraai (download)</button>` : '';
  host.innerHTML = vgBlock + imData().verdiepingen.map(imCardHtml).join('') + `<button type="button" id="vd-add" class="vd-add-btn">+ Verdieping toevoegen</button>` + pdfBtn;
  imBind(); imRenderEditBar();
}
function imRenderCard(vid){
  const card = $(`#inmeten .vd[data-vid="${vid}"]`); const v = imVerd(vid); if(!card || !v) return;
  card.outerHTML = imCardHtml(v); imBind(); imRenderEditBar();
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
      v.sketch.gesloten = true; v.muren = p.map(() => ''); imSelect({ vid, type: 'wall', i: 0 });
      return;
    }
    // haaks maken t.o.v. vorige punt
    if(Math.abs(nx - last[0]) >= Math.abs(ny - last[1])) ny = last[1]; else nx = last[0];
    if(nx === last[0] && ny === last[1]) return;     // geen nul-muur
    p.push([nx, ny]);
  }
  saveDraft(); imRenderCard(vid);   // volledige kaart -> undo/wissen-knoppen verschijnen
}
// zone-scheiding tekenen: tik op een muur (start), tik hoeken (haaks), eindig op een muur
function imZoneTap(vid, sx, sy){
  const v = imVerd(vid); if(!v || !v.zoneDraw) return;
  const f = imFit(v); if(!f || !f.rc) return;
  const real = f.real;
  let r = [(sx - f.ox) / f.sc, (sy - f.oy) / f.sc];   // svg -> echte coords (inverse affien)
  if(!v.zone) v.zone = { div: [], names: ['Zone 1', 'Zone 2'] };
  const div = v.zone.div;
  if(div.length === 0){                                // startpunt op een muur
    div.push(imSnapOnEdge(real, imNearestEdge(real, r))); saveDraft(); imRenderCard(vid); return;
  }
  const last = div[div.length - 1];
  if(Math.abs(r[0] - last[0]) >= Math.abs(r[1] - last[1])) r[1] = last[1]; else r[0] = last[0];   // haaks
  const e = imNearestEdge(real, r), thr = Math.max(0.4, f.w * 0.04);
  if(e && e.d < thr){                                  // dichtbij een muur -> eindpunt, klaar
    const end = imSnapEnd(real, e, r);
    if(end[0] !== last[0] || end[1] !== last[1]) div.push(end);
    v.zoneDraw = false; saveDraft(); imRenderCard(vid); return;
  }
  r = [Math.round(r[0] / 0.1) * 0.1, Math.round(r[1] / 0.1) * 0.1];   // binnenpunt op 0,1 m
  if(Math.abs(r[0] - last[0]) >= Math.abs(r[1] - last[1])) r[1] = last[1]; else r[0] = last[0];
  if(r[0] === last[0] && r[1] === last[1]) return;
  div.push(r); saveDraft(); imRenderCard(vid);
}

function imBindSketch(svg){
  if(!svg || svg._b) return; svg._b = true;
  svg.addEventListener('click', e => { const [x, y] = imSvgPoint(svg, e); imTap(svg.dataset.vid, x, y); });
}
function imBindPlan(root){   // bindt teken-taps (open) + muur-taps (gesloten) + zone-taps binnen root
  $$('.plan-draw', root).forEach(imBindSketch);
  $$('.plan-zonedraw', root).forEach(svg => { if(svg._bz) return; svg._bz = true; svg.addEventListener('click', e => { const [x, y] = imSvgPoint(svg, e); imZoneTap(svg.dataset.vid, x, y); }); });
  $$('.plan-wall-hit', root).forEach(h => { if(h._b) return; h._b = true; h.addEventListener('click', () => imSelWall(h.dataset.vid, +h.dataset.i)); });
  $$('.plan-zwall-hit', root).forEach(h => { if(h._bz) return; h._bz = true; h.addEventListener('click', () => imSelZWall(h.dataset.vid, +h.dataset.i)); });
}
function imSelZWall(vid, i){
  const v = imVerd(vid); if(!v || !v.zone) return;
  imSelect({ vid, type: 'zone', i });
}
function imSelWall(vid, i){
  const v = imVerd(vid); if(!v) return;
  imSelect({ vid, type: 'wall', i });
}
function imBind(){
  const add = $('#vd-add'); if(add) add.onclick = () => { const d = imData(), nr = d.verdiepingen.length; d.verdiepingen.push({ id: imId(), naam: nr === 0 ? 'Begane grond' : nr + 'e verdieping', sketch: { punten: [], gesloten: false }, muren: [], hoogte: '', fotos: [] }); saveDraft(); imRender(); };
  imBindPlan(document);
  $$('#inmeten .sk-undo').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.sketch.punten.pop(); saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .sk-clear').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.sketch = { punten: [], gesloten: false }; v.muren = []; v.selWall = null; saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .vd-del').forEach(b => b.onclick = () => { if(confirm('Verdieping verwijderen?')){ const d = imData(); d.verdiepingen = d.verdiepingen.filter(v => v.id !== b.dataset.vid); saveDraft(); imRender(); } });
  $$('#inmeten .foto-add').forEach(b => b.onclick = () => { const inp = b.parentElement.querySelector('.foto-cam'); if(inp) inp.click(); });
  $$('#inmeten .foto-cam').forEach(inp => inp.onchange = () => {
    const file = inp.files && inp.files[0]; if(!file) return;
    imResizeToDataURL(file, 1400, durl => {
      if(!durl){ alert('Foto kon niet verwerkt worden.'); return; }
      const v = imVerd(inp.dataset.vid); if(!v) return; if(!v.fotos) v.fotos = [];
      const pid = imId();
      imPhotoPut(pid, durl)
        .then(() => { v.fotos.push({ id: imId(), foto: pid, marks: [], sel: null }); saveDraft(); imRenderCard(inp.dataset.vid); })
        .catch(() => alert('Foto opslaan mislukt — opslag is vol of niet beschikbaar in deze modus.'));
    });
    inp.value = '';
  });
  $$('#inmeten .foto-del').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v && v.fotos){ const f = imFoto(b.dataset.vid, b.dataset.fid); if(f && f.foto) imPhotoDel(f.foto); v.fotos = v.fotos.filter(x => x.id !== b.dataset.fid); saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .foto-gevel-sel').forEach(s => s.onchange = () => { const f = imFoto(s.dataset.vid, s.dataset.fid); if(f){ f.gevel = s.value; saveDraft(); } });
  const vgSel = $('#im-voorgevel'); if(vgSel) vgSel.onchange = () => { imData().voorgevel = vgSel.value; saveDraft(); imRender(); };
  $$('#inmeten .foto-wrap').forEach(w => w.onclick = e => {
    if(e.target.closest('.foto-pin')) return;
    const f = imFoto(w.dataset.vid, w.dataset.fid); if(!f) return;
    const rect = w.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    if(!f.marks) f.marks = [];
    const id = imId(); f.marks.push({ id, x, y, type: 'raam', m2: '', beglazing: '' });
    imSelect({ vid: w.dataset.vid, type: 'mark', fid: w.dataset.fid, mid: id });
  });
  $$('#inmeten .foto-pin').forEach(p => p.onclick = e => { e.stopPropagation(); imSelect({ vid: p.dataset.vid, type: 'mark', fid: p.dataset.fid, mid: p.dataset.mid }); });
  $$('#inmeten .mark-del').forEach(b => b.onclick = () => { const f = imFoto(b.dataset.vid, b.dataset.fid); if(f){ f.marks = (f.marks || []).filter(m => m.id !== b.dataset.mid); if(f.sel === b.dataset.mid){ f.sel = null; _imActive = null; } saveDraft(); imRenderCard(b.dataset.vid); imRenderEditBar(); } });
  $$('#inmeten .vd-f').forEach(i => i.oninput = () => { const v = imVerd(i.dataset.vid); if(v){ v[i.dataset.k] = i.value; saveDraft(); } });
  $$('#inmeten .zone-add').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ const names = (v.zone && v.zone.names) || ['Zone 1', 'Zone 2']; v.zone = { div: [], names, lens: [], sel: null }; v.zoneDraw = true; saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .zone-undo').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v && v.zone){ v.zone.div.pop(); saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .zone-cancel').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.zoneDraw = false; v.zone = null; saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .zone-del').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.zone = null; v.zoneDraw = false; saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .zone-name').forEach(i => i.oninput = () => { const v = imVerd(i.dataset.vid); if(v && v.zone){ if(!v.zone.names) v.zone.names = ['Zone 1', 'Zone 2']; v.zone.names[+i.dataset.z] = i.value; saveDraft(); imRefreshSketch(i.dataset.vid); } });
  const pdf = $('#im-pdf'); if(pdf) pdf.onclick = imBuildPdf;
  imLoadImages(document);
}

// ---------- PDF-uitdraai (client-side, jsPDF) ----------
function imLoadJsPDF(){
  return new Promise((res, rej) => {
    if(window.jspdf && window.jspdf.jsPDF) return res(window.jspdf.jsPDF);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => (window.jspdf && window.jspdf.jsPDF) ? res(window.jspdf.jsPDF) : rej(new Error('jsPDF niet geladen'));
    s.onerror = () => rej(new Error('jsPDF kon niet laden (internet nodig)'));
    document.head.appendChild(s);
  });
}
function imPdfPoly(doc, pts, style){ if(pts.length < 2) return; const d = []; for(let i = 1; i < pts.length; i++) d.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]); doc.lines(d, pts[0][0], pts[0][1], [1, 1], style, true); }
function imPdfMid(pts){ let x = 0, y = 0; pts.forEach(p => { x += p[0]; y += p[1]; }); return [x / pts.length, y / pts.length]; }
function imPdfPlan(doc, v, x, y, maxW, maxH){
  const rc = imReal(v); if(!rc) return;
  const real = rc.slice(0, rc.length - 1);
  const xs = real.map(c => c[0]), ys = real.map(c => c[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const w = (maxx - minx) || 1, h = (maxy - miny) || 1, pad = 8;
  const sc = Math.min((maxW - 2 * pad) / w, (maxH - 2 * pad) / h);
  const ox = x + (maxW - w * sc) / 2 - minx * sc, oy = y + (maxH - h * sc) / 2 - miny * sc;
  const P = c => [c[0] * sc + ox, c[1] * sc + oy];
  const reg = imRegionPolys(v);
  doc.setLineWidth(0.3);
  if(reg){
    doc.setFillColor(223, 233, 238); imPdfPoly(doc, reg.a.map(P), 'F');
    doc.setFillColor(232, 224, 245); imPdfPoly(doc, reg.b.map(P), 'F');
    doc.setDrawColor(70); imPdfPoly(doc, real.map(P), 'D');
    doc.setDrawColor(122, 74, 192); doc.setLineWidth(0.6);
    const dp = reg.pts.map(P); for(let i = 0; i < dp.length - 1; i++) doc.line(dp[i][0], dp[i][1], dp[i + 1][0], dp[i + 1][1]);
    doc.setLineWidth(0.3);
    doc.setFontSize(7); doc.setTextColor(40);
    const ma = imPdfMid(reg.a.map(P)), mb = imPdfMid(reg.b.map(P));
    doc.text(String(reg.names[0]), ma[0], ma[1], { align: 'center' }); doc.text(reg.areaA.toFixed(1) + ' m2', ma[0], ma[1] + 3, { align: 'center' });
    doc.text(String(reg.names[1]), mb[0], mb[1], { align: 'center' }); doc.text(reg.areaB.toFixed(1) + ' m2', mb[0], mb[1] + 3, { align: 'center' });
  } else {
    doc.setFillColor(234, 242, 236); doc.setDrawColor(70); imPdfPoly(doc, real.map(P), 'FD');
  }
  const n = real.length, ccx = real.reduce((s, c) => s + c[0], 0) / n, ccy = real.reduce((s, c) => s + c[1], 0) / n, mc = P([ccx, ccy]);
  doc.setFontSize(7); doc.setTextColor(90);
  for(let i = 0; i < n; i++){
    const a = real[i], b = real[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mid = P([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), vert = Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1]);
    let tx = mid[0], ty = mid[1], al = 'center';
    if(vert){ const r = mid[0] >= mc[0]; tx += r ? 2 : -2; ty += 1; al = r ? 'left' : 'right'; } else { ty += mid[1] >= mc[1] ? 3.2 : -1.6; }
    doc.text(len.toFixed(2), tx, ty, { align: al });
  }
  doc.setTextColor(0);
}
function imPdfAdres(){ return [state.straat, state.huisnummer, state.huisletter].filter(Boolean).join(' ') + (state.postcode || state.woonplaats ? ', ' + [state.postcode, state.woonplaats].filter(Boolean).join(' ') : ''); }
function imPdfSafeName(){ return (imPdfAdres() || 'opname').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || 'opname'; }
function imPdfClean(s){   // jsPDF standaardfont = WinAnsi; tekens die daarbuiten vallen netjes vervangen
  return String(s == null ? '' : s).replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/Δ/g, 'd').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/•/g, '-').replace(/×/g, 'x').replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
}
function imPdfHeader(c){
  const d = c.doc;
  d.setFillColor(35, 76, 94); d.rect(0, 0, c.PW, 22, 'F');
  d.setTextColor(255); d.setFont('helvetica', 'bold'); d.setFontSize(16); d.text('Opname-uitdraai', c.M, 13);
  d.setFont('helvetica', 'normal'); d.setFontSize(10); d.setTextColor(215, 232, 232); d.text(new Date().toLocaleDateString('nl-NL'), c.PW - c.M, 13, { align: 'right' });
  d.setTextColor(30); d.setFont('helvetica', 'bold'); d.setFontSize(12); d.text(imPdfClean(imPdfAdres() || '(adres onbekend)'), c.M, 20);
  d.setTextColor(0); c.yy = 30;
}
function imPdfSummary(c, summary){
  const d = c.doc, labelW = 52, valX = c.M + labelW + 3, valW = c.PW - c.M - valX;
  for(const sec of (summary || [])){
    const rows = (sec.rows || []).filter(r => r && r.length >= 2 && String(r[1] || '').trim());
    if(!rows.length) continue;
    if(c.yy > c.PH - 22){ d.addPage(); c.yy = c.M; }
    d.setFillColor(62, 158, 54); d.rect(c.M, c.yy - 4.5, c.PW - 2 * c.M, 7, 'F');
    d.setTextColor(255); d.setFont('helvetica', 'bold'); d.setFontSize(10.5); d.text(imPdfClean(sec.section || ''), c.M + 2, c.yy);
    c.yy += 5.5; d.setTextColor(40);
    for(const r of rows){
      const lines = d.splitTextToSize(imPdfClean(String(r[1])), valW), rowH = Math.max(5, lines.length * 4.5);
      if(c.yy + rowH > c.PH - 12){ d.addPage(); c.yy = c.M; }
      d.setFont('helvetica', 'bold'); d.setFontSize(8.5); d.setTextColor(110); d.text(imPdfClean(String(r[0])), c.M, c.yy + 3);
      d.setFont('helvetica', 'normal'); d.setFontSize(9.5); d.setTextColor(30); d.text(lines, valX, c.yy + 3);
      c.yy += rowH;
    }
    c.yy += 3.5;
  }
}
// 3D-massing: footprint(s) geextrudeerd met de verdiepingshoogtes, isometrisch geprojecteerd (plat dak)
function imPdf3D(c, x, y, w, h){
  const d = c.doc, A = Math.PI / 6, ca = Math.cos(A), sa = Math.sin(A);
  const iso = (X, Y, Z) => [(X - Y) * ca, (X + Y) * sa - Z];
  const floors = []; let zbase = 0;
  for(const v of imData().verdiepingen){
    const rc = imReal(v); if(!rc) continue;
    const hgt = imNum(v.hoogte) || 2.6;
    floors.push({ real: rc.slice(0, rc.length - 1), z0: zbase, z1: zbase + hgt }); zbase += hgt;
  }
  if(!floors.length) return false;
  const pts = []; floors.forEach(f => f.real.forEach(p => { pts.push(iso(p[0], p[1], f.z0)); pts.push(iso(p[0], p[1], f.z1)); }));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const bw = (maxx - minx) || 1, bh = (maxy - miny) || 1, pad = 4, sc = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  const ox = x + (w - bw * sc) / 2 - minx * sc, oy = y + (h - bh * sc) / 2 - miny * sc;
  const P = (X, Y, Z) => { const p = iso(X, Y, Z); return [p[0] * sc + ox, p[1] * sc + oy]; };
  const faces = [];
  floors.forEach(f => {
    const n = f.real.length;
    for(let i = 0; i < n; i++){ const a = f.real[i], b = f.real[(i + 1) % n]; faces.push({ p: [P(a[0], a[1], f.z0), P(b[0], b[1], f.z0), P(b[0], b[1], f.z1), P(a[0], a[1], f.z1)], key: (a[0] + b[0] + a[1] + b[1]) / 2 + (f.z0 + f.z1) / 2, top: false }); }
    faces.push({ p: f.real.map(p => P(p[0], p[1], f.z1)), key: f.real.reduce((s, p) => s + p[0] + p[1], 0) / n + f.z1 + 0.01, top: true });
  });
  faces.sort((a, b) => a.key - b.key);
  d.setLineWidth(0.25);
  faces.forEach(fc => { if(fc.top){ d.setFillColor(206, 223, 230); d.setDrawColor(60); } else { d.setFillColor(231, 238, 241); d.setDrawColor(120); } imPdfPoly(d, fc.p, 'FD'); });
  return true;
}
async function imPdfInmeet(c){
  const d = c.doc, verds = imData().verdiepingen;
  if(!verds.length) return;
  if(c.yy > c.PH - 30){ d.addPage(); c.yy = c.M; }
  d.setFillColor(35, 76, 94); d.rect(c.M, c.yy - 4.5, c.PW - 2 * c.M, 7, 'F');
  d.setTextColor(255); d.setFont('helvetica', 'bold'); d.setFontSize(10.5); d.text(imPdfClean('Inmeten (plattegronden & foto\'s)' + (imData().voorgevel ? '   -   voorgevel: ' + imData().voorgevel : '')), c.M + 2, c.yy); d.setTextColor(0); c.yy += 7;
  if(verds.some(v => imReal(v))){
    try {
      if(c.yy > c.PH - 64){ d.addPage(); c.yy = c.M; }
      d.setFont('helvetica', 'bold'); d.setFontSize(9.5); d.setTextColor(60); d.text('3D-impressie (plat dak)', c.M, c.yy); d.setTextColor(0); c.yy += 2;
      const h3 = 58; if(imPdf3D(c, c.M, c.yy, c.PW - 2 * c.M, h3)) c.yy += h3 + 4;
    } catch(e){ d.setTextColor(0); }
  }
  for(const v of verds){
    if(c.yy > c.PH - 75){ d.addPage(); c.yy = c.M; }
    d.setFont('helvetica', 'bold'); d.setFontSize(11);
    const area = imArea(v);
    d.text(imPdfClean(`${v.naam || 'Verdieping'}${v.hoogte ? '  -  h ' + v.hoogte + ' m' : ''}${area ? '  -  ' + area.toFixed(2) + ' m2' : ''}`), c.M, c.yy); c.yy += 4;
    d.setFont('helvetica', 'normal');
    if(v.sketch && v.sketch.gesloten && imReal(v)){
      const planH = 60; imPdfPlan(d, v, c.M, c.yy, 96, planH); c.yy += planH + 3;
    } else { d.setFontSize(9); d.setTextColor(120); d.text('(geen volledige plattegrond)', c.M, c.yy + 3); d.setTextColor(0); c.yy += 8; }
    for(const ft of (v.fotos || [])){
      const imgW = 58, imgH = 43;
      const gLabel = ft.gevel ? imGevelNaam(ft.gevel) + (imGevelOrient(ft.gevel) ? ' (' + imGevelOrient(ft.gevel) + ')' : '') : '';
      if(c.yy > c.PH - (imgH + (gLabel ? 12 : 8))){ d.addPage(); c.yy = c.M; }
      if(gLabel){ d.setFont('helvetica', 'bold'); d.setFontSize(9); d.setTextColor(35, 76, 94); d.text(imPdfClean(gLabel), c.M, c.yy + 1); d.setTextColor(0); d.setFont('helvetica', 'normal'); c.yy += 4; }
      let durl = _imUrl[ft.foto]; if(!durl){ durl = await imPhotoGet(ft.foto); if(durl) _imUrl[ft.foto] = durl; }
      if(durl){ try { d.addImage(durl, 'JPEG', c.M, c.yy, imgW, imgH); } catch(e){} d.setDrawColor(150); d.setLineWidth(0.2); d.rect(c.M, c.yy, imgW, imgH);
        (ft.marks || []).forEach((m, i) => { const cx = c.M + m.x * imgW, cy = c.yy + m.y * imgH; d.setFillColor(35, 76, 94); d.circle(cx, cy, 2.2, 'F'); d.setTextColor(255); d.setFontSize(7); d.text(String(i + 1), cx, cy + 1.1, { align: 'center' }); }); d.setTextColor(0);
      }
      let ty = c.yy + 3.5; d.setFontSize(8.5);
      const marks = ft.marks || [];
      if(!marks.length) d.text('(geen markeringen)', c.M + imgW + 4, ty);
      marks.forEach((m, i) => { d.text(imPdfClean(`${i + 1}. ${m.type || 'raam'} - ${m.m2 ? m.m2 + ' m2' : '? m2'} - ${m.beglazing || '-'}`), c.M + imgW + 4, ty); ty += 4.4; });
      c.yy += Math.max(imgH, ty - c.yy) + 5;
    }
    c.yy += 3;
  }
}
async function imMakePdfDoc(){
  const jsPDF = await imLoadJsPDF();
  const c = { doc: new jsPDF({ unit: 'mm', format: 'a4' }), PW: 210, PH: 297, M: 12, yy: 12 };
  imPdfHeader(c);
  if(typeof collectSummary === 'function'){ try { imPdfSummary(c, collectSummary()); } catch(e){} }
  await imPdfInmeet(c);
  return c.doc;
}
async function imBuildPdf(){
  const btn = $('#im-pdf'), orig = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = 'PDF maken…'; }
  try { const doc = await imMakePdfDoc(); doc.save('opname_' + imPdfSafeName() + '.pdf'); }
  catch(e){ alert('PDF maken mislukt: ' + ((e && e.message) || e)); }
  finally { if(btn){ btn.disabled = false; btn.textContent = orig || '📄 PDF-uitdraai (download)'; } }
}
async function imPdfBase64(){   // PDF als base64 (zonder data-URL prefix) voor de e-mail-bijlage
  const doc = await imMakePdfDoc(), durl = doc.output('datauristring');
  return durl.substring(durl.indexOf('base64,') + 7);
}
window.imPdfBase64 = imPdfBase64;

window.imRender = imRender;
window.addEventListener('DOMContentLoaded', imRender);
