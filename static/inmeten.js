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
// effectieve muurlengtes: ingevoerd + afgeleid via sluiting (Σ horizontaal = 0, Σ verticaal = 0),
// zodat je bv. bij een rechthoek maar 2 van de 4 muren hoeft in te vullen
function imEffLens(v){
  const p = v.sketch.punten; if(p.length < 3) return null;
  const dirs = [], lens = [], derived = [];
  for(let i = 0; i < p.length; i++){
    const a = p[i], b = p[(i + 1) % p.length], dx = b[0] - a[0], dy = b[1] - a[1];
    dirs.push(Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1]);
    lens.push(imNum((v.muren || [])[i])); derived.push(false);
  }
  for(const ax of [0, 1]){                        // per as: als precies één muur ontbreekt -> afleiden
    let sum = 0, miss = -1, cnt = 0;
    for(let i = 0; i < dirs.length; i++){ if(dirs[i][ax]){ if(lens[i] > 0) sum += dirs[i][ax] * lens[i]; else { miss = i; cnt++; } } }
    if(cnt === 1){ const dv = -sum / dirs[miss][ax]; if(dv > 0){ lens[miss] = dv; derived[miss] = true; } }
  }
  return { dirs, lens, derived };
}
function imReal(v){
  if(!v.sketch.gesloten || v.sketch.punten.length < 3) return null;
  const e = imEffLens(v); if(!e || e.lens.some(l => !(l > 0))) return null;   // nog niet genoeg ingevuld
  let x = 0, y = 0; const rc = [[0, 0]];
  for(let i = 0; i < e.dirs.length; i++){ x += e.dirs[i][0] * e.lens[i]; y += e.dirs[i][1] * e.lens[i]; rc.push([x, y]); }
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
// ligt rand [a,b] op een plattegrond-muur (collineair + overlappend)?
function imEdgeOnPlan(real, a, b){
  const horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]), tol = 0.08, ov = 0.05;
  for(let i = 0; i < real.length; i++){
    const c = real[i], d = real[(i + 1) % real.length], eh = Math.abs(d[0] - c[0]) >= Math.abs(d[1] - c[1]);
    if(eh !== horiz) continue;
    const k = horiz ? 1 : 0, j = horiz ? 0 : 1;
    if(Math.abs(a[k] - c[k]) > tol) continue;
    const lo = Math.max(Math.min(a[j], b[j]), Math.min(c[j], d[j])), hi = Math.min(Math.max(a[j], b[j]), Math.max(c[j], d[j]));
    if(hi - lo > ov) return true;
  }
  return false;
}
// --- zone-geometrie. Drie soorten:
//  1) binnenlijn muur->ANDERE muur: gebied = lijn + muurboog (kleinste kant); altijd binnen de plattegrond.
//  2) zelfde muur of 3) vrij: gesloten polygoon (sluit via div[laatste]->div[0]). Randen op een muur zijn
//     niet dimensioneerbaar (volgen de muur); de overige randen vul je in.
function imZoneGeom(v, z){
  const f = imFit(v); if(!f || !f.rc) return null;
  const real = f.real, N = real.length, div = z && z.div;
  if(!div || div.length < 2) return null;
  const onW = pt => { const e = imNearestEdge(real, pt); return (e && e.d < 0.15) ? e : null; };
  const eS = onW(div[0]), eE = onW(div[div.length - 1]);
  const seg = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; return { dir: Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1], meas: Math.hypot(dx, dy) }; };
  if(eS && eE && eS.i !== eE.i){               // ===== 1) BINNENLIJN =====
    const dirs = [], lens = [];
    for(let i = 0; i < div.length - 1; i++){ const s = seg(div[i], div[i + 1]); dirs.push(s.dir); const num = imNum(z.lens && z.lens[i]); lens.push(num > 0 ? num : s.meas); }
    let Dx = 0, Dy = 0; dirs.forEach((d, i) => { Dx += d[0] * lens[i]; Dy += d[1] * lens[i]; });
    const aS = real[eS.i], bS = real[(eS.i + 1) % N], sH = Math.abs(bS[0] - aS[0]) >= Math.abs(bS[1] - aS[1]);
    const aE = real[eE.i], bE = real[(eE.i + 1) % N], eV = Math.abs(bE[0] - aE[0]) < Math.abs(bE[1] - aE[1]);
    const cS = sH ? aS[1] : aS[0], cE = eV ? aE[0] : aE[1], sd = div[0];
    let S; if(sH) S = eV ? [cE - Dx, cS] : [sd[0], cS]; else S = !eV ? [cS, cE - Dy] : [cS, sd[1]];
    const pts = [S]; let cur = S; for(let i = 0; i < dirs.length; i++){ cur = [cur[0] + dirs[i][0] * lens[i], cur[1] + dirs[i][1] * lens[i]]; pts.push(cur); }
    const E = pts[pts.length - 1], interior = pts.slice(1, -1);
    const fwd = (from, to) => { const res = []; let i = (from + 1) % N, gg = 0; while(gg++ <= N){ res.push(real[i]); if(i === to) break; i = (i + 1) % N; } return res; };
    const ra = [S].concat(fwd(eS.i, eE.i), [E], interior.slice().reverse()), rb = [E].concat(fwd(eE.i, eS.i), [S], interior);
    const within = (p, a, b) => p[0] >= Math.min(a[0], b[0]) - 0.06 && p[0] <= Math.max(a[0], b[0]) + 0.06 && p[1] >= Math.min(a[1], b[1]) - 0.06 && p[1] <= Math.max(a[1], b[1]) + 0.06;
    const segs = pts.slice(0, -1).map((a, i) => ({ a, b: pts[i + 1], len: lens[i], di: i }));
    return { kind: 'lijn', region: imPolyArea(ra) <= imPolyArea(rb) ? ra : rb, segs, area: Math.min(imPolyArea(ra), imPolyArea(rb)), valid: within(S, aS, bS) && within(E, aE, bE) };
  }
  // ===== 2/3) GESLOTEN POLYGOON (sluit div[n-1]->div[0]) =====
  const n = div.length, dirs = [], meas = [];
  for(let i = 0; i < n; i++){ const s = seg(div[i], div[(i + 1) % n]); dirs.push(s.dir); meas.push(s.meas); }
  const lens = dirs.map((d, i) => { const num = imNum(z.lens && z.lens[i]); return num > 0 ? num : 0; });
  for(const ax of [0, 1]){ let sum = 0, miss = -1, cnt = 0; for(let i = 0; i < n; i++){ if(dirs[i][ax]){ if(lens[i] > 0) sum += dirs[i][ax] * lens[i]; else { miss = i; cnt++; } } } if(cnt === 1){ const dv = -sum / dirs[miss][ax]; if(dv > 0) lens[miss] = dv; } }
  for(let i = 0; i < n; i++){ if(!(lens[i] > 0)) lens[i] = meas[i]; }
  const rc = [div[0].slice()]; let x = div[0][0], y = div[0][1];
  for(let i = 0; i < n - 1; i++){ x += dirs[i][0] * lens[i]; y += dirs[i][1] * lens[i]; rc.push([x, y]); }
  const xs = real.map(c => c[0]), ys = real.map(c => c[1]), minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const inside = rc.every(c => c[0] >= minx - 0.06 && c[0] <= maxx + 0.06 && c[1] >= miny - 0.06 && c[1] <= maxy + 0.06);
  const segs = rc.map((a, i) => { const b = rc[(i + 1) % n]; return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]), di: imEdgeOnPlan(real, a, b) ? -1 : i }; });
  return { kind: 'dicht', region: rc, segs, area: imPolyArea(rc), valid: inside };
}
function imZoneArea(v, z){ const g = imZoneGeom(v, z); return g ? g.area : 0; }
function imZoneById(v, id){ return (v.zones || []).find(z => z.id === id) || null; }
function imZoneDrawing(v){ return v.zoneDraw ? imZoneById(v, v.zoneDraw) : null; }

function imGridBg(){
  let g = '';
  for(let x = 0; x <= SV_W; x += 20) g += `<line x1="${x}" y1="0" x2="${x}" y2="${SV_H}" class="plan-grid"/>`;
  for(let y = 0; y <= SV_H; y += 20) g += `<line x1="0" y1="${y}" x2="${SV_W}" y2="${y}" class="plan-grid"/>`;
  return g;
}

function imSketchSvg(v){
  if(v.zoneDraw && !imZoneDrawing(v)) v.zoneDraw = null;   // hangende zone-teken-stand opruimen -> muren weer aantikbaar
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
  inner += `<polygon points="${M.map(c => c[0] + ',' + c[1]).join(' ')}" class="plan-rect"/>`;
  if(rc) inner += `<text x="${SV_W / 2}" y="${SV_H / 2 + 5}" text-anchor="middle" class="plan-area">${imArea(v).toFixed(2)} m&#178;</text>`;
  else inner += `<text x="${SV_W / 2}" y="${SV_H / 2 + 5}" text-anchor="middle" class="plan-hint">tik een muur &amp; vul de lengte in</text>`;
  if(rc) (v.zones || []).forEach((z, zi) => {                  // zones: gebied (region) + dimensioneerbare randen
    if(v.zoneDraw === z.id) return;                            // deze wordt nog getekend
    const g = imZoneGeom(v, z); if(!g) return;
    const rp = g.region.map(toS), rm = imPolyMid(rp);
    inner += `<polygon points="${rp.map(c => c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ')}" class="zone-a"/>`;
    inner += `<text x="${rm[0].toFixed(1)}" y="${(rm[1] - 2).toFixed(1)}" text-anchor="middle" class="zone-lbl">${imEsc(z.naam || ('Zone ' + (zi + 1)))}</text><text x="${rm[0].toFixed(1)}" y="${(rm[1] + 10).toFixed(1)}" text-anchor="middle" class="zone-lbl-area">${g.area.toFixed(2)} m&#178;</text>`;
    g.segs.forEach(s => {
      const a = toS(s.a), b = toS(s.b), mx2 = (a[0] + b[0]) / 2, my2 = (a[1] + b[1]) / 2, isS = s.di >= 0 && z.wsel === s.di;
      const zvert = Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1]);
      if(s.di >= 0) inner += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" class="zone-cut${isS ? ' zone-cut-sel' : ''}"/>`;
      inner += `<text x="${(mx2 + (zvert ? 6 : 0)).toFixed(1)}" y="${(my2 + (zvert ? 0 : -3)).toFixed(1)}" text-anchor="${zvert ? 'start' : 'middle'}"${zvert ? ' dominant-baseline="middle"' : ''} class="zone-dim${isS ? ' zone-dim-sel' : s.di < 0 ? ' plan-dim-auto' : ''}">${s.len.toFixed(2).replace('.', ',')}</text>`;
    });
    if(!g.valid) inner += `<text x="${SV_W / 2}" y="${SV_H - 8}" text-anchor="middle" class="plan-warn">${g.kind === 'lijn' ? 'zone sluit niet op de muur' : 'zone valt buiten de plattegrond'} — controleer maten</text>`;
    g.segs.forEach(s => { if(s.di < 0) return; const a = toS(s.a), b = toS(s.b); inner += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" class="zone-wall-hit" data-vid="${v.id}" data-zid="${z.id}" data-i="${s.di}"/>`; });
  });
  if(v.zoneDraw && rc){                                        // zone in aanbouw
    const zd = imZoneDrawing(v), dl = zd && zd.div ? zd.div.map(toS) : [];
    if(dl.length > 1) inner += `<polyline points="${dl.map(c => c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ')}" class="zone-line"/>`;
    dl.forEach((c, i) => { inner += `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${i === 0 ? 6 : 4}" class="zone-pt${i === 0 ? ' zone-pt-close' : ''}"/>`; });
  }
  const eff = imEffLens(v);
  for(let i = 0; i < n; i++){
    const a = M[i], b = M[(i + 1) % n], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, isSel = sel === i;
    const vert = Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1]);
    inner += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="plan-wall${isSel ? ' plan-wall-sel' : ''}"/>`;
    const raw = ((v.muren && v.muren[i]) || '').trim(), der = eff && eff.derived[i];
    const len = raw || (der ? eff.lens[i].toFixed(2).replace('.', ',') : '');
    if(len){
      let tx = mx, ty = my, anchor = 'middle', bl = '';
      if(vert){ const right = mx >= cx; tx = mx + (right ? 9 : -9); anchor = right ? 'start' : 'end'; bl = ' dominant-baseline="middle"'; }
      else { ty = my + (my >= cy ? 15 : -7); }
      inner += `<text x="${tx}" y="${ty}" text-anchor="${anchor}"${bl} class="plan-dim${isSel ? ' plan-dim-sel' : der ? ' plan-dim-auto' : ''}">${imEsc(len)}</text>`;
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
  return `<p class="wall-hint">${imReal(v) ? 'Maten compleet (rest wordt afgeleid) — tik een muur om te wijzigen.' : 'Tik op een muur; de maat vul je bovenin in. Bij een rechthoek volstaan 2 muren.'}</p>`;
}

function imZoneControlsHtml(v){
  if(!v.sketch.gesloten) return '';
  if(!imReal(v)) return `<p class="wall-hint">Vul eerst de muurmaten in; daarna kun je zones tekenen.</p>`;
  if(v.zoneDraw){
    const zd = imZoneDrawing(v), nP = zd && zd.div ? zd.div.length : 0;
    return `<div class="zone-box">
      <p class="wall-hint">Start op een buitenmuur en eindig op een (andere of dezelfde) buitenmuur — de muren sluiten de zone. Of start vrij in de plattegrond en sluit op het groene beginpunt.</p>
      <div class="sketch-act">${nP ? `<button type="button" class="zone-undo" data-vid="${v.id}">↶ Punt terug</button>` : ''}<button type="button" class="zone-cancel" data-vid="${v.id}">Annuleer</button></div>
    </div>`;
  }
  const zones = v.zones || [];
  const list = zones.map((z, zi) => `<div class="zone-row"><input class="zone-name" data-vid="${v.id}" data-zid="${z.id}" value="${imEsc(z.naam || ('Zone ' + (zi + 1)))}"><span class="zone-area">${imZoneArea(v, z).toFixed(2)} m²</span><button type="button" class="zone-del" data-vid="${v.id}" data-zid="${z.id}">×</button></div>`).join('');
  return `<div class="zone-box">
    ${zones.length ? `<div class="zone-list">${list}</div><p class="wall-hint">Tik op een binnenlijn-segment in de schets om de maat in te vullen.</p>` : '<p class="wall-hint">Nog geen zones. Teken een binnenlijn (bv. om een overloop af te bakenen).</p>'}
    <button type="button" class="zone-add" data-vid="${v.id}">✏️ Zone tekenen</button>
  </div>`;
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
let _imActive = null;   // { vid, type:'wall'|'zonewall'|'mark', fid?/zid? } | null
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
  } else if(a.type === 'zonewall'){
    const z = imZoneById(v, a.zid); if(!z || z.wsel == null) return hide();
    inner = `<span class="im-bar-lbl">${imEsc(z.naam || 'Zone')} · lijn ${a.i + 1} (m)</span><input class="im-bar-in im-zwall-len" inputmode="decimal" data-vid="${a.vid}" data-zid="${a.zid}" data-i="${a.i}" value="${imEsc((z.lens && z.lens[a.i]) || '')}" placeholder="meter">`;
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
  bar.querySelectorAll('.im-zwall-len').forEach(i => i.oninput = () => { const v = imVerd(i.dataset.vid), z = v && imZoneById(v, i.dataset.zid); if(z){ if(!z.lens) z.lens = []; z.lens[+i.dataset.i] = i.value; saveDraft(); imRefreshSketch(i.dataset.vid); } });
  bar.querySelectorAll('.im-mk').forEach(el => { const ev = el.tagName === 'SELECT' ? 'onchange' : 'oninput'; el[ev] = () => { const m = imMark(el.dataset.vid, el.dataset.fid, el.dataset.mid); if(m){ m[el.dataset.k] = el.value; saveDraft(); } }; });
  const done = bar.querySelector('.im-bar-done'); if(done) done.onclick = imCloseBar;
}
function imCloseBar(){
  const a = _imActive; _imActive = null;
  if(a){ const v = imVerd(a.vid); if(v){ if(a.type === 'wall') v.selWall = null; else if(a.type === 'mark'){ const f = imFoto(a.vid, a.fid); if(f) f.sel = null; } else if(a.type === 'zonewall'){ const z = imZoneById(v, a.zid); if(z) z.wsel = null; } } saveDraft(); if(a) imRenderCard(a.vid); }
  imRenderEditBar();
}
function imSelect(active){   // 1 selectie tegelijk; imRenderCard rendert de balk -> focus die
  const v = imVerd(active.vid); if(!v) return;
  if(_imActive && _imActive.vid !== active.vid){    // selectie op een andere kaart opruimen
    const pv = imVerd(_imActive.vid);
    if(pv){ pv.selWall = null; (pv.fotos || []).forEach(f => f.sel = null); (pv.zones || []).forEach(z => z.wsel = null);
      const pc = $(`#inmeten .vd[data-vid="${_imActive.vid}"]`); if(pc) pc.outerHTML = imCardHtml(pv); }
  }
  v.selWall = null; (v.fotos || []).forEach(f => f.sel = null); (v.zones || []).forEach(z => z.wsel = null);
  if(active.type === 'wall') v.selWall = active.i;
  else if(active.type === 'mark'){ const f = imFoto(active.vid, active.fid); if(f) f.sel = active.mid; }
  else if(active.type === 'zonewall'){ const z = imZoneById(v, active.zid); if(z) z.wsel = active.i; }
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
// zone (binnenlijn) tekenen: tik op een buitenmuur (start), tik knikken (haaks), eindig op een buitenmuur
function imZoneTap(vid, sx, sy){
  const v = imVerd(vid); if(!v || !v.zoneDraw) return;
  const f = imFit(v); if(!f || !f.rc) return;
  const real = f.real, thr = Math.max(0.4, f.w * 0.04);
  let r = [(sx - f.ox) / f.sc, (sy - f.oy) / f.sc];   // svg -> echte coords (inverse affien)
  const z = imZoneDrawing(v); if(!z) return; const div = z.div;
  const grid = p => [Math.max(f.minx, Math.min(f.maxx, Math.round(p[0] / 0.1) * 0.1)), Math.max(f.miny, Math.min(f.maxy, Math.round(p[1] / 0.1) * 0.1))];
  if(div.length === 0){                               // start: op een muur als dichtbij, anders vrij
    const e = imNearestEdge(real, r);
    if(e && e.d < thr){ div.push(imSnapOnEdge(real, e)); z.startWall = true; } else { div.push(grid(r)); z.startWall = false; }
    saveDraft(); imRenderCard(vid); return;
  }
  const last = div[div.length - 1];
  if(z.startWall === false && div.length >= 3 && Math.hypot(r[0] - div[0][0], r[1] - div[0][1]) < thr){   // vrije zone: sluit op beginpunt
    v.zoneDraw = null; saveDraft(); imRenderCard(vid); return;
  }
  if(Math.abs(r[0] - last[0]) >= Math.abs(r[1] - last[1])) r[1] = last[1]; else r[0] = last[0];   // haaks
  if(z.startWall){                                    // muur-zone: eindig op een buitenmuur
    const e = imNearestEdge(real, r);
    if(e && e.d < thr){ const end = imSnapEnd(real, e, r); if(end[0] !== last[0] || end[1] !== last[1]) div.push(end); v.zoneDraw = null; saveDraft(); imRenderCard(vid); return; }
  }
  r = grid(r);
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
  $$('.zone-wall-hit', root).forEach(h => { if(h._b) return; h._b = true; h.addEventListener('click', () => imSelect({ vid: h.dataset.vid, type: 'zonewall', zid: h.dataset.zid, i: +h.dataset.i })); });
}
function imSelWall(vid, i){
  const v = imVerd(vid); if(!v) return;
  imSelect({ vid, type: 'wall', i });
}
function imBind(){
  const add = $('#vd-add'); if(add) add.onclick = () => { const d = imData(), nr = d.verdiepingen.length; d.verdiepingen.push({ id: imId(), naam: nr === 0 ? 'Begane grond' : nr + 'e verdieping', sketch: { punten: [], gesloten: false }, muren: [], hoogte: '', fotos: [] }); saveDraft(); imRender(); };
  imBindPlan(document);
  $$('#inmeten .sk-undo').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.sketch.punten.pop(); saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .sk-clear').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ v.sketch = { punten: [], gesloten: false }; v.muren = []; v.selWall = null; v.zoneDraw = null; v.zones = []; _imActive = null; saveDraft(); imRenderCard(b.dataset.vid); } });
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
  $$('#inmeten .zone-add').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ if(!v.zones) v.zones = []; const id = imId(); v.zones.push({ id, naam: 'Zone ' + (v.zones.length + 1), div: [], lens: [], wsel: null }); v.zoneDraw = id; saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .zone-undo').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid), z = v && imZoneDrawing(v); if(z){ z.div.pop(); saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .zone-cancel').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v){ if(v.zones) v.zones = v.zones.filter(z => z.id !== v.zoneDraw); v.zoneDraw = null; saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .zone-del').forEach(b => b.onclick = () => { const v = imVerd(b.dataset.vid); if(v && v.zones){ v.zones = v.zones.filter(z => z.id !== b.dataset.zid); saveDraft(); imRenderCard(b.dataset.vid); } });
  $$('#inmeten .zone-name').forEach(i => i.oninput = () => { const v = imVerd(i.dataset.vid), z = v && imZoneById(v, i.dataset.zid); if(z){ z.naam = i.value; saveDraft(); imRefreshSketch(i.dataset.vid); } });
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
  doc.setLineWidth(0.3);
  doc.setFillColor(234, 242, 236); doc.setDrawColor(70); imPdfPoly(doc, real.map(P), 'FD');
  (v.zones || []).forEach(z => {                 // getekende zones als gekleurde vlakken
    const g = imZoneGeom(v, z); if(!g) return;
    const zp = g.region.map(P);
    doc.setFillColor(214, 224, 245); doc.setDrawColor(122, 74, 192); imPdfPoly(doc, zp, 'FD');
    const zm = imPdfMid(zp); doc.setFontSize(6.5); doc.setTextColor(60);
    doc.text(imPdfClean(z.naam || 'Zone'), zm[0], zm[1], { align: 'center' }); doc.text(g.area.toFixed(1) + ' m2', zm[0], zm[1] + 2.8, { align: 'center' });
    doc.setTextColor(0);
  });
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
function imBuildFloors(){           // verdiepingen met footprint + cumulatieve z-hoogtes (+ verdieping zelf)
  const floors = []; let zbase = 0;
  for(const v of imData().verdiepingen){
    const rc = imReal(v); if(!rc) continue;
    const hgt = imNum(v.hoogte) || 2.6;
    floors.push({ real: rc.slice(0, rc.length - 1), z0: zbase, z1: zbase + hgt, v }); zbase += hgt;
  }
  return floors;
}
// 3D-massing: footprint(s) geextrudeerd + getekende zones bovenop de vloer (plat dak)
function imPdf3D(c, x, y, w, h){
  const d = c.doc, A = Math.PI / 6, ca = Math.cos(A), sa = Math.sin(A);
  const iso = (X, Y, Z) => [(X - Y) * ca, (X + Y) * sa - Z];
  const floors = imBuildFloors(); if(!floors.length) return false;
  const pts = []; floors.forEach(f => f.real.forEach(p => { pts.push(iso(p[0], p[1], f.z0)); pts.push(iso(p[0], p[1], f.z1)); }));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const bw = (maxx - minx) || 1, bh = (maxy - miny) || 1, pad = 4, sc = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  const ox = x + (w - bw * sc) / 2 - minx * sc, oy = y + (h - bh * sc) / 2 - miny * sc;
  const P = (X, Y, Z) => { const p = iso(X, Y, Z); return [p[0] * sc + ox, p[1] * sc + oy]; };
  const faces = [];
  floors.forEach(f => {
    const n = f.real.length;
    for(let i = 0; i < n; i++){ const a = f.real[i], b = f.real[(i + 1) % n]; faces.push({ p: [P(a[0], a[1], f.z0), P(b[0], b[1], f.z0), P(b[0], b[1], f.z1), P(a[0], a[1], f.z1)], key: (a[0] + b[0] + a[1] + b[1]) / 2 + (f.z0 + f.z1) / 2, t: 'wall' }); }
    faces.push({ p: f.real.map(p => P(p[0], p[1], f.z1)), key: f.real.reduce((s, p) => s + p[0] + p[1], 0) / n + f.z1 + 0.01, t: 'top' });
    (f.v.zones || []).forEach(z => { const g = imZoneGeom(f.v, z); if(!g) return; const m = imPolyMid(g.region); faces.push({ p: g.region.map(p => P(p[0], p[1], f.z1)), key: m[0] + m[1] + f.z1 + 0.03, t: 'zone' }); });
  });
  faces.sort((a, b) => a.key - b.key);
  d.setLineWidth(0.25);
  faces.forEach(fc => {
    if(fc.t === 'zone'){ d.setFillColor(196, 184, 230); d.setDrawColor(122, 74, 192); }
    else if(fc.t === 'top'){ d.setFillColor(206, 223, 230); d.setDrawColor(60); }
    else { d.setFillColor(231, 238, 241); d.setDrawColor(120); }
    imPdfPoly(d, fc.p, 'FD');
  });
  return true;
}
// orthografisch aanzicht: voor/achter (as=x, z omhoog), zij (as=y), boven (footprint x-y)
function imPdfElevBox(d, floors, x, y, w, h, mode, label){
  d.setFontSize(7); d.setTextColor(70); d.setFont('helvetica', 'bold'); d.text(label, x + w / 2, y, { align: 'center' }); d.setFont('helvetica', 'normal'); d.setTextColor(0);
  const by = y + 2, bh = h - 2, pad = 3;
  d.setDrawColor(215); d.setLineWidth(0.2); d.rect(x, by, w, bh);
  if(mode === 'boven'){
    const ax = [], ay = []; floors.forEach(f => f.real.forEach(p => { ax.push(p[0]); ay.push(p[1]); }));
    const mnx = Math.min(...ax), mxx = Math.max(...ax), mny = Math.min(...ay), mxy = Math.max(...ay);
    const fw = (mxx - mnx) || 1, fh = (mxy - mny) || 1, s2 = Math.min((w - 2 * pad) / fw, (bh - 2 * pad) / fh);
    const ox2 = x + (w - fw * s2) / 2 - mnx * s2, oy2 = by + (bh - fh * s2) / 2 - mny * s2;
    d.setLineWidth(0.3);
    floors.forEach(f => { d.setFillColor(234, 242, 236); d.setDrawColor(70); imPdfPoly(d, f.real.map(p => [p[0] * s2 + ox2, p[1] * s2 + oy2]), 'FD'); });
    floors.forEach(f => (f.v.zones || []).forEach(z => { const g = imZoneGeom(f.v, z); if(!g) return; d.setFillColor(214, 224, 245); d.setDrawColor(122, 74, 192); imPdfPoly(d, g.region.map(p => [p[0] * s2 + ox2, p[1] * s2 + oy2]), 'FD'); }));
    return;
  }
  const as = mode === 'zij' ? 1 : 0, mirror = mode === 'achter';
  let amin = Infinity, amax = -Infinity, zmax = 0;
  floors.forEach(f => { f.real.forEach(c => { amin = Math.min(amin, c[as]); amax = Math.max(amax, c[as]); }); zmax = Math.max(zmax, f.z1); });
  const aw = (amax - amin) || 1, s = Math.min((w - 2 * pad) / aw, (bh - 2 * pad) / (zmax || 1));
  const ox = x + (w - aw * s) / 2, baseY = by + bh - pad;
  d.setLineWidth(0.3); d.setFillColor(231, 238, 241); d.setDrawColor(80);
  floors.forEach(f => {
    const vals = f.real.map(c => c[as]); let f0 = Math.min(...vals) - amin, f1 = Math.max(...vals) - amin;
    if(mirror){ const t0 = aw - f1, t1 = aw - f0; f0 = t0; f1 = t1; }
    d.rect(ox + f0 * s, baseY - f.z1 * s, (f1 - f0) * s, (f.z1 - f.z0) * s, 'FD');
  });
}
function imPdfElevations(c, x, y, w, h){
  const floors = imBuildFloors(); if(!floors.length) return false;
  const gv = key => { const o = imGevelOrient(key); return o ? ' (' + o + ')' : ''; };
  const cw = (w - 9) / 2, ch = (h - 6) / 2;
  imPdfElevBox(c.doc, floors, x, y, cw, ch, 'voor', 'Voorgevel' + gv('voor'));
  imPdfElevBox(c.doc, floors, x + cw + 9, y, cw, ch, 'achter', 'Achtergevel' + gv('achter'));
  imPdfElevBox(c.doc, floors, x, y + ch + 6, cw, ch, 'zij', 'Zijgevel' + gv('links'));
  imPdfElevBox(c.doc, floors, x + cw + 9, y + ch + 6, cw, ch, 'boven', 'Bovenaanzicht');
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
      if(c.yy > c.PH - 74){ d.addPage(); c.yy = c.M; }
      d.setFont('helvetica', 'bold'); d.setFontSize(9.5); d.setTextColor(60); d.text('Aanzichten', c.M, c.yy); d.setTextColor(0); c.yy += 2;
      const he = 68; if(imPdfElevations(c, c.M, c.yy, c.PW - 2 * c.M, he)) c.yy += he + 4;
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
