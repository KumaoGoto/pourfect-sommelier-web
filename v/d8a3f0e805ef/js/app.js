import * as THREE from './three.module.js';
const $ = id => document.getElementById(id);
const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');
const DEV = DEBUG || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const WEB = (typeof window !== 'undefined' && window.PS_WEB) || null;
Error.stackTraceLimit = 30;
window.addEventListener('error', e => {
  const d = $('err') || Object.assign(document.createElement('pre'), {id:'err'});
  if (DEV) d.textContent = String(e.message || e.error) + (DEBUG && e.error ? '\n' + e.error.stack : '');
  else { d.className = 'soft'; d.textContent = 'うまく動かないところがありました。\n続けて遊べないときは、開き直してください。\n（押すと消えます）'; d.onclick = () => d.remove(); }
  $('app').appendChild(d);
});
let lastSig = '';
const START_STAGE = Math.max(1, parseInt(QS.get('stage') || '1', 10) || 1);
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function spring(s, target, omega, dt){
  const f = 1 + 2 * dt * omega, oo = omega * omega, hoo = dt * oo, hhoo = dt * hoo, inv = 1 / (f + hhoo);
  const x = (f * s.x + dt * s.v + hhoo * target) * inv; s.v = (s.v + hoo * (target - s.x)) * inv; s.x = x;
}
const T = {
  g: 9.8,
  simDt: 1 / 240,
  tol: 0.20,
  lives: 3,
  tolLap: 0.05, tolMin: 0.10,
  share: [80, 140],
  shareCap: 0.55,
  bottleMax: 740,
  pourfect: 0.02,
  flowK: 0.030,
  flowK2: 2.2e-4,
  flowMax: 75e-6,
  flowLag: 0.045,
  exitSpeed: 0.6,
  exitMax: 0.45,
  filmKeep: 0.55,
  filmDrag: 10,
  filmAz: 8,
  filmLife: 0.45,
  glugHz: 7.2, glugAmp: 0.38,
  tokMin: 1.5,
  tokHz: [4.5, 8.5],
  tokF: 205,
  tokDip: 0.5,
  waterGain: 0.8,
  bgmGain: 0.15,
  bgmDuck: 0.5,
  bgmJudge: 0.4,
  bgmFade: 2.5,
  bgmLoop: [4.0200, 162.9684],
  bgmRate: 32000,
  bgmShelf: [12250, 10],
  dripQ: 0.6e-6,
  dropVol: 0.05e-6,
  tiltPerScreen: 60 * DEG,
  tiltBelow: 25 * DEG,
  tiltMax: 172 * DEG,
  tiltOmega: 14,
  liftOmega: 22,
  brakeOmega: 60,
  idleYB: 0.022,
  idleRimGap: 0.016,
  idleGap: 0.004,
  dodgeSpeed: 0.6,
  returnTilt: [0.35, 0.9],
  returnDone: 0.95, returnDoneTilt: 5 * DEG,
  tableClear: 0.008,
  lowerNear: 0.01,
  holdBack: 3 * DEG,
  inspectY: 0.42,
  inspectTiltPerScreen: 300 * DEG,
  sloshDrag: 0.32,
  sloshOmega: 8, sloshZeta: 0.16,
  guideStages: 0,
  pourMarks: false,
  startMark: false,
  liftAfterStop: 0.18,
  raiseDeg: 1.5 * DEG,
  autoRamp: 2.6,
  pourClear: 0.034,
  rigYawWide: 0.40,
  rigYawNarrow: 0.60,
  rowGap: 0.034,
  finaleCam: 2.6,
  judgeLead: 0.75,
  judgeRise: [0.55, 0.46, 0.34],
  judgeLast: 1.5,
  judgeGap: 0.12,
  judgeHold: 0.45,
  toastLift: 0.02, toastIn: 0.42, toastHold: 0.16, toastOut: 0.5, toastGap: 0.0006, toastKick: 0.5,
  fov: 32,
  waveAmp: 0.0011,
};
const WINES = {
  red:   { name:'赤',  sigma:[42,330,210],  scatter:[0.22,0.01,0.03], bottle:[0.74,0.90,0.74], glow:[0.040,0.105,0.050], glowA:0.26, inBottle:0.5, foam:[0.62,0.24,0.34], caustic:[1.0,0.10,0.14], dot:'#9b1d33', fill:'' },
  rose:  { name:'ロゼ', sigma:[1.8,17,19],   scatter:[0.30,0.10,0.10], bottle:[0.97,0.98,0.97], glow:[0.075,0.080,0.078], glowA:0.13, inBottle:1.4, foam:[0.95,0.72,0.74], caustic:[1.0,0.42,0.40], dot:'#e07a86', fill:'rose' },
  white: { name:'白',  sigma:[1.1,3.4,22],  scatter:[0.30,0.26,0.10], bottle:[0.96,0.98,0.95], glow:[0.075,0.082,0.072], glowA:0.13, inBottle:2.2, foam:[0.98,0.95,0.82], caustic:[1.0,0.86,0.42], dot:'#e3c86a', fill:'white' },
};
const GL = {
  bordeaux:{ name:'ボルドー',     stem:true,  bowlY:0.100, wall:0.0013, stemR:0.0042, footR:0.037, footH:0.004,
    inner:[[0,0],[0.018,0.002],[0.032,0.010],[0.040,0.024],[0.043,0.042],[0.042,0.062],[0.038,0.085],[0.0335,0.108],[0.031,0.122]] },
  burgundy:{ name:'ブルゴーニュ', stem:true,  bowlY:0.088, wall:0.0013, stemR:0.0045, footR:0.040, footH:0.004,
    inner:[[0,0],[0.022,0.002],[0.040,0.012],[0.050,0.030],[0.053,0.048],[0.050,0.068],[0.043,0.088],[0.037,0.103],[0.035,0.110]] },
  flute:   { name:'フルート',     stem:true,  bowlY:0.105, wall:0.0012, stemR:0.0035, footR:0.032, footH:0.0035,
    inner:[[0,0],[0.009,0.004],[0.018,0.018],[0.0225,0.045],[0.024,0.080],[0.0235,0.110],[0.0225,0.128]] },
  white:   { name:'チューリップ',     stem:true,  bowlY:0.090, wall:0.0012, stemR:0.0040, footR:0.034, footH:0.0035,
    inner:[[0,0],[0.016,0.002],[0.028,0.010],[0.034,0.024],[0.0355,0.040],[0.034,0.060],[0.030,0.082],[0.028,0.095]] },
  coupe:   { name:'クープ',       stem:true,  bowlY:0.105, wall:0.0014, stemR:0.0045, footR:0.040, footH:0.004,
    inner:[[0,0],[0.025,0.002],[0.042,0.010],[0.052,0.022],[0.056,0.034],[0.057,0.042]] },
  tumbler: { name:'タンブラー',   stem:false, bowlY:0.012, wall:0.0025, baseR:0.040,
    inner:[[0,0],[0.026,0],[0.034,0.002],[0.037,0.010],[0.0385,0.050],[0.040,0.085]] },
  stemless:{ name:'ステムレス',   stem:false, bowlY:0.008, wall:0.0018, baseR:0.030,
    inner:[[0,0],[0.020,0],[0.034,0.010],[0.041,0.030],[0.042,0.050],[0.039,0.075],[0.034,0.095],[0.032,0.102]] },
  port:    { name:'ポート',       stem:true,  bowlY:0.075, wall:0.0012, stemR:0.0038, footR:0.030, footH:0.0035,
    inner:[[0,0],[0.014,0.002],[0.024,0.012],[0.028,0.028],[0.027,0.045],[0.023,0.062],[0.0205,0.070]] },
  hourglass:{ name:'砂時計',      weird:true, stem:false, bowlY:0.010, wall:0.0018, baseR:0.040,
    inner:[[0,0],[0.028,0],[0.038,0.008],[0.041,0.030],[0.030,0.060],[0.015,0.085],[0.015,0.095],[0.030,0.120],[0.041,0.148],[0.043,0.165]] },
  martini: { name:'マティーニ',   weird:true, stem:true,  bowlY:0.115, wall:0.0014, stemR:0.0040, footR:0.042, footH:0.004,
    inner:[[0,0],[0.004,0.0012],[0.020,0.020],[0.040,0.041],[0.058,0.062],[0.060,0.065]] },
  fishbowl:{ name:'金魚鉢',       weird:true, stem:false, bowlY:0.012, wall:0.0020, baseR:0.030,
    inner:[[0,0],[0.020,0.004],[0.038,0.016],[0.050,0.034],[0.055,0.055],[0.050,0.076],[0.038,0.094],[0.025,0.104],[0.022,0.110],[0.023,0.116]] },
  tube:    { name:'試験管',       weird:true, stem:false, bowlY:0.020, wall:0.0015, baseR:0.028,
    inner:[[0,0],[0.010,0.001],[0.0165,0.006],[0.018,0.020],[0.018,0.205]] },
  flask:   { name:'フラスコ',     weird:true, stem:false, bowlY:0.006, wall:0.0018, baseR:0.052,
    inner:[[0,0],[0.044,0],[0.051,0.004],[0.053,0.011],[0.040,0.045],[0.024,0.080],[0.0165,0.096],[0.016,0.135]] },
  twin:    { name:'ふたこぶ',     weird:true, stem:true,  bowlY:0.085, wall:0.0013, stemR:0.0040, footR:0.034, footH:0.004,
    inner:[[0,0],[0.016,0.002],[0.026,0.012],[0.030,0.026],[0.026,0.040],[0.015,0.050],[0.015,0.055],[0.028,0.066],[0.036,0.082],[0.034,0.100],[0.026,0.112],[0.024,0.118]] },
  saucer:  { name:'平皿',         weird:true, stem:true,  bowlY:0.062, wall:0.0015, stemR:0.0045, footR:0.040, footH:0.004,
    inner:[[0,0],[0.040,0.002],[0.062,0.008],[0.070,0.016],[0.073,0.024]] },
  wave:    { name:'なみなみ',     weird:true, stem:false, bowlY:0.010, wall:0.0018, baseR:0.030,
    inner:[[0,0],[0.022,0],[0.028,0.006],[0.031,0.030],[0.024,0.052],[0.035,0.078],[0.026,0.102],[0.036,0.126],[0.035,0.142]] },
};
const CLASSIC = ['bordeaux','burgundy','flute','white','coupe','tumbler','stemless','port'];
const WEIRD = ['hourglass','martini','fishbowl','tube','flask','twin','saucer','wave'];
function crDense(P, n){
  const m = P.length, out = [];
  const get = i => i < 0 ? [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]] : i >= m ? [2 * P[m-1][0] - P[m-2][0], 2 * P[m-1][1] - P[m-2][1]] : P[i];
  for (let i = 0; i < m - 1; i++){
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < n; k++){
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(P[m-1].slice());
  out[0][0] = Math.max(0, out[0][0]); out[0][1] = P[0][1];
  for (let i = 1; i < out.length; i++){ out[i][0] = Math.max(0, out[i][0]); if (out[i][1] < out[i-1][1] + 1e-6) out[i][1] = out[i-1][1] + 1e-6; }
  return out;
}
function makeRFn(dense){
  const n = dense.length, Y = new Float64Array(n), R = new Float64Array(n);
  dense.forEach((p, i) => { R[i] = p[0]; Y[i] = p[1]; });
  return y => {
    if (y <= Y[0]) return R[0]; if (y >= Y[n-1]) return R[n-1];
    let lo = 0, hi = n - 1; while (hi - lo > 1){ const mid = (lo + hi) >> 1; if (Y[mid] <= y) lo = mid; else hi = mid; }
    return R[lo] + (R[hi] - R[lo]) * (y - Y[lo]) / (Y[hi] - Y[lo]);
  };
}
function offsetOut(pts, w){
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
    return [p[0] + ty * w, p[1] - tx * w];
  });
}
const v2s = P => P.map(p => new THREE.Vector2(p[0], p[1]));
const TYPES = {};
function glassType(id){
  if (TYPES[id]) return TYPES[id];
  const d = GL[id];
  const dense = crDense(d.inner, 6), rFn = makeRFn(dense);
  const depth = dense[dense.length - 1][1], rimR = dense[dense.length - 1][0];
  const inAbs = crDense(d.inner, 4).map(p => [p[0], p[1] + d.bowlY]);
  const outAbs = offsetOut(inAbs, d.wall);
  const P = [];
  if (d.stem){
    const fr = d.footR, fh = d.footH, sr = d.stemR;
    P.push([0,0],[fr*0.985,0],[fr,0.0012],[fr*0.99,fh*0.8],[fr*0.8,fh],[fr*0.45,fh*1.3],[sr*2.0,fh+0.003],[sr*1.15,fh+0.009]);
    const fi = outAbs.findIndex(p => p[0] > sr * 1.7);
    const stemTop = Math.max(fh + 0.014, outAbs[fi][1] - 0.006);
    P.push([sr,(fh+0.009+stemTop)/2],[sr*1.05,stemTop-0.002],[sr*1.4,stemTop+0.002]);
    for (let i = fi; i < outAbs.length; i++) if (outAbs[i][1] > P[P.length-1][1] + 0.0003) P.push(outAbs[i]);
  } else {
    const br = d.baseR;
    P.push([0,0],[br-0.0015,0],[br,0.0015]);
    for (const o of outAbs){ const last = P[P.length-1]; if (o[1] > last[1] + 0.0005 && (o[0] > br * 0.85 || o[1] > d.bowlY + 0.01)) P.push(o); }
  }
  const oR = outAbs[outAbs.length-1], iR = inAbs[inAbs.length-1];
  if (P[P.length-1] !== oR) P.push(oR);
  const oTab = new Float32Array(Math.ceil(oR[1] / 0.001) + 2);
  for (let i = 1; i < P.length; i++){
    const a = P[i-1], b = P[i], r = Math.max(a[0], b[0]);
    const k1 = Math.min(oTab.length - 1, Math.floor(Math.max(a[1], b[1]) / 0.001));
    for (let k = Math.max(0, Math.floor(Math.min(a[1], b[1]) / 0.001)); k <= k1; k++) if (r > oTab[k]) oTab[k] = r;
  }
  const cx = (oR[0] + iR[0]) / 2, cy = (oR[1] + iR[1]) / 2; let ux = oR[0] - cx, uy = oR[1] - cy; const rad = Math.hypot(ux, uy); ux /= rad; uy /= rad;
  for (let k = 1; k <= 6; k++){ const a = k / 7 * Math.PI; P.push([cx + rad * (Math.cos(a) * ux - Math.sin(a) * uy), cy + rad * (Math.cos(a) * uy + Math.sin(a) * ux)]); }
  for (let i = inAbs.length - 1; i >= 0; i--) P.push(inAbs[i]);
  const glassGeo = new THREE.LatheGeometry(v2s(P), 56);
  const wineGeo = new THREE.LatheGeometry(v2s(dense.map(p => [Math.max(0, p[0] - 0.0006), d.bowlY + p[1] + 0.0003])), 48);
  const dy = 0.0002, N = Math.ceil(depth / dy) + 1, vt = new Float64Array(N);
  for (let i = 1; i < N; i++){ const r = rFn(Math.min((i - 0.5) * dy, depth)); vt[i] = vt[i-1] + Math.PI * r * r * dy; }
  const cap = vt[N-1] * 1e6;
  const yAtVol = ml => {
    const v = ml * 1e-6; if (v <= 0) return 0; if (v >= vt[N-1]) return depth;
    let lo = 0, hi = N - 1; while (hi - lo > 1){ const mid = (lo + hi) >> 1; if (vt[mid] <= v) lo = mid; else hi = mid; }
    return (lo + (v - vt[lo]) / (vt[hi] - vt[lo])) * dy;
  };
  const outerR = Math.max(...P.map(p => p[0]));
  return TYPES[id] = { id, d, name: d.name, rFn, depth, rimR, rimY: d.bowlY + depth, cap, yAtVol, glassGeo, wineGeo, outerR, outerRimR: oR[0], oTab };
}
const BOT = (() => {
  const OUT = [[0,0.024],[0.010,0.021],[0.020,0.012],[0.027,0.004],[0.031,0.0005],[0.034,0],[0.0368,0.003],[0.0375,0.012],[0.0375,0.120],[0.0375,0.198],[0.0358,0.214],[0.030,0.229],[0.0215,0.244],[0.0162,0.258],[0.0148,0.272],[0.0146,0.2855]];
  const LIP = [[0.0152,0.2868],[0.0168,0.2888],[0.0171,0.2965],[0.0163,0.2998],[0.0130,0.3003],[0.0103,0.2993],[0.0098,0.2970]];
  const IN  = [[0.0096,0.285],[0.0102,0.265],[0.0130,0.254],[0.0195,0.241],[0.0275,0.226],[0.0330,0.212],[0.0346,0.199],[0.0346,0.120],[0.0346,0.016],[0.0322,0.007],[0.027,0.0075],[0.019,0.015],[0.010,0.024],[0,0.0285]];
  const glassGeo = new THREE.LatheGeometry(v2s([...OUT, ...LIP, ...IN]), 56);
  const wineGeo = new THREE.LatheGeometry(v2s([[0,0.0289],[0.010,0.0244],[0.019,0.0154],[0.027,0.0079],[0.0318,0.0074],[0.0342,0.016],[0.0342,0.120],[0.0342,0.199],[0.0326,0.212],[0.0271,0.226],[0.0191,0.241],[0.0126,0.254],[0.0098,0.265],[0.0092,0.285],[0.0094,0.2985]]), 48);
  const L = 0.300, RM = 0.0098;
  const bFn = makeRFn([[0.0322,0.007],[0.0346,0.016],[0.0346,0.199],[0.0330,0.212],[0.0275,0.226],[0.0195,0.241],[0.0130,0.254],[0.0102,0.265],[0.0096,0.285],[0.0098,0.297],[0.0100,0.300]]);
  const aFn = makeRFn([[0.0322,0.007],[0.027,0.0075],[0.019,0.015],[0.010,0.024],[0,0.0285]]);
  const du = 0.0015, ds = 0.0018, U = [], S = [], W = [];
  for (let y = 0.007 + du / 2; y < L; y += du){
    const b = bFn(y), a = y < 0.0285 ? aFn(y) : 0;
    for (let s = -0.0346 + ds / 2; s < 0.0346; s += ds){
      if (Math.abs(s) >= b) continue;
      let ch = 2 * Math.sqrt(b * b - s * s); if (Math.abs(s) < a) ch -= 2 * Math.sqrt(a * a - s * s);
      if (ch <= 0) continue;
      U.push(L - y); S.push(s); W.push(ch * du * ds);
    }
  }
  const n = U.length, Uu = Float32Array.from(U), Ss = Float32Array.from(S), Ww = Float64Array.from(W);
  const total = Ww.reduce((a, b) => a + b, 0);
  const HMIN = -0.33, HB = 0.0005, NB = 1320, hist = new Float64Array(NB);
  function levelAt(th, V){
    if (V <= 0) return -1;
    const c = Math.cos(th), s = Math.sin(th);
    hist.fill(0);
    for (let i = 0; i < n; i++){ const h = -Uu[i] * c + Ss[i] * s; let b = ((h - HMIN) / HB) | 0; if (b < 0) b = 0; else if (b >= NB) b = NB - 1; hist[b] += Ww[i]; }
    let acc = 0;
    for (let b = 0; b < NB; b++){ const w = hist[b]; if (acc + w >= V){ return HMIN + (b + (w > 0 ? (V - acc) / w : 0)) * HB; } acc += w; }
    return HMIN + NB * HB;
  }
  const lipLow = th => -RM * Math.abs(Math.sin(th));
  function readyAngle(V){
    if (V <= 1e-9) return 150 * DEG;
    let lo = 0, hi = Math.PI;
    for (let k = 0; k < 22; k++){ const mid = (lo + hi) / 2; if (levelAt(mid, V) - lipLow(mid) + 0.0015 < 0) lo = mid; else hi = mid; }
    return lo;
  }
  const rOut = makeRFn(OUT.slice(5));
  const rOutAt = y => y > 0.2855 ? 0.0171 : rOut(y);
  return { glassGeo, wineGeo, L, RM, levelAt, lipLow, readyAngle, total, R: 0.0375, rOut, rOutAt };
})();
function uprightReach(ty, yB){
  const h = 0.001, tab = ty.oTab; let m = 0;
  for (let k = Math.max(0, Math.floor(yB / h)); k < tab.length; k++){
    const y0 = k * h - yB; if (y0 > BOT.L) break;
    if (tab[k] > 0) m = Math.max(m, tab[k] + Math.max(BOT.rOutAt(y0), BOT.rOutAt(y0 + h)));
  }
  return m;
}
const cv = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio || 1, parseFloat(QS.get('dpr') || '2'));
renderer.setPixelRatio(DPR);
renderer.autoClear = false;
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const L_OPAQUE = 1, L_WINE = 2, L_BACK = 3, L_FX = 4;
const scene = new THREE.Scene();
scene.matrixWorldAutoUpdate = false;
scene.fog = new THREE.Fog(0x1a0d09, 1.5, 3.3);
const cam = new THREE.PerspectiveCamera(T.fov, 1, 0.05, 10);
const sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
const backRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
function canvasTex(w, h, draw, srgb = true){
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const rnd = mulberry32(20261108);
const envTex = canvasTex(1024, 512, (g, W, H) => {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#2e2119'); gr.addColorStop(0.30, '#3b291e'); gr.addColorStop(0.47, '#22150f'); gr.addColorStop(0.50, '#5c4637');
  gr.addColorStop(0.56, '#8a7b69'); gr.addColorStop(1, '#a3947f');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const box = (cx, cy, w, h, col, blur) => { g.fillStyle = col; for (let i = 7; i >= 0; i--){ const e = blur * i / 7; g.globalAlpha = i === 0 ? 1 : 0.11; g.fillRect(cx - w/2 - e, cy - h/2 - e, w + 2*e, h + 2*e); } g.globalAlpha = 1; };
  box(850, 150, 120, 66, '#fff7ea', 20);
  box(652, 205, 24, 150, '#ffeacc', 10);
  box(925, 228, 18, 110, '#ffe3c2', 8);
  box(256, 118, 210, 40, '#ffd9a8', 24);
  box(120, 210, 60, 26, '#ffcf96', 12);
  for (let i = 0; i < 18; i++){ const x = rnd() * W, y = 40 + rnd() * 170, r = 4 + rnd() * 10; const rg = g.createRadialGradient(x, y, 0, x, y, r * 3); rg.addColorStop(0, 'rgba(255,214,150,1)'); rg.addColorStop(0.3, 'rgba(255,190,120,.5)'); rg.addColorStop(1, 'rgba(255,170,100,0)'); g.fillStyle = rg; g.fillRect(x - r*3, y - r*3, r*6, r*6); }
});
envTex.mapping = THREE.EquirectangularReflectionMapping; envTex.wrapS = THREE.RepeatWrapping;
scene.environmentIntensity = 0.32;
const ENV_BOOST = 1.0, ENV_HOT = 4.0;
const envCubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const envBake = new THREE.Scene(), envCubeCam = new THREE.CubeCamera(0.1, 10, envCubeRT);
envBake.add(new THREE.Mesh(new THREE.SphereGeometry(5, 64, 32), new THREE.ShaderMaterial({
    uniforms: { uEq: { value: envTex } }, side: THREE.BackSide, depthTest: false, depthWrite: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D uEq; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir);
        vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
        vec3 c = texture2D(uEq, uv).rgb; gl_FragColor = vec4(c * ${ENV_BOOST.toFixed(2)} + pow(c, vec3(8.0)) * ${ENV_HOT.toFixed(2)}, 1.0); }` })));
let envLightRT = null;
function bakeEnv(){
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromEquirectangular(envTex);
  pm.dispose();
  if (envLightRT) envLightRT.dispose();
  envLightRT = rt; scene.environment = rt.texture;
  envCubeCam.update(renderer, envBake);
  renderer.setRenderTarget(null);
}
bakeEnv();
cv.addEventListener('webglcontextrestored', () => { bakeEnv(); dropsWarmed = false; lastSig = ''; });
const ENV_GLSL =  `
uniform samplerCube uEnvCube; uniform vec3 uKeyDir;
vec3 envLookup(vec3 d){ return textureCube(uEnvCube, d).rgb; }`;
const VS =  `
varying vec3 vWorldPos; varying vec3 vNormalW; varying vec3 vViewPos;
#include <common>
void main(){
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  vWorldPos = wp.xyz; vViewPos = mvPosition.xyz;
  vNormalW = normalize(inverseTransformDirection(transformedNormal, viewMatrix));
}`;
const FS_WINE =  `
uniform sampler2D tScene; uniform sampler2D tBack; uniform vec2 uRes;
uniform vec3 uSigma; uniform vec3 uScatter; uniform float uRefract; uniform float uClipY; uniform vec3 uClipN; uniform float uCap; uniform vec3 uBacklight; uniform float uSigmaScale;
varying vec3 vWorldPos; varying vec3 vNormalW; varying vec3 vViewPos;
${ENV_GLSL}
void main(){
  if (dot(uClipN, vWorldPos) > uClipY) discard;
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec2 suv = gl_FragCoord.xy / uRes;
  float front = length(vViewPos), th;
  if (uCap > 0.5 && !gl_FrontFacing){
    N = uClipN;
    float t = (uClipY - dot(uClipN, cameraPosition)) / min(dot(uClipN, -V), -1e-4);
    th = clamp(front - t, 0.0005, 0.25);
  } else {
    if (dot(N, V) < 0.0) N = -N;
    float back = texture2D(tBack, suv).r;
    th = back > 0.0 ? clamp(back - front, 0.0005, 0.2) : 0.004;
  }
  vec3 Nv = normalize((viewMatrix * vec4(N, 0.0)).xyz);
  vec2 off = -Nv.xy * uRefract * (0.25 + min(th, 0.05) * 14.0) * vec2(uRes.y / uRes.x, 1.0);
  vec3 bg = max(texture2D(tScene, clamp(suv + off, 0.001, 0.999)).rgb, uBacklight);
  vec3 Tr = exp(-uSigma * uSigmaScale * th);
  vec3 col = bg * Tr + uScatter * (1.0 - exp(-th * 25.0)) * 0.30;
  float NV = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - NV, 5.0);
  vec3 R = reflect(-V, N);
  float sp = max(dot(R, uKeyDir), 0.0);
  col = mix(col, envLookup(R), F) + vec3(1.0, 0.96, 0.9) * (pow(sp, 700.0) * 5.0 + pow(sp, 80.0) * 0.12);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const FS_BACK =  `
uniform float uClipY; uniform vec3 uClipN; varying vec3 vWorldPos; varying vec3 vNormalW; varying vec3 vViewPos;
void main(){ if (dot(uClipN, vWorldPos) > uClipY) discard; gl_FragColor = vec4(length(vViewPos), 0.0, 0.0, 1.0); }`;
const FS_FILTER =  `
uniform vec3 uFilter; varying vec3 vWorldPos; varying vec3 vNormalW; varying vec3 vViewPos;
void main(){
  vec3 N = normalize(vNormalW), V = normalize(cameraPosition - vWorldPos);
  gl_FragColor = vec4(pow(uFilter, vec3(1.0 / max(abs(dot(N, V)), 0.22))), 1.0);
  #include <colorspace_fragment>
}`;
const FS_GLASS =  `
uniform vec3 uTint; uniform float uBaseA; uniform float uEdgeA; uniform float uRefl; uniform float uLevel; uniform vec3 uLevelN; uniform float uBelowA;
varying vec3 vWorldPos; varying vec3 vNormalW; varying vec3 vViewPos;
${ENV_GLSL}
void main(){
  vec3 N = normalize(vNormalW); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorldPos);
  float NV = abs(dot(N, V));
  float F = 0.04 + 0.96 * pow(1.0 - NV, 5.0);
  vec3 R = reflect(-V, N);
  float sp = max(dot(R, uKeyDir), 0.0);
  float edge = pow(1.0 - NV, 2.2);
  float a = clamp(uBaseA * mix(uBelowA, 1.0, smoothstep(uLevel - 0.0015, uLevel + 0.0015, dot(uLevelN, vWorldPos))) + edge * uEdgeA + F * 0.35, 0.0, 0.96);
  float aa = clamp(length(fwidth(vNormalW)) * 5.0, 0.0, 1.0);
  vec3 col = envLookup(R) * F * uRefl + vec3(1.0, 0.97, 0.92) * pow(sp, mix(900.0, 60.0, aa)) * mix(7.0, 0.8, aa) + uTint * a;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const keyDir = new THREE.Vector3(-0.4, 0.6, 0.7).normalize();
const ENVU = { uEnvCube: { value: envCubeRT.texture }, uKeyDir: { value: keyDir } };
const WU = { ...ENVU, tScene: { value: sceneRT.texture }, tBack: { value: backRT.texture }, uRes: { value: new THREE.Vector2(4, 4) },
  uSigma: { value: new THREE.Vector3(...WINES.red.sigma) }, uScatter: { value: new THREE.Vector3(...WINES.red.scatter) }, uRefract: { value: 0.03 } };
const UP_N = { value: new THREE.Vector3(0, 1, 0) };
const wineMat = (clipU, cap = false, clipN = UP_N) => new THREE.ShaderMaterial({ uniforms: { ...WU, uClipY: clipU, uClipN: clipN, uCap: { value: cap ? 1 : 0 },
  uBacklight: { value: cap ? new THREE.Vector3(0.62, 0.50, 0.34) : new THREE.Vector3(0, 0, 0) }, uSigmaScale: { value: cap ? 0.5 : 1 } },
  vertexShader: VS, fragmentShader: FS_WINE, side: cap ? THREE.DoubleSide : THREE.FrontSide });
const backMat = (clipU, clipN = UP_N) => new THREE.ShaderMaterial({ uniforms: { uClipY: clipU, uClipN: clipN }, vertexShader: VS, fragmentShader: FS_BACK, side: THREE.BackSide });
const premul = m => Object.assign(m, { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation });
const glassMatMake = (tint, baseA, edgeA, refl, levelU = { value: -10 }, belowA = 1, levelN = UP_N) => premul(new THREE.ShaderMaterial({
  uniforms: { ...ENVU, uTint: { value: new THREE.Vector3(...tint) }, uBaseA: { value: baseA }, uEdgeA: { value: edgeA }, uRefl: { value: refl }, uLevel: levelU, uLevelN: levelN, uBelowA: { value: belowA } },
  vertexShader: VS, fragmentShader: FS_GLASS, side: THREE.DoubleSide }));
const glassMat = glassMatMake([0.04, 0.045, 0.05], 0.025, 0.30, 1.1);
const NO_CLIP = { value: 1e3 };
const hemi = new THREE.HemisphereLight(0xffe6c8, 0x3a2016, 0.35); hemi.layers.enableAll(); scene.add(hemi);
const spot = new THREE.SpotLight(0xffd9a6, 5.5, 0, 0.5, 0.95, 1.6); spot.position.set(-0.35, 1.55, -0.85); spot.layers.enableAll(); scene.add(spot); scene.add(spot.target); spot.target.position.set(0, 0, 0.15);
const fill = new THREE.DirectionalLight(0xffefe0, 0.22); fill.position.set(0.5, 1, 1.2); fill.layers.enableAll(); scene.add(fill);
const linen = canvasTex(512, 512, (g, W, H) => {
  g.fillStyle = '#ece5d9'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2200; i++){ const y = rnd() * H, a = 0.012 + rnd() * 0.03; g.fillStyle = rnd() < .5 ? `rgba(110,90,70,${a})` : `rgba(255,255,255,${a})`; g.fillRect(0, y, W, 1); }
  for (let i = 0; i < 2200; i++){ const x = rnd() * W, a = 0.012 + rnd() * 0.026; g.fillStyle = rnd() < .5 ? `rgba(110,90,70,${a})` : `rgba(255,255,255,${a})`; g.fillRect(x, 0, 1, H); }
});
linen.wrapS = linen.wrapT = THREE.RepeatWrapping; linen.repeat.set(25, 22);
const table = new THREE.Mesh(new THREE.PlaneGeometry(9, 8), new THREE.MeshStandardMaterial({ map: linen, color: 0xf6efe4, roughness: 0.93 }));
table.rotation.x = -Math.PI / 2; table.position.set(0, -0.0006, 2.0); table.layers.set(L_OPAQUE); scene.add(table);
const backdropTex = canvasTex(2048, 1024, (g, W, H) => {
  const sw = 256, sh = 128, sc = document.createElement('canvas'); sc.width = sw; sc.height = sh; const s = sc.getContext('2d');
  const gr = s.createLinearGradient(0, 0, 0, sh);
  gr.addColorStop(0, '#0f0706'); gr.addColorStop(0.3, '#22120c'); gr.addColorStop(0.55, '#33200f'); gr.addColorStop(0.8, '#1f120c'); gr.addColorStop(1, '#170c09');
  s.fillStyle = gr; s.fillRect(0, 0, sw, sh);
  for (let x = 0; x < sw; x += 22){ s.fillStyle = 'rgba(255,200,150,.025)'; s.fillRect(x, 0, 2, sh); }
  const glow = (ctx, x, y, r, c0, c1) => { const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, c0); rg.addColorStop(1, c1); ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); };
  for (const x of [0.1, 0.37, 0.63, 0.9]) glow(s, x * sw, 0.36 * sh, 40, 'rgba(255,165,85,.34)', 'rgba(255,150,80,0)');
  for (const [y0, y1] of [[0.44, 0.58], [0.60, 0.74]]){
    s.fillStyle = 'rgba(8,4,3,.55)'; s.fillRect(16, y0 * sh, sw - 32, (y1 - y0) * sh);
    for (let x = 20; x < sw - 20; x += 3 + rnd() * 2){
      const h = (y1 - y0) * sh * (0.7 + rnd() * 0.25), c = rnd() < 0.6 ? [22, 34, 20] : [48, 20, 16];
      s.fillStyle = `rgba(${c},.95)`; s.fillRect(x, y1 * sh - h, 2.2, h);
      if (rnd() < 0.35){ s.fillStyle = 'rgba(255,190,120,.35)'; s.fillRect(x + 0.4, y1 * sh - h + 1, 0.6, h * 0.4); }
    }
    s.fillStyle = 'rgba(120,80,50,.5)'; s.fillRect(16, y1 * sh, sw - 32, 1.2);
  }
  glow(s, 0.83 * sw, 0.5 * sh, 26, 'rgba(255,200,130,.30)', 'rgba(255,180,110,0)');
  s.fillStyle = 'rgba(255,190,120,.10)'; s.fillRect(0.79 * sw, 0.22 * sh, 0.08 * sw, 0.5 * sh);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(sc, 0, 0, W, H);
  for (const x of [0.2, 0.45, 0.7, 0.93]) glow(g, x * W, 0.10 * H, 80, 'rgba(255,215,150,.85)', 'rgba(255,190,120,0)');
  for (let i = 0; i < 46; i++){
    const x = rnd() * W, y = (0.18 + rnd() * 0.42) * H, r = 18 + rnd() * 46, warm = rnd() < 0.9;
    const a = 0.05 + rnd() * 0.12, col = warm ? [255, 175 + rnd() * 50 | 0, 100 + rnd() * 50 | 0] : [180, 200, 255];
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${col},${a * 0.6})`); rg.addColorStop(0.86, `rgba(${col},${a})`); rg.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
});
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.4), new THREE.MeshBasicMaterial({ map: backdropTex, fog: false }));
backdrop.position.set(0, 1.25, -2.0); backdrop.layers.set(L_OPAQUE); scene.add(backdrop);
const blobTex = canvasTex(128, 128, (g, W, H) => { const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.45, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); }, false);
const decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ map: blobTex, color: 0x1a0c08, transparent: true, opacity: 0.38, depthWrite: false });
const SR = 14, SS = 48;
function makeSurfaceGeo(){
  const n = 1 + SR * SS, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let j = 0; j < SS; j++) idx.push(0, 1 + (j + 1) % SS, 1 + j);
  for (let i = 1; i < SR; i++) for (let j = 0; j < SS; j++){ const a = 1 + (i-1)*SS + j, b = 1 + (i-1)*SS + (j+1)%SS, c = 1 + i*SS + j, d = 1 + i*SS + (j+1)%SS; idx.push(a, b, c, b, d, c); }
  g.setIndex(idx); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.12);
  return g;
}
const SRHO = new Float32Array(1 + SR * SS), SPHI = new Float32Array(1 + SR * SS);
for (let i = 1; i <= SR; i++) for (let j = 0; j < SS; j++){ const k = 1 + (i-1)*SS + j; SRHO[k] = i / SR; SPHI[k] = j / SS * TAU; }
const WN = 36;
function makeWave(){
  const m = new Uint8Array(WN * WN);
  for (let j = 0; j < WN; j++) for (let i = 0; i < WN; i++){ const x = i / (WN-1) * 2 - 1, z = j / (WN-1) * 2 - 1; m[j*WN+i] = (x*x + z*z <= 1.02 && i > 0 && j > 0 && i < WN-1 && j < WN-1) ? 1 : 0; }
  return { a: new Float32Array(WN * WN), b: new Float32Array(WN * WN), m, energy: 0 };
}
function waveStep(w){
  const a = w.a, b = w.b, m = w.m; let e = 0, sum = 0, cnt = 0;
  for (let j = 1; j < WN - 1; j++) for (let i = 1; i < WN - 1; i++){
    const k = j * WN + i; if (!m[k]){ b[k] = 0; continue; }
    const c = a[k], lap = (m[k-1] ? a[k-1] : c) + (m[k+1] ? a[k+1] : c) + (m[k-WN] ? a[k-WN] : c) + (m[k+WN] ? a[k+WN] : c) - 4 * c;
    const nv = (2 * c - b[k] + 0.32 * lap) * 0.986; b[k] = nv; e += nv * nv; sum += nv; cnt++;
  }
  const mean = cnt ? sum / cnt : 0; if (mean) for (let k = 0; k < WN * WN; k++) if (m[k]) b[k] -= mean;
  w.a = b; w.b = a; w.energy = e;
}
function waveKick(w, x, z, s){
  const gx = (x + 1) / 2 * (WN - 1), gz = (z + 1) / 2 * (WN - 1);
  for (let j = Math.max(1, gz - 2 | 0); j <= Math.min(WN - 2, gz + 2 | 0); j++) for (let i = Math.max(1, gx - 2 | 0); i <= Math.min(WN - 2, gx + 2 | 0); i++){
    const k = j * WN + i; if (!w.m[k]) continue; const d2 = (i - gx) ** 2 + (j - gz) ** 2; w.a[k] -= s * Math.exp(-d2 / 1.6);
  }
}
function waveSample(w, x, z){
  const gx = clamp((x + 1) / 2 * (WN - 1), 0, WN - 1.001), gz = clamp((z + 1) / 2 * (WN - 1), 0, WN - 1.001);
  const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, a = w.a, k = j * WN + i;
  return (a[k] * (1 - fx) + a[k+1] * fx) * (1 - fz) + (a[k+WN] * (1 - fx) + a[k+WN+1] * fx) * fz;
}
function makeGlass(id, x, i){
  const ty = glassType(id);
  const passD = uprightReach(ty, T.idleYB) + T.idleGap;
  const grp = new THREE.Group(); grp.position.set(x, 0, 0); scene.add(grp);
  const gm = new THREE.Mesh(ty.glassGeo, glassMat); gm.layers.set(L_FX); grp.add(gm);
  const clipU = { value: -1 };
  const wf = new THREE.Mesh(ty.wineGeo, wineMat(clipU)); wf.layers.set(L_WINE); grp.add(wf);
  const wb = new THREE.Mesh(ty.wineGeo, backMat(clipU)); wb.layers.set(L_BACK); grp.add(wb);
  const sg = makeSurfaceGeo(); const sm = new THREE.Mesh(sg, surfMat); sm.layers.set(L_WINE); grp.add(sm);
  const R = ty.outerR;
  const sh = new THREE.Mesh(decalGeo, shadowMat); sh.position.set(0.004, 0.0006, 0.028); sh.scale.set(R * 2.7, 1, R * 3.6); sh.layers.set(L_OPAQUE); grp.add(sh);
  const cm = new THREE.MeshBasicMaterial({ map: blobTex, color: 0xff2030, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const ca = new THREE.Mesh(decalGeo, cm); ca.position.set(0.006, 0.0009, 0.05); ca.layers.set(L_OPAQUE); grp.add(ca);
  return { i, id, ty, grp, x, passD, vol: 0, yl: 0, clipU, wf, wb, sm, sg, sh, ca, cm, wave: makeWave(), waveAcc: 0, dirty: true, overflow: false, inflow: 0 };
}
function disposeGlass(G){
  scene.remove(G.grp); G.wf.material.dispose(); G.wb.material.dispose(); G.sg.dispose(); G.cm.dispose();
}
function updateGlassVisual(G, dt){
  const ty = G.ty, d = ty.d;
  G.yl = ty.yAtVol(G.vol);
  const has = G.vol > 0.03;
  G.wf.visible = G.wb.visible = G.sm.visible = has;
  const baseY = G.grp.position.y + d.bowlY;
  G.clipU.value = baseY + G.yl + 0.0003;
  if (has && (G.dirty || G.wave.energy > 1e-7)){
    G.dirty = false; lastSig = '';
    const R = Math.max(0.0005, ty.rFn(G.yl) - 0.0006), y = d.bowlY + G.yl + 0.0003;
    const pos = G.sg.attributes.position.array, nor = G.sg.attributes.normal.array, w = G.wave, A = T.waveAmp, e = 0.03;
    for (let k = 0; k < SRHO.length; k++){
      const r = SRHO[k], x = r * Math.cos(SPHI[k]), z = r * Math.sin(SPHI[k]);
      const fade = 1 - Math.pow(r, 8);
      const h = waveSample(w, x, z) * A * fade;
      const hx = (waveSample(w, x + e, z) - waveSample(w, x - e, z)) / (2 * e) * A * fade / R;
      const hz = (waveSample(w, x, z + e) - waveSample(w, x, z - e)) / (2 * e) * A * fade / R;
      pos[k*3] = x * R; pos[k*3+1] = y + h; pos[k*3+2] = z * R;
      const nl = Math.hypot(hx, 1, hz); nor[k*3] = -hx / nl; nor[k*3+1] = 1 / nl; nor[k*3+2] = -hz / nl;
    }
    G.sg.attributes.position.needsUpdate = true; G.sg.attributes.normal.needsUpdate = true;
  }
  const fillR = has ? ty.rFn(G.yl) : 0;
  const k = smooth(0, 0.03, G.yl) * 0.55;
  G.cm.opacity = k;
  G.ca.scale.set(Math.max(0.01, fillR * 1.5), 1, Math.max(0.01, fillR * 2.4));
  G.ca.position.z = 0.03 + d.bowlY * 0.25 + G.yl * 0.2;
  G.sh.position.y = 0.0006 - G.grp.position.y; G.ca.position.y = 0.0009 - G.grp.position.y;
}
const rig = new THREE.Group(); scene.add(rig);
const pivot = new THREE.Group(); rig.add(pivot);
const bottle = new THREE.Group(); bottle.position.y = -BOT.L; pivot.add(bottle);
const bottleFilterMat = new THREE.ShaderMaterial({ uniforms: { uFilter: { value: new THREE.Vector3(...WINES.red.bottle) } }, vertexShader: VS, fragmentShader: FS_FILTER,
  side: THREE.DoubleSide, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, blendEquation: THREE.AddEquation });
const bottleFilter = new THREE.Mesh(BOT.glassGeo, bottleFilterMat); bottleFilter.layers.set(L_FX); bottle.add(bottleFilter);
const bClip = { value: -10 }, bClipN = { value: new THREE.Vector3(0, 1, 0) };
const bottleShine = new THREE.Mesh(BOT.glassGeo, glassMatMake(WINES.red.glow, WINES.red.glowA, 0.18, 0.9, bClip, 0.08, bClipN)); bottleShine.layers.set(L_FX); bottle.add(bottleShine);
const bWineF = new THREE.Mesh(BOT.wineGeo, wineMat(bClip, true, bClipN)); bWineF.layers.set(L_WINE); bottle.add(bWineF);
const bWineB = new THREE.Mesh(BOT.wineGeo, backMat(bClip, bClipN)); bWineB.layers.set(L_BACK); bottle.add(bWineB);
const stopper = new THREE.Group(); stopper.position.y = BOT.L; bottle.add(stopper);
{
  const cork = new THREE.MeshStandardMaterial({ color: 0xb48c5c, roughness: 0.85 }), wood = new THREE.MeshStandardMaterial({ color: 0x3b2417, roughness: 0.45, metalness: 0.05 });
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0092, 0.014, 24), cork); shank.position.y = -0.002;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0132, 0.0148, 0.012, 40), wood); cap.position.y = 0.0105;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.0132, 32, 8, 0, TAU, 0, Math.PI / 2), wood); top.scale.y = 0.28; top.position.y = 0.0165;
  for (const m of [shank, cap, top]){ m.layers.set(L_OPAQUE); stopper.add(m); }
}
const foil = new THREE.Mesh(new THREE.CylinderGeometry(0.0151, 0.0149, 0.013, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0x6a1020, metalness: 0.75, roughness: 0.32 }));
foil.position.y = 0.2795; foil.layers.set(L_OPAQUE); bottle.add(foil);
let labelTex = null;
function drawLabel(g, W, H){
  g.fillStyle = '#efe4cc'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 3400; i++){ g.fillStyle = `rgba(120,90,50,${rnd() * 0.05})`; g.fillRect(rnd() * W, rnd() * H, 2, 2); }
  g.strokeStyle = '#a8843f'; g.lineWidth = 5; g.strokeRect(22, 22, W - 44, H - 44); g.lineWidth = 1.5; g.strokeRect(34, 34, W - 68, H - 68);
  const F = '"Cormorant Garamond", "Iowan Old Style", Georgia, serif';
  g.fillStyle = '#5a1420'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 30px ${F}`; g.fillText('M A I S O N', W / 2, H * 0.13);
  g.font = `italic 600 92px ${F}`; g.fillText('Pourfect', W / 2, H * 0.27);
  g.strokeStyle = '#a8843f'; g.lineWidth = 2; g.beginPath(); g.moveTo(W/2 - 120, H * 0.37); g.lineTo(W/2 + 120, H * 0.37); g.stroke();
  g.save(); g.translate(W / 2, H * 0.52); g.strokeStyle = '#5a1420'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-34, -46); g.quadraticCurveTo(-40, 6, 0, 14); g.quadraticCurveTo(40, 6, 34, -46); g.stroke();
  g.beginPath(); g.moveTo(0, 14); g.lineTo(0, 48); g.moveTo(-22, 50); g.lineTo(22, 50); g.stroke();
  g.fillStyle = '#8b1a30'; g.beginPath(); g.moveTo(-37, -18); g.quadraticCurveTo(-34, 8, 0, 11); g.quadraticCurveTo(34, 8, 37, -18); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = '#5a1420'; g.font = `italic 500 36px ${F}`; g.fillText('Grand Vin de Table', W / 2, H * 0.70);
  g.font = `700 50px ${F}`; g.fillText('2021', W / 2, H * 0.80);
  g.font = `600 22px ${F}`; g.fillText('75 cl  ·  13,5 % vol', W / 2, H * 0.89);
}
const labelGeo = new THREE.CylinderGeometry(0.0379, 0.0379, 0.112, 40, 1, true, -0.78, 1.56);
const labelMesh = new THREE.Mesh(labelGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }));
labelMesh.position.y = 0.106; labelMesh.layers.set(L_OPAQUE); bottle.add(labelMesh);
const labelBack = new THREE.Mesh(labelGeo, new THREE.MeshStandardMaterial({ color: 0xece2cd, roughness: 0.95, emissive: 0x7a6848, side: THREE.BackSide }));
labelBack.position.y = 0.106; labelBack.layers.set(L_OPAQUE); bottle.add(labelBack);
function refreshLabel(){ if (labelTex) labelTex.dispose(); labelTex = canvasTex(420, 780, drawLabel); labelMesh.material.map = labelTex; labelMesh.material.needsUpdate = true; lastSig = ''; }
refreshLabel();
if (document.fonts) document.fonts.load('italic 600 80px "Cormorant Garamond"').then(refreshLabel).catch(() => {});
const bShadow = new THREE.Mesh(decalGeo, shadowMat.clone()); bShadow.layers.set(L_OPAQUE); scene.add(bShadow);
const marks = [];
function addMark(V, first){
  if (V <= 1e-9) return;
  const y = BOT.L + BOT.levelAt(0, V), r = BOT.rOut(y) + 0.0007;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.0019, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: first ? 0xe0bd72 : 0xf3e7cf, transparent: true, opacity: 0, toneMapped: false }));
  m.position.y = y; m.layers.set(L_OPAQUE); m.userData.t = 0; bottle.add(m); marks.push(m); lastSig = '';
}
const dashTex = canvasTex(64, 4, (g, W, H) => { g.fillStyle = '#fff'; g.fillRect(0, 0, W * 0.55, H); }, false);
dashTex.wrapS = THREE.RepeatWrapping; dashTex.repeat.set(22, 1);
const guides = [];
function addGuides(V, n){
  for (let k = 1; k < n; k++){
    const y = BOT.L + BOT.levelAt(0, V * (n - k) / n), r = BOT.rOut(y) + 0.0009;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.0016, 64, 1, true),
      new THREE.MeshBasicMaterial({ map: dashTex, color: 0xcfe6ff, transparent: true, opacity: 0, toneMapped: false }));
    m.position.y = y; m.layers.set(L_OPAQUE); m.userData.t = 0; m.userData.out = false; bottle.add(m); guides.push(m);
  }
  lastSig = '';
}
function clearGuides(){ for (const m of guides){ bottle.remove(m); m.geometry.dispose(); m.material.dispose(); } guides.length = 0; lastSig = ''; }
function fadeGuidesOut(){ for (const m of guides) m.userData.out = true; }
function fadeGuides(dt){
  for (let i = guides.length - 1; i >= 0; i--){
    const m = guides[i];
    if (m.userData.out){ m.material.opacity -= dt / 0.6; if (m.material.opacity <= 0){ bottle.remove(m); m.geometry.dispose(); m.material.dispose(); guides.splice(i, 1); } }
    else if (m.userData.t < 1){ m.userData.t = Math.min(1, m.userData.t + dt / 0.8); m.material.opacity = 0.85 * easeOut(m.userData.t); }
  }
}
function clearMarks(){ for (const m of marks){ bottle.remove(m); m.geometry.dispose(); m.material.dispose(); } marks.length = 0; lastSig = ''; }
function fadeMarks(dt){ for (const m of marks) if (m.userData.t < 1){ m.userData.t = Math.min(1, m.userData.t + dt / 0.5); m.material.opacity = 0.92 * easeOut(m.userData.t); } }
function setWine(key){
  const w = WINES[key];
  WU.uSigma.value.set(...w.sigma); WU.uScatter.value.set(...w.scatter);
  bottleFilterMat.uniforms.uFilter.value.set(...w.bottle);
  bottleShine.material.uniforms.uTint.value.set(...w.glow); bottleShine.material.uniforms.uBaseA.value = w.glowA;
  bWineF.material.uniforms.uSigmaScale.value = w.inBottle;
  foamMat.uniforms.uColor.value.set(...w.foam);
  causticColor.setRGB(...w.caustic);
  for (const G of S.glasses) G.cm.color.copy(causticColor);
  document.documentElement.style.setProperty('--wine-dot', w.dot);
  lastSig = '';
}
const causticColor = new THREE.Color(1, 0.1, 0.14);
const surfMat = wineMat(NO_CLIP);
const chains = [];
const drops = [];
const SSEG = 10, SMAX = 1400;
const sGeo = new THREE.BufferGeometry();
sGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SMAX * SSEG * 3), 3).setUsage(THREE.DynamicDrawUsage));
sGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(SMAX * SSEG * 3), 3).setUsage(THREE.DynamicDrawUsage));
sGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(SMAX * SSEG * 6), 1).setUsage(THREE.DynamicDrawUsage));
sGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
const streamF = new THREE.Mesh(sGeo, wineMat(NO_CLIP)); streamF.layers.set(L_WINE); streamF.frustumCulled = false; scene.add(streamF);
const streamB = new THREE.Mesh(sGeo, backMat(NO_CLIP)); streamB.layers.set(L_BACK); streamB.frustumCulled = false; scene.add(streamB);
const DMAX = 160, dropGeo = new THREE.IcosahedronGeometry(1, 2);
const dropF = new THREE.InstancedMesh(dropGeo, wineMat(NO_CLIP), DMAX); dropF.layers.set(L_WINE); dropF.frustumCulled = false; dropF.count = 0; scene.add(dropF);
const dropB = new THREE.InstancedMesh(dropGeo, backMat(NO_CLIP), DMAX); dropB.layers.set(L_BACK); dropB.frustumCulled = false; dropB.count = 0; dropB.instanceMatrix = dropF.instanceMatrix; scene.add(dropB);
const FMAX = 420, foam = [];
const fGeo = new THREE.BufferGeometry();
fGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FMAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
fGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(FMAX), 1).setUsage(THREE.DynamicDrawUsage));
fGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(FMAX), 1).setUsage(THREE.DynamicDrawUsage));
const foamMat = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Vector3(...WINES.red.foam) }, uScale: { value: 600 } },
  vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / -mv.z; vA = aAlpha; }`,
  fragmentShader: `uniform vec3 uColor; varying float vA;
    void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
      float a = smoothstep(1.0, 0.72, r) * (0.35 + 0.65 * smoothstep(0.35, 0.85, r)); gl_FragColor = vec4(uColor * (0.8 + 0.6 * smoothstep(0.5, 0.0, length(d + vec2(0.15, -0.15)) * 2.0)), a * vA);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  transparent: true, depthWrite: false });
const foamPts = new THREE.Points(fGeo, foamMat); foamPts.layers.set(L_FX); foamPts.frustumCulled = false; foamPts.renderOrder = -1; scene.add(foamPts);
const AU = { ctx: null, out: null, on: true, pour: null, last: {}, ran: false, pourOn: false, pourT: 0, tokPh: 0.6, tokJit: 1, tokOn: false, held: false };
function auResume(){
  const c = AU.ctx; if (!c || AU.held || c.state === 'running' || c.state === 'closed' || document.hidden) return;
  try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
const auLive = () => !!AU.ctx && !!AU.pour && (AU.ctx.state === 'running' || !AU.ran);
function auHold(on){
  AU.held = !!on; const c = AU.ctx; if (!c) return;
  if (on){ if (c.state === 'running') try { const p = c.suspend(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  else auResume();
}
function auInit(){
  if (AU.ctx){ auResume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try { auBuild(new AC()); } catch (e) { AU.ctx = AU.out = AU.pour = null; console.error('audio', e); }
  auBgmPrep();
}
function auBuild(ctx){
  AU.ctx = ctx;
  if (ctx.state === 'running') AU.ran = true;
  ctx.addEventListener('statechange', () => { if (ctx.state === 'running') AU.ran = true; });
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.connect(ctx.destination);
  const out = AU.out = ctx.createGain(); out.gain.value = AU.on ? 0.9 : 0; out.connect(comp);
  const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++){ const w = Math.random() * 2 - 1; b0 = 0.99886*b0 + w*0.0555179; b1 = 0.99332*b1 + w*0.0750759; b2 = 0.96900*b2 + w*0.1538520; b3 = 0.86650*b3 + w*0.3104856; b4 = 0.55000*b4 + w*0.5329522; b5 = -0.7616*b5 - w*0.0168980; d[i] = (b0+b1+b2+b3+b4+b5+b6 + w*0.5362) * 0.11; b6 = w * 0.115926; }
  AU.noise = buf;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3800;
  const g3 = ctx.createGain(); g3.gain.value = 0;
  src.connect(hp); hp.connect(g3); g3.connect(out);
  src.start();
  const wOut = ctx.createGain(), wHp = ctx.createBiquadFilter(); wHp.type = 'highpass'; wHp.frequency.value = 180;
  wOut.connect(wHp); wHp.connect(out);
  const wg = WATER.map(() => { const g = ctx.createGain(); g.gain.value = 0; g.connect(wOut); return g; });
  AU.pour = { g3, wOut, wg, ws: WATER.map(() => null) };
  WATER.forEach((o, i) => { if (o.data) auWaterStart(i); });
}
function auSetOn(on){ AU.on = on; if (AU.out) AU.out.gain.setTargetAtTime(on ? 0.9 : 0, AU.ctx.currentTime, 0.05); }
const BGM_SRC = (typeof window !== 'undefined' && window.PS_BGM) || 'assets/audio/pourfect-bgm-1.m4a';
const BGM = { bytes: null, buf: null, shelf: false, src: null, gain: null, want: -1, busy: false };
setTimeout(() => {
  const get = BGM_SRC.startsWith('data:')
    ? Promise.resolve().then(() => { const t = atob(BGM_SRC.slice(BGM_SRC.indexOf(',') + 1)), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u.buffer; })
    : fetch(BGM_SRC).then(r => { if (!r.ok) throw new Error('BGM ' + r.status); return r.arrayBuffer(); });
  get.then(b => { BGM.bytes = b; auBgmPrep(); }).catch(e => console.warn('bgm', e));
}, 1200);
function auBgmPrep(){
  if (!AU.ctx || !AU.out || !BGM.bytes || BGM.buf || BGM.busy) return;
  BGM.busy = true;
  const bytes = BGM.bytes; BGM.bytes = null;
  auBgmDecode(bytes)
    .then(buf => (buf.sampleRate === AU.ctx.sampleRate ? Promise.resolve(false) : auBgmLinear(buf.sampleRate).catch(() => false)).then(sh => { BGM.buf = buf; BGM.shelf = sh; BGM.busy = false; auBgmStart(); }))
    .catch(e => { BGM.busy = false; console.warn('bgm', e); });
}
function auBgmDecode(bytes){
  const dec = (ctx, b) => new Promise((ok, ng) => { const p = ctx.decodeAudioData(b, ok, ng); if (p && p.then) p.then(ok, ng); });
  let off = null;
  try { const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (OAC && T.bgmRate) off = new OAC(2, 1, T.bgmRate); } catch (e) { off = null; }
  if (!off) return dec(AU.ctx, bytes);
  const copy = bytes.slice(0);
  return dec(off, bytes).then(b => b.sampleRate === T.bgmRate ? b : Promise.reject(new Error('rate ' + b.sampleRate))).catch(() => dec(AU.ctx, copy));
}
function auBgmLinear(rate){
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return Promise.resolve(false);
  const out = AU.ctx.sampleRate, len = Math.round(rate * 0.2), b = AU.ctx.createBuffer(1, len, rate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.sin(TAU * 10000 * i / rate);
  const off = new OAC(1, Math.round(out * 0.2), out), s = off.createBufferSource(); s.buffer = b; s.connect(off.destination); s.start();
  return new Promise((ok, ng) => { const p = off.startRendering(); off.oncomplete = e => ok(e.renderedBuffer); if (p && p.then) p.then(ok, ng); }).then(r => {
    const x = r.getChannelData(0), a = Math.round(x.length * 0.25), z = Math.round(x.length * 0.75); let e = 0;
    for (let i = a; i < z; i++) e += x[i] * x[i];
    return 10 * Math.log10(e / (z - a) / 0.5) < -1;
  });
}
function auBgmStart(){
  const c = AU.ctx; if (!c || !AU.out || !BGM.buf || BGM.src) return;
  const g = BGM.gain = c.createGain(); g.gain.value = 0; g.connect(AU.out);
  const s = BGM.src = c.createBufferSource(); s.buffer = BGM.buf; s.loop = true; s.loopStart = T.bgmLoop[0]; s.loopEnd = T.bgmLoop[1];
  let head = g;
  if (BGM.shelf){ const f = c.createBiquadFilter(); f.type = 'highshelf'; f.frequency.value = T.bgmShelf[0]; f.gain.value = T.bgmShelf[1]; f.connect(g); head = f; }
  s.connect(head); s.start();
  BGM.want = -1; auBgmLevel(T.bgmFade);
}
function auBgmLevel(tau){
  if (!BGM.gain) return;
  const v = T.bgmGain * (AU.pourOn ? T.bgmDuck : 1) * (S.phase === 'judge' ? T.bgmJudge : 1);
  if (v === BGM.want) return;
  const down = v < BGM.want; BGM.want = v;
  BGM.gain.gain.setTargetAtTime(v, AU.ctx.currentTime, tau ? tau / 3 : down ? 0.12 : 0.6);
}
const WATER_SR = 44100;
const WATER = [
  { sec: 3.0, perSec: 90,  r: [0.0003, 0.0012],  seed: 11 },
  { sec: 3.3, perSec: 220, r: [0.00045, 0.0026], seed: 23 },
  { sec: 2.7, perSec: 340, r: [0.0006, 0.005],   seed: 37 },
];
function waterData(o){
  const n = Math.floor(WATER_SR * o.sec), d = new Float32Array(n), rnd = mulberry32(o.seed), [rMin, rMax] = o.r;
  for (let i = 0, cnt = Math.round(o.perSec * o.sec); i < cnt; i++){
    const r = rMin * Math.pow(rMax / rMin, Math.pow(rnd(), 2.2));
    const f0 = 3 / r, damp = 0.13 * f0 + 0.0072 * Math.pow(f0, 1.5), rise = 0.1 * damp * (0.4 + 1.2 * rnd());
    const amp = Math.pow(r / rMax, 0.6) * (0.25 + 0.75 * rnd());
    const start = Math.floor(rnd() * n), len = Math.min(n, Math.floor(WATER_SR * Math.min(0.3, 7 / damp)));
    const w = TAU * f0 / WATER_SR, dec = Math.exp(-damp / WATER_SR);
    let e = amp;
    for (let k = 0; k < len; k++){ const t = k / WATER_SR; d[(start + k) % n] += e * Math.sin(w * k * (1 + 0.5 * rise * t)); e *= dec; }
  }
  let peak = 1e-6; for (let i = 0; i < n; i++){ const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const g = 0.8 / peak; for (let i = 0; i < n; i++) d[i] *= g;
  return d;
}
function auWaterStart(i){
  const P = AU.pour, o = WATER[i]; if (!P || P.ws[i] || !o.data) return;
  const c = AU.ctx, buf = c.createBuffer(1, o.data.length, WATER_SR); buf.getChannelData(0).set(o.data);
  const src = c.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(P.wg[i]); src.start();
  P.ws[i] = src;
}
WATER.forEach((o, i) => setTimeout(() => { try { o.data = waterData(o); auWaterStart(i); } catch (e) { console.error('water', e); } }, 500 + i * 300));
const tokPitch = airMl => clamp(T.tokF * Math.sqrt(BOT.total * 1e6 / (airMl + 40)), 190, 520);
function auTok(t, f, a){
  const g = AU.pour.wOut.gain;
  g.cancelScheduledValues(t); g.setTargetAtTime(1, t, 0.006); g.setTargetAtTime(T.tokDip, t + 0.035, 0.05);
  AU.tokOn = true;
  osc('sine', f, f * 1.25, t, 0.008, 0.048 * a, 0.085);
  osc('sine', f * 1.9, f * 2.5, t + 0.012, 0.006, 0.016 * a, 0.05);
  noiseHit(t, 'bandpass', f * 1.6, 1.2, 0.02 * a, 0.05);
}
function auPour(p, dt, now){
  if (!auLive()) return; const t = now === undefined ? AU.ctx.currentTime : now, P = AU.pour;
  if (AU.on && p.out > T.tokMin){
    if (p.sub <= 0.35){
      AU.tokPh += dt * lerp(T.tokHz[0], T.tokHz[1], smooth(4, 55, p.out)) * AU.tokJit;
      if (AU.tokPh >= 1){ AU.tokPh = 0; AU.tokJit = 0.86 + Math.random() * 0.28; const amp = 0.55 + 0.45 * smooth(4, 45, p.out); auTok(t, tokPitch(p.air), amp); haptic('tok', amp); }
    }
  } else {
    AU.tokPh = 0.6;
    if (AU.tokOn){ AU.tokOn = false; P.wOut.gain.setTargetAtTime(1, t, 0.08); }
  }
  if (p.in < 0.05){
    if (AU.pourOn){ AU.pourOn = false; for (const g of P.wg) g.gain.setTargetAtTime(0, t, 0.04); P.g3.gain.setTargetAtTime(0, t, 0.03); }
    return;
  }
  if (AU.pourOn && t - AU.pourT < 0.0125) return;
  AU.pourOn = true; AU.pourT = t;
  const a = Math.min(1, Math.pow(p.in / 60, 0.55));
  const mix = [1 - smooth(0.2, 0.55, a), smooth(0.12, 0.45, a) * (1 - 0.45 * smooth(0.6, 1, a)), smooth(0.45, 0.95, a)];
  const lv = (0.25 + 0.75 * a) * T.waterGain;
  P.wg.forEach((g, i) => g.gain.setTargetAtTime(mix[i] * lv, t, 0.05));
  const rate = 0.82 + 0.5 * clamp(Math.log(p.pitch / 300) / Math.log(2800 / 300), 0, 1);
  for (const src of P.ws) if (src) src.playbackRate.setTargetAtTime(rate, t, 0.1);
  P.g3.gain.setTargetAtTime(a * 0.04 * p.splash, t, 0.03);
}
function env(g, t, a, peak, dec){ g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function osc(type, f0, f1, t, a, peak, dec, dest){
  const c = AU.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + dec * 0.6);
  env(g, t, a, peak, dec); o.connect(g); g.connect(dest || AU.out); o.start(t); o.stop(t + a + dec + 0.05);
}
function noiseHit(t, type, f, q, peak, dec){
  const c = AU.ctx, s = c.createBufferSource(); s.buffer = AU.noise; const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 1;
  const g = c.createGain(); env(g, t, 0.003, peak, dec); s.connect(b); b.connect(g); g.connect(AU.out); s.start(t, Math.random() * 2); s.stop(t + dec + 0.05);
}
function bell(f, t, peak, dec){ for (const [m, a, dd] of [[1, 1, 1], [2.76, 0.32, 0.55], [5.4, 0.12, 0.3]]) osc('sine', f * m, 0, t, 0.004, peak * a, dec * dd); }
function sfx(name, p = 0){
  if (!auLive() || !AU.on) return; const c = AU.ctx, t = c.currentTime;
  const now = performance.now(); if (AU.last[name] && now - AU.last[name] < 25) return; AU.last[name] = now;
  haptic(name, p);
  switch (name){
    case 'glug': auTok(t, tokPitch((BOT.total - B.V) * 1e6), 1.25); break;
    case 'drip': osc('sine', 650 + Math.random() * 200, 1500, t, 0.003, 0.10, 0.06); break;
    case 'place': noiseHit(t, 'lowpass', 900, 1, 0.12, 0.03); osc('sine', 1850 + Math.random() * 120, 0, t, 0.002, 0.035, 0.07); osc('sine', 3100, 0, t, 0.002, 0.02, 0.05); break;
    case 'clink': {
      const hits = clamp(p || 2, 2, 5), amp = Math.sqrt(2 / hits);
      for (let h = 0; h < hits; h++) for (const [f, a, d] of [[1960, .16, 1.3], [3420, .09, .9], [5130, .05, .6], [6960, .03, .4]]) osc('sine', f * (0.985 + Math.random() * 0.03) * (hits > 2 ? 0.97 + 0.03 * (h % 3) : 1), 0, t + h * 0.045, 0.002, a * amp, d);
      break;
    }
    case 'rise': osc('sine', 380 * Math.pow(2, 1.7 * clamp(p, 0, 1)), 0, t, 0.003, 0.03, 0.05); break;
    case 'ding': bell([783.99, 1046.5, 1567.98][p] || 1046.5, t, [0.06, 0.085, 0.10][p] || 0.085, [0.5, 0.7, 0.9][p] || 0.7); break;
    case 'sorry': osc('sine', 415.3, 329.6, t, 0.02, 0.07, 0.2); osc('sine', 329.6, 277.2, t + 0.19, 0.02, 0.06, 0.3); break;
    case 'tick': osc('triangle', 2300, 0, t, 0.002, 0.05, 0.03); break;
    case 'tap': osc('sine', 1100, 900, t, 0.003, 0.06, 0.05); break;
    case 'ok': [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, t + i * 0.09, 0.10, 0.9)); break;
    case 'pourfect': [783.99, 987.77, 1174.66, 1567.98, 1975.53, 2349.3].forEach((f, i) => bell(f, t + i * 0.06, 0.09, 1.0)); break;
    case 'fail': [[311.13, 0], [293.66, 0.22], [233.08, 0.44]].forEach(([f, dt]) => osc('triangle', f, f * 0.98, t + dt, 0.01, 0.12, 0.45)); break;
    case 'grumble': osc('sawtooth', 150, 120, t, 0.02, 0.035, 0.18); osc('sawtooth', 156, 118, t + 0.17, 0.02, 0.03, 0.2); break;
    case 'happy': osc('sine', 880, 1320, t, 0.005, 0.05, 0.12); break;
    case 'whoosh': noiseHit(t, 'bandpass', 700, 0.8, 0.05, 0.25); break;
    case 'spill': noiseHit(t, 'highpass', 2500, 0.7, 0.08, 0.12); break;
    case 'pop': osc('sine', 620, 240, t, 0.003, 0.22, 0.07); noiseHit(t, 'bandpass', 1100, 1.2, 0.12, 0.05); break;
  }
}
const vibrate = ms => { try { if (AU.on && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) {} };
function haptic(name, p){ try { if (WEB && WEB.haptic) WEB.haptic(name, p); } catch (e) {} }
const SAVE_KEY = 'pourfect-sommelier.v1';
function loadSave(){ try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } }
function writeSave(o){ try { localStorage.setItem(SAVE_KEY, JSON.stringify(o)); } catch (e) {} }
const SAVE = Object.assign({ bestStage: 0, sound: true }, loadSave());
delete SAVE.best; delete SAVE.repBest; delete SAVE.repBestStage;
AU.on = SAVE.sound !== false;
const S = {
  phase: 'title', t: 0, stageNo: 1, stage: null, glasses: [], cur: 0, rng: mulberry32(1),
  holding: false, dragY0: 0, dragY: 0, ready: 0, emitted: 0, stopT: 0, spilled: 0,
  rigFrom: 0, rigTo: 0, rigX: 0, result: null, revealed: 0,
  best0: 0, fin: 0, toast: null, run: [], lives: T.lives, served: 0,
};
const B = { V: 0, spin: { x: -T.rigYawWide, v: 0 }, spinOff: { x: 0, v: 0 }, spinOffT: 0,
  qIns: new THREE.Quaternion(), qInsT: new THREE.Quaternion(), sl: { x: 0, z: 0, vx: 0, vz: 0 }, qPrev: null, stopper: 1, th: { x: 0, v: 0 }, thT: 0, mx: { x: 0.09, v: 0 }, my: { x: 0.32, v: 0 }, mz: { x: 0, v: 0 }, mxT: 0.09, myT: 0.32, mzT: 0,
  Q: 0, level: -1, d: -1, glug: 0, dripAcc: 0, chain: null, flowing: false };
function shuffle(a, rng){ a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
const FLOW = [
  [2, 'same'], [3, 'same'], [2, 'classic'], [5, 'same'], [3, 'classic'], [2, 'weird'],
  [7, 'same'], [3, 'weird'], [5, 'classic'], [5, 'weird'], [7, 'classic'], [7, 'weird'],
];
function makeStage(no, rng){
  const lap = Math.floor((no - 1) / FLOW.length), [n, kind] = FLOW[(no - 1) % FLOW.length];
  let ids;
  if (kind === 'same'){
    const ok = CLASSIC.filter(id => glassType(id).cap * T.shareCap >= T.share[0]);
    ids = Array(n).fill(no === 1 ? 'bordeaux' : ok[(rng() * ok.length) | 0]);
  } else ids = shuffle(kind === 'weird' ? WEIRD : CLASSIC, rng).slice(0, n);
  const wine = no <= 2 ? 'red' : ['red', 'red', 'rose', 'white'][(rng() * 4) | 0];
  const tol = Math.max(T.tolMin, T.tol - T.tolLap * lap);
  const minCap = Math.min(...ids.map(id => glassType(id).cap));
  const target = Math.min(lerp(T.share[0], T.share[1], rng()), minCap * T.shareCap, T.bottleMax / n);
  const total = Math.min(T.bottleMax, Math.max(n * 30, Math.round(target * n / 10) * 10));
  return { no, lap, kind, n, ids, wine, tol, total, target: total / n };
}
function clearStage(){
  lastSig = '';
  for (const G of S.glasses) disposeGlass(G);
  S.glasses = []; chains.length = 0; drops.length = 0; foam.length = 0; B.chain = null; B.Q = 0;
  S.toast = null; $('app').classList.remove('pourfect');
  $('labels').innerHTML = '';
}
function buildRow(ids){
  const xs = []; let x = 0;
  ids.forEach((id, i) => { const R = glassType(id).outerR; if (i > 0) x += glassType(ids[i-1]).outerR + R + T.rowGap; xs.push(x); });
  const mid = (xs[0] + xs[xs.length - 1]) / 2;
  return xs.map(v => v - mid);
}
function loadStage(no, custom){
  clearStage();
  S.stageNo = no; S.stage = custom ? { no, n: custom.ids.length, wine: 'red', tol: T.tol, ...custom, target: custom.total / custom.ids.length } : makeStage(no, S.rng);
  const st = S.stage, xs = buildRow(st.ids);
  S.glasses = st.ids.map((id, i) => makeGlass(id, xs[i], i));
  for (const G of S.glasses){ G.grp.position.y = 0.05; G.appear = -0.15 - G.i * 0.13; }
  setWine(st.wine);
  B.V = st.total * 1e-6; B.th.x = 0; B.th.v = 0; B.thT = 0; B.Q = 0; B.dripAcc = 0;
  S.cur = 0; S.spilled = 0; S.rigX = S.rigFrom = S.rigTo = S.glasses[S.glasses.length - 1].x + 0.9; S.rigOut = undefined; S.introB = false; S.ret = null; S.fin = 0;
  clearMarks(); if (T.startMark) addMark(B.V, true); clearGuides(); if (no <= T.guideStages) addGuides(B.V, st.n);
  setIdlePose(true); B.my.x = B.myT = T.inspectY + BOT.L / 2; S.insp = null; B.qIns.identity(); B.qInsT.identity(); B.stopper = 1;
  camGo(frameOverview(), 1.2);
  S.phase = 'intro'; S.t = 0;
  showIntro();
  updateHud();
}
const curG = () => S.glasses[S.cur];
const isLastGlass = () => S.cur === S.glasses.length - 1;
function idlePose(G){
  const N = S.glasses[G.i + 1];
  if (G.idle && G.idleYaw === rigYaw && G.idleNext === N) return G.idle;
  const y = Math.max(G.ty.rimY + 0.06, BOT.L + T.idleYB);
  const Dc = Math.max(G.ty.outerRimR + BOT.R + T.idleRimGap, G.passD);
  let a = 0;
  if (N){
    const dx = N.x - G.x;
    a = Math.max(0, Math.acos(clamp((Dc * Dc + dx * dx - N.passD * N.passD) / (2 * Dc * dx), -1, 1)) - rigYaw);
  }
  G.idleYaw = rigYaw; G.idleNext = N;
  return G.idle = { x: Dc * Math.cos(a), y, z: -Dc * Math.sin(a) };
}
function setIdlePose(snap){
  const p = idlePose(curG()); B.mxT = p.x; B.myT = p.y; B.mzT = p.z; B.thT = 0;
  if (snap){ B.mx.x = p.x; B.my.x = p.y; B.mz.x = p.z; B.mx.v = B.my.v = B.mz.v = 0; }
}
const _v = new THREE.Vector3();
let rigYaw = T.rigYawWide, yawC = Math.cos(rigYaw), yawS = Math.sin(rigYaw);
function setRigYaw(){ rigYaw = cam.aspect < 0.8 ? T.rigYawNarrow : T.rigYawWide; yawC = Math.cos(rigYaw); yawS = Math.sin(rigYaw); rig.rotation.y = rigYaw; }
function rigToWorld(lx, ly, out, lz = 0){ out.set(S.rigX + lx * yawC + lz * yawS, ly, -lx * yawS + lz * yawC); return out; }
function dodgeGlasses(dt){
  const wx = S.rigX + B.mx.x * yawC + B.mz.x * yawS;
  let need = 0;
  const yB = B.my.x - BOT.L;
  for (const G of S.glasses){
    if (yB > G.ty.rimY + 0.02) continue;
    const dx = wx - G.x; if (Math.abs(dx) < G.passD) need = Math.max(need, Math.sqrt(G.passD * G.passD - dx * dx));
  }
  if (!need) return;
  const z = (B.mx.x * yawS - need) / yawC;
  if (B.mz.x > z){ B.mz.x = Math.max(z, B.mz.x - T.dodgeSpeed * dt); if (B.mz.v > 0) B.mz.v = 0; }
}
function exitDir(d, th = B.th.x){
  const k = smooth(0.0, 0.012, d);
  let dx = lerp(0, -Math.sin(th), k), dy = lerp(-1, Math.cos(th), k); const L = Math.hypot(dx, dy) || 1;
  const v0 = Math.min(T.exitMax, T.exitSpeed * Math.sqrt(2 * T.g * Math.max(d, 0)) + 0.03);
  return { vx: dx / L * v0, vy: dy / L * v0 };
}
function pourPose(G){
  const k = Math.max(B.Q > 0 ? 1 : 0, smooth(S.ready - 45 * DEG, S.ready - 14 * DEG, B.th.x)), idle = idlePose(G);
  B.mxT = lerp(idle.x, aimMouthX(G), k); B.myT = lerp(idle.y, G.ty.rimY + pourClear(G), k); B.mzT = lerp(idle.z, 0, k);
}
function returnPose(G){
  const idle = idlePose(G);
  S.hold = stillEmitting();
  if (S.hold){
    S.ret = null;
    B.mxT = aimMouthX(G); B.myT = G.ty.rimY + pourClear(G); B.mzT = 0;
    if (B.d > 0) B.thT = 0;
    return;
  }
  if (!S.ret){
    if (B.th.v > 0) B.th.v = 0;
    S.ret = { x: B.mx.x, y: B.my.x, z: B.mz.x, th: Math.min(B.th.x, S.ready), q: 0 };
  }
  const R = S.ret, D = Math.hypot(R.x - idle.x, R.y - idle.y, R.z - idle.z);
  R.q = D < 0.003 ? 1 : 1 - Math.min(1, Math.hypot(B.mx.x - idle.x, B.my.x - idle.y, B.mz.x - idle.z) / D);
  B.mxT = idle.x; B.myT = idle.y; B.mzT = idle.z;
  B.thT = Math.min(R.th, Math.max(R.th * (1 - smooth(T.returnTilt[0], T.returnTilt[1], R.q)), tiltFloor(B.my.x)));
}
function tiltFloor(my){
  const h = my - T.tableClear; if (h >= BOT.L) return 0;
  return Math.acos(clamp(h / Math.hypot(BOT.L, BOT.R), -1, 1)) + Math.atan(BOT.R / BOT.L);
}
function stillEmitting(){
  if (B.d > 0 || B.Q >= T.dripQ) return true;
  if (B.Q <= 0) return false;
  const rest = B.Q * (T.flowLag + T.simDt);
  return rest >= B.V || B.dripAcc + rest >= T.dropVol;
}
const returned = () => !!S.ret && S.ret.q > T.returnDone && B.th.x < T.returnDoneTilt;
const pourClear = G => clamp(G.ty.rimR, 0.018, T.pourClear);
function holdUntilInPlace(G){
  if (S.inPlace) return;
  if (Math.abs(B.mx.x - aimMouthX(G)) < 0.004 && Math.abs(B.my.x - (G.ty.rimY + pourClear(G))) < 0.006 && Math.abs(B.mz.x) < 0.004) S.inPlace = true;
  else B.thT = Math.min(B.thT, S.ready - T.holdBack);
}
function setTiltWant(want){ S.thWant = want; S.dT = B.V > 0 ? BOT.levelAt(want, B.V) - BOT.lipLow(want) : -1; B.thT = want; }
function aimMouthX(G){
  const th = B.th.x, lipX = -BOT.RM * Math.cos(th), lipY = -BOT.RM * Math.sin(th);
  const y0 = G.ty.rimY + pourClear(G) + lipY;
  const rimY = G.ty.rimY, surfY = G.ty.d.bowlY + G.yl;
  const lim = Math.max(0.004, G.ty.rimR - 0.0045);
  const want = e => {
    const tAt = y => { const dy = Math.max(0.003, y0 - y); return (e.vy + Math.sqrt(e.vy * e.vy + 2 * T.g * dy)) / T.g; }, tr = tAt(rimY);
    return clamp(-lipX - e.vx * tAt(surfY), -lim - lipX - e.vx * tr, lim - lipX - e.vx * tr);
  };
  const dNow = Math.max(B.d, 0.004);
  let mx = want(exitDir(dNow));
  if (S.dT > dNow) mx = Math.max(mx, want(exitDir(S.dT, S.thWant)));
  const lipLim = G.ty.rimR * 0.7;
  mx = clamp(mx, -lipLim - lipX, lipLim - lipX);
  return clamp(mx, -0.02, 0.16);
}
function simStep(dt){
  let om = B.thT < B.th.x - 0.05 && !S.holding ? T.liftOmega : T.tiltOmega;
  if (S.hold && B.d <= 0){ B.thT = B.th.x; om = T.brakeOmega; if (B.th.v > 0) B.th.v = 0; }
  spring(B.th, B.thT, om, dt);
  spring(B.mx, B.mxT, 18, dt); spring(B.my, B.myT, 16, dt); spring(B.mz, B.mzT, 18, dt);
  if (S.phase === 'move' || (S.rigOut !== undefined && S.rigTo === S.rigOut)) dodgeGlasses(dt);
  if (B.th.x < 0){ B.th.x = 0; B.th.v = Math.max(0, B.th.v); }
  const th = B.th.x;
  let Qt = 0; B.sub = 0;
  if (B.V > 1e-10){
    B.level = BOT.levelAt(th, B.V);
    B.d = B.level - BOT.lipLow(th);
    if (B.d > 0 && S.phase !== 'intro'){
      const D = 2 * BOT.RM * Math.abs(Math.sin(th)) + 1e-4;
      Qt = B.d < D ? T.flowK * Math.pow(B.d, 1.5) : T.flowK * Math.pow(D, 1.5) + T.flowK2 * Math.sqrt(B.d - D);
      Qt = Math.min(Qt, T.flowMax);
      const sub = B.sub = smooth(0.55, 1.0, B.d / D);
      B.glug += dt * T.glugHz * TAU * (0.8 + 0.4 * sub);
      if (B.glug > TAU){ B.glug -= TAU; if (sub > 0.35 && Qt > 6e-6){ sfx('glug'); vibrate(6); } }
      Qt *= 1 + T.glugAmp * sub * Math.sin(B.glug);
    }
  } else { B.level = -1; B.d = -1; }
  B.Q += (Qt - B.Q) * (1 - Math.exp(-dt / T.flowLag));
  if (Qt === 0 && B.Q < 2e-8){ B.Q = 0; if (B.dripAcc > 0){ B.V += B.dripAcc; B.dripAcc = 0; } }
  let dv = Math.min(B.Q * dt, B.V);
  if (dv > 0 && B.V - dv < 1e-11) dv = B.V;
  B.V -= dv; if (B.V < 1e-11) B.V = 0;
  S.emitted += dv;
  B.flowing = dv > 0;
  const lipLX = B.mx.x - BOT.RM * Math.cos(th), lipLY = B.my.x - BOT.RM * Math.sin(th);
  if (dv > 0){
    const e = exitDir(B.d);
    rigToWorld(lipLX, lipLY, _v, B.mz.x);
    const vx = e.vx * yawC, vz = -e.vx * yawS, vy = e.vy;
    if (B.Q < T.dripQ){
      B.chain = null; B.dripAcc += dv;
      if ((B.dripAcc >= T.dropVol || B.V <= 0) && spawnDrop(_v.x, _v.y - 0.001, _v.z, vx * 0.3, Math.min(vy, 0) * 0.3, vz * 0.3, B.dripAcc, false)) B.dripAcc = 0;
    } else {
      if (!B.chain){ B.chain = { pts: [], end: null, endT: 0 }; chains.push(B.chain); }
      B.chain.pts.push({ x: _v.x, y: _v.y, z: _v.z, vx, vy, vz, vol: dv + B.dripAcc, q: B.Q, py: _v.y, inG: -1, age: 0 });
      B.dripAcc = 0;
    }
  } else if (B.chain){ B.chain = null; }
  for (let ci = chains.length - 1; ci >= 0; ci--){
    const ch = chains[ci];
    for (let k = ch.pts.length - 1; k >= 0; k--){
      const p = ch.pts[k];
      if (p.wall){
        const done = wallStep(p, dt);
        if (done){ const G = S.glasses[p.wall.g]; if (G) absorb(p, G); else spill(p); ch.end = { x: p.x, y: p.y, z: p.z, r: streamR(p), wf: p.wf }; ch.endT = S.clock; ch.pts.splice(k, 1); }
        continue;
      }
      p.py = p.y; p.vy -= T.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.age += dt;
      const r = collide(p);
      if (r && r.kind === 'in' && !r.surf && p.vol > 0 && toWall(p, r.G)) continue;
      if (r){ if (r.kind === 'in') absorb(p, r.G); else spill(p); ch.end = { x: p.x, y: p.y, z: p.z, r: streamR(p), g: r.kind === 'in' ? r.G.i : -1 }; ch.endT = S.clock; ch.pts.splice(k, 1); }
    }
    if (!ch.pts.length && ch !== B.chain) chains.splice(ci, 1);
  }
  for (let k = drops.length - 1; k >= 0; k--){
    const p = drops[k];
    p.py = p.y; p.vy -= T.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const r = collide(p);
    if (r){ if (r.kind === 'in'){ if (p.vol > 0){ absorb(p, r.G); sfx('drip'); } else if (r.surf) waveKickAt(r.G, p, 0.15); } else if (p.vol > 0) spill(p); drops.splice(k, 1); }
  }
}
function streamR(p){ return clamp(Math.sqrt(p.q / (Math.PI * Math.max(0.08, Math.hypot(p.vx, p.vy, p.vz)))), 0.0007, 0.0075); }
function collide(p){
  if (p.inG < 0){
    for (const G of S.glasses){
      const rimY = G.grp.position.y + G.ty.rimY;
      if (p.py >= rimY && p.y < rimY){
        const dx = p.x - G.x, dz = p.z, rr = dx * dx + dz * dz;
        if (rr < G.ty.rimR * G.ty.rimR) p.inG = G.i;
        else if (rr < (G.ty.outerRimR + 0.003) ** 2) return { kind: 'out' };
      }
    }
    if (p.inG < 0){ if (p.y < 0.001) return { kind: 'out' }; return null; }
  }
  const G = S.glasses[p.inG]; if (!G) return { kind: 'out' };
  const yRel = p.y - (G.grp.position.y + G.ty.d.bowlY);
  if (yRel <= G.yl) return { kind: 'in', G, surf: true };
  const r = G.ty.rFn(Math.min(yRel, G.ty.depth)), dx = p.x - G.x, dz = p.z;
  if (dx * dx + dz * dz >= r * r) return { kind: 'in', G };
  return null;
}
function wallSlope(ty, h){ const e = 0.0008; return (ty.rFn(clamp(h + e, 0, ty.depth)) - ty.rFn(clamp(h - e, 0, ty.depth))) / (2 * e); }
function toWall(p, G){
  const ty = G.ty, base = G.grp.position.y + ty.d.bowlY;
  const h = clamp(p.y - base, G.yl + 0.0005, ty.depth), phi = Math.atan2(p.z, p.x - G.x);
  const r1 = wallSlope(ty, h), L = Math.hypot(1, r1);
  if (r1 / L < -0.2) return false;
  const c = Math.cos(phi), sn = Math.sin(phi), vr = p.vx * c + p.vz * sn, va = -p.vx * sn + p.vz * c;
  const along = (vr * -r1 - p.vy) / L, vn = vr / L - p.vy * r1 / L;
  p.wall = { g: G.i, h, phi, s: Math.max(0.05, along * T.filmKeep), a: va * T.filmKeep, slid: 0, t: 0, r0: streamR(p) };
  wallFrame(p, G);
  if (vn > 0.8 && Math.random() < 0.05) spawnDrop(p.x, p.y, p.z, -c * vn * 0.25 + (Math.random() - .5) * 0.2, 0.15 + Math.random() * 0.25, -sn * vn * 0.25 + (Math.random() - .5) * 0.2, 0, true, 0.0005 + Math.random() * 0.0006, G.i);
  return true;
}
function wallFrame(p, G){
  const W = p.wall, ty = G.ty, h = W.h, r = ty.rFn(h), r1 = wallSlope(ty, h), L = Math.hypot(1, r1);
  const c = Math.cos(W.phi), sn = Math.sin(W.phi);
  const nx = -c / L, ny = r1 / L, nz = -sn / L, ax = -sn, az = c;
  const w = clamp(W.r0 * 1.3 + W.slid * 0.08, 0.0015, Math.max(0.0015, Math.min(0.005, 0.45 * r)));
  const hh = clamp(W.r0 * W.r0 / w, 0.0008, 0.002), off = hh + 0.0004;
  p.x = G.x + r * c + nx * off; p.y = G.grp.position.y + ty.d.bowlY + h + ny * off; p.z = r * sn + nz * off;
  const tr = -r1 / L, ty_ = -1 / L;
  p.vx = W.s * tr * c + W.a * ax; p.vy = W.s * ty_; p.vz = W.s * tr * sn + W.a * az;
  p.wf = { ax, ay: 0, az, nx, ny, nz, w, h: hh };
}
function wallStep(p, dt){
  const W = p.wall, G = S.glasses[W.g]; if (!G) return true;
  const ty = G.ty; W.t += dt; p.age += dt;
  const r1 = wallSlope(ty, W.h), L = Math.hypot(1, r1);
  W.s = Math.max(0.03, W.s + (T.g / L - T.filmDrag * W.s) * dt);
  W.h -= W.s * dt / L; W.slid += W.s * dt;
  W.a *= Math.exp(-T.filmAz * dt);
  const rNow = ty.rFn(clamp(W.h, 0, ty.depth));
  W.phi += W.a * dt / Math.max(0.004, rNow);
  if (W.h <= G.yl + 0.0004 || W.t > T.filmLife || rNow < 0.003){ W.h = Math.max(W.h, G.yl); wallFrame(p, G); return true; }
  const r2 = wallSlope(ty, W.h);
  if (r2 / Math.hypot(1, r2) < -0.2){ wallFrame(p, G); p.wall = null; p.wf = null; p.py = p.y; return false; }
  wallFrame(p, G);
  return false;
}
function waveKickAt(G, p, s){
  const R = Math.max(0.002, G.ty.rFn(G.yl));
  waveKick(G.wave, clamp((p.x - G.x) / R, -0.95, 0.95), clamp(p.z / R, -0.95, 0.95), s);
}
function absorb(p, G){
  const ml = p.vol * 1e6;
  G.vol += ml; G.inflow += ml; G.dirty = true;
  const sp = Math.hypot(p.vx, p.vy, p.vz);
  if (G.vol > 0.2) waveKickAt(G, p, clamp(ml * sp * 1.6, 0, 0.6));
  if (Math.random() < ml * sp * 0.9) spawnFoam(G, p);
  if (sp > 1.0 && Math.random() < 0.05 * Math.min(1, ml * 4)) spawnSplash(G, p);
  if (G.vol > G.ty.cap){ S.spilled += G.vol - G.ty.cap; G.vol = G.ty.cap; G.overflow = true; }
}
function spill(p){ S.spilled += p.vol * 1e6; (S.spillLog ||= {})[S.phase] = (S.spillLog[S.phase] || 0) + p.vol * 1e6; if (p.vol > 0.2e-6) sfx('spill'); }
function spawnDrop(x, y, z, vx, vy, vz, vol, splash, r, inG = -1){
  if (drops.length >= DMAX){
    const k = vol > 0 ? drops.findIndex(d => !(d.vol > 0)) : -1;
    if (k < 0) return false;
    drops.splice(k, 1);
  }
  drops.push({ x, y, z, vx, vy, vz, vol, py: y, inG, r: r || Math.cbrt(Math.max(vol, 0.02e-6) * 3 / (4 * Math.PI)), splash });
  return true;
}
function spawnSplash(G, p){
  const yl = G.yl + 0.002, R = Math.max(0.001, G.ty.rFn(Math.min(yl, G.ty.depth)) - 0.002);
  let dx = p.x - G.x, dz = p.z; const rr = Math.hypot(dx, dz);
  if (rr > R){ dx *= R / rr; dz *= R / rr; }
  spawnDrop(G.x + dx, G.grp.position.y + G.ty.d.bowlY + yl, dz, (Math.random() - .5) * 0.25, 0.25 + Math.random() * 0.35, (Math.random() - .5) * 0.25, 0, true, 0.0005 + Math.random() * 0.0008, G.i);
}
function spawnFoam(G, p){
  if (foam.length >= FMAX) foam.shift();
  const R = Math.max(0.002, G.ty.rFn(G.yl)), a = Math.random() * TAU, s = 0.004 + Math.random() * 0.02;
  foam.push({ G, x: clamp((p.x - G.x) / R, -0.9, 0.9), z: clamp(p.z / R, -0.9, 0.9), vx: Math.cos(a) * s, vz: Math.sin(a) * s, life: 0, max: 1.2 + Math.random() * 2.4, size: 0.0012 + Math.random() * 0.0022 });
}
const CAM = { cur: { tx: 0, ty: 0.16, tz: 0, dist: 1.2, pitch: 0.24, yaw: 0 }, from: null, spec: null, t: 1, dur: 1 };
function fitDist(w, h){ const tv = Math.tan(cam.fov * DEG / 2); return Math.max(h / 2 / tv, w / 2 / (tv * cam.aspect)); }
const framePour = (i, pouring = false) => () => {
  const G = S.glasses[i], narrow = cam.aspect < 0.8;
  if (narrow && pouring) return { tx: G.x + 0.105, ty: 0.20, tz: 0, dist: fitDist(0.33, 0.48), pitch: 12 * DEG, yaw: -5 * DEG };
  return { tx: G.x - (narrow ? 0.022 : 0.032), ty: narrow ? 0.17 : 0.19, tz: 0, dist: fitDist(narrow ? 0.255 : 0.30, 0.48), pitch: 12 * DEG, yaw: -5 * DEG };
};
const frameFinale = () => () => {
  const base = framePour(S.cur, true)(), G = S.glasses[S.cur], P = S.glasses[S.cur - 1];
  if (!P) return base;
  const k = easeInOut(clamp(S.fin / T.finaleCam, 0, 1));
  const w = G.x - P.x + P.ty.outerR + G.ty.outerR + 0.05, h = Math.max(0.44, Math.max(G.ty.rimY, P.ty.rimY) + 0.20);
  return { tx: lerp(base.tx, (G.x + G.ty.outerR + 0.03 + P.x - P.ty.outerR - 0.02) / 2, k), ty: lerp(base.ty, 0.16, k), tz: 0, dist: lerp(base.dist, fitDist(w, h), k), pitch: base.pitch, yaw: lerp(base.yaw, -2 * DEG, k) };
};
const LAB = { h: 50, hCompact: 28, stagger: 34, gap: 5, half: 55 };
let labCompact = false;
let hudKey = '', hudY = 0;
function hudRowBottom(){
  const el = $('app'), k = el.clientWidth + 'x' + el.clientHeight;
  if (k !== hudKey && !$('hud').hidden){ hudKey = k; hudY = $('hud').firstElementChild.getBoundingClientRect().bottom - el.getBoundingClientRect().top; }
  return hudY;
}
const frameOverview = (judge = false) => () => {
  const gs = S.glasses; if (!gs.length) return CAM.cur;
  const span = gs[gs.length - 1].x - gs[0].x + gs[0].ty.outerR + gs[gs.length - 1].ty.outerR;
  const tv = Math.tan(cam.fov * DEG / 2), V = Math.max(0.30 / 0.44, (span + 0.14) / cam.aspect), pitch = 15 * DEG;
  let ty = 0.12 - (judge ? 0.19 : 0.22) * V;
  if (judge){
    const H = $('app').clientHeight, n = 1 - 2 * (hudRowBottom() + LAB.gap + (labCompact ? LAB.hCompact + LAB.stagger : LAB.h)) / H;
    const y = Math.max(...gs.map(G => G.ty.rimY)) + 0.012;
    if (n > 0) ty = Math.max(ty, y - n * V / (2 * Math.cos(pitch) + 2 * n * tv * Math.sin(pitch)));
  }
  return { tx: (gs[0].x + gs[gs.length - 1].x) / 2, ty, tz: 0, dist: V / (2 * tv), pitch, yaw: 0 };
};
const inspectCenter = () => { const p = idlePose(S.glasses[0]); return { x: p.x, y: T.inspectY, z: p.z }; };
const frameBottle = () => () => {
  const tv = Math.tan(cam.fov * DEG / 2), V = Math.max(0.76, 0.36 / cam.aspect), C = inspectCenter();
  const bx = S.rigX + C.x * yawC + C.z * yawS, bz = -C.x * yawS + C.z * yawC, by = C.y;
  return { tx: bx, ty: by - 0.16 * V, tz: bz, dist: V / (2 * tv), pitch: 9 * DEG, yaw: -5 * DEG };
};
const frameTitle = () => () => {
  const tv = Math.tan(cam.fov * DEG / 2), a = cam.aspect, yaw = Math.sin(S.clock * 0.15) * 0.22;
  if (a < 1){ const V = Math.max(0.36 / 0.46, 0.30 / a); return { tx: 0.035, ty: 0.15 - 0.21 * V, tz: 0, dist: V / (2 * tv), pitch: 10 * DEG, yaw }; }
  const V = 0.44; return { tx: 0.035 - 0.19 * V * a, ty: 0.15, tz: 0, dist: V / (2 * tv), pitch: 10 * DEG, yaw };
};
function camGo(spec, dur){ CAM.from = { ...CAM.cur }; CAM.spec = spec; CAM.t = 0; CAM.dur = dur; }
function camUpdate(dt){
  const to = CAM.spec ? CAM.spec() : CAM.cur;
  if (CAM.t < 1){ CAM.t = Math.min(1, CAM.t + dt / CAM.dur); const e = easeInOut(CAM.t); for (const k in to) CAM.cur[k] = lerp(CAM.from[k], to[k], e); }
  else Object.assign(CAM.cur, to);
  const c = CAM.cur;
  cam.position.set(c.tx + c.dist * Math.cos(c.pitch) * Math.sin(c.yaw), c.ty + c.dist * Math.sin(c.pitch), c.tz + c.dist * Math.cos(c.pitch) * Math.cos(c.yaw));
  cam.lookAt(c.tx, c.ty, c.tz);
  scene.fog.near = c.dist + 0.35; scene.fog.far = c.dist + 2.15;
}
const FACES = {
  great: '<svg class="face" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="currentColor"/><path d="M7 9.5q1.5-1.6 3 0M14 9.5q1.5-1.6 3 0" stroke="#5a1420" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M7 13.5q5 5.5 10 0z" fill="#5a1420"/></svg>',
  good:  '<svg class="face" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="currentColor"/><circle cx="8.5" cy="10" r="1.4" fill="#2e3a1a"/><circle cx="15.5" cy="10" r="1.4" fill="#2e3a1a"/><path d="M7.5 14.5q4.5 3.6 9 0" stroke="#2e3a1a" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
  ok:    '<svg class="face" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="currentColor"/><circle cx="8.5" cy="10" r="1.4" fill="#4a3a2a"/><circle cx="15.5" cy="10" r="1.4" fill="#4a3a2a"/><path d="M8 15h8" stroke="#4a3a2a" stroke-width="1.6" stroke-linecap="round"/></svg>',
  less:  '<svg class="face" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="currentColor"/><path d="M6.5 8l3.5 1.5M17.5 8L14 9.5" stroke="#4a0f12" stroke-width="1.6" stroke-linecap="round"/><circle cx="8.8" cy="11.3" r="1.3" fill="#4a0f12"/><circle cx="15.2" cy="11.3" r="1.3" fill="#4a0f12"/><path d="M8 17q4-3.5 8 0" stroke="#4a0f12" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
  spill: '<svg class="face" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="currentColor"/><circle cx="8.5" cy="9.6" r="1.7" fill="#4a0f12"/><circle cx="15.5" cy="9.6" r="1.7" fill="#4a0f12"/><ellipse cx="12" cy="16" rx="2.4" ry="3" fill="#4a0f12"/></svg>',
  none:  '<svg class="face" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"/><path d="M8.5 12h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  more:  '<svg class="face" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="currentColor"/><circle cx="8.5" cy="10.5" r="1.3" fill="#4a2010"/><circle cx="15.5" cy="10.5" r="1.3" fill="#4a2010"/><path d="M8.5 15.5q3.5-1.8 7 0" stroke="#4a2010" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M19 4.5q1.6 2.6 0 3.6q-1.6-1 0-3.6z" fill="#7cc4ff"/></svg>',
};
function verdictOf(dev, tol){
  const a = Math.abs(dev);
  if (a <= T.pourfect) return { face: 'great', word: 'ぴったり！' };
  if (a <= tol * 0.5) return { face: 'good', word: '満足' };
  if (a <= tol) return { face: 'ok', word: 'まあいいか' };
  if (dev < 0) return { face: 'less', word: '少ない！', bad: true };
  return { face: 'more', word: '多すぎて悪いな…', bad: true };
}
const pct = (v, tol) => {
  const a = Math.abs(v); let r = Math.round(a * 1000) / 10;
  for (const b of [T.pourfect, tol * 0.5, tol]){ const e = Math.round(b * 1000) / 10; if (a > b && r <= e) r = Math.round(e * 10 + 1) / 10; }
  return (r === 0 ? '±' : v > 0 ? '+' : '−') + r.toFixed(1) + '%';
};
const pm = v => '±' + Math.round(v * 1000) / 10 + '%';
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.4 4.5 6.9 4.5c2 0 3.6 1 5.1 2.9 1.5-1.9 3.1-2.9 5.1-2.9 3.5 0 5.5 3.4 4.2 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>';
const livesHtml = (mark = -1, kind = '') => Array.from({ length: T.lives }, (_, i) => `<span class="lf${i < S.lives ? ' on' : ''}${i === mark ? ' ' + kind : ''}">${HEART}</span>`).join('');
function showIntro(){
  const st = S.stage;
  $('iGuests').textContent = `${st.n}名様のご来店`;
  $('iHint').innerHTML = 'ボトルは指で回して、中の量を見られます' + (st.no <= T.guideStages ? `<br><span class="nb"><b>水色の点線</b>は ${st.n} 等分の目安です。</span><span class="nb">注ぎはじめると消えます。</span>` : '');
  $('intro').hidden = false; $('hud').hidden = false; $('title').hidden = true; $('result').hidden = true;
}
function updateHud(){
  const st = S.stage; if (!st) return;
  $('hStage').textContent = st.no; $('hGuests').textContent = `${st.n}名様`;
  $('hud').classList.toggle('judging', S.phase === 'judge' || S.phase === 'result');
  $('hLives').innerHTML = livesHtml(); $('hLives').setAttribute('aria-label', `ライフ ${S.lives}`);
  $('hInfo').innerHTML = `このボトルを <b>${st.n} 等分</b>　許容 <b>±${Math.round(st.tol * 100)}%</b>`;
  $('hDots').innerHTML = S.glasses.map((G, i) => `<span class="dot${i < S.cur || (i === S.cur && ['lift','settle','judge','result'].includes(S.phase)) ? ' done' : ''}${i === S.cur && !['judge','result','intro'].includes(S.phase) ? ' cur' : ''}${i === S.glasses.length - 1 ? ' auto' : ''}" title="${i + 1}杯目"></span>`).join('');
}
function setHint(html){ const h = $('hHint'); if (h.dataset.v !== html){ h.dataset.v = html; h.innerHTML = html; } }
function toPhase(p){ S.phase = p; S.t = 0; updateHud(); }
const _qy = new THREE.Quaternion(), _ax = new THREE.Vector3(), _cr = new THREE.Vector3(), _ct = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
function inspectStart(x, y){ if (S.phase !== 'intro') return; auInit(); S.insp = { x0: x, y0: y }; }
function inspectMove(x, y){
  if (!S.insp) return; const H = $('app').clientHeight || 800;
  const dx = (x - S.insp.x0) / H, dy = (y - S.insp.y0) / H, mag = Math.hypot(dx, dy);
  if (mag < 1e-4){ B.qInsT.identity(); return; }
  const ang = Math.min(0.97 * Math.PI, mag * T.inspectTiltPerScreen);
  _cr.set(1, 0, 0).applyQuaternion(cam.quaternion); _cr.y = 0; _cr.normalize();
  _ct.set(0, 0, 1).applyQuaternion(cam.quaternion); _ct.y = 0; _ct.normalize();
  const d = _ax.copy(_cr).multiplyScalar(dx).addScaledVector(_ct, dy).normalize();
  const axis = d.clone().crossVectors(_Y, d).normalize();
  B.qInsT.setFromAxisAngle(axis, ang);
  _qy.setFromAxisAngle(_Y, rigYaw); B.qInsT.premultiply(_qy.clone().invert()).multiply(_qy);
}
function inspectEnd(){ S.insp = null; B.qInsT.identity(); }
function beginPouring(){
  $('intro').hidden = true; S.insp = null; B.thT = 0; B.qInsT.identity(); fadeGuidesOut(); if (B.stopper >= 1){ B.stopper = 0.999; sfx('pop'); }
  S.cur = 0; S.rigFrom = S.rigX; S.rigTo = curG().x;
  S.poseFrom = null;
  toPhase('move'); camGo(framePour(0), 1.0); setIdlePose(false); sfx('whoosh');
}
function nextGlass(){
  if (curG().overflow || (B.V <= 1e-9 && !isLastGlass())){ toPhase('settle'); return; }
  if (isLastGlass()){ toPhase('settle'); return; }
  if (T.pourMarks) addMark(B.V);
  S.cur++; S.rigFrom = S.rigX; S.rigTo = curG().x;
  S.ret = null; S.poseFrom = { x: B.mx.x, y: B.my.x, z: B.mz.x }; B.thT = 0;
  toPhase('move'); camGo(framePour(S.cur), 0.9); sfx('whoosh');
}
function grab(y){
  if (S.phase !== 'aim') return;
  auInit();
  S.holding = true; S.dragY0 = S.dragY = y; S.emitted = 0; S.stopT = 0;
  S.ready = BOT.readyAngle(B.V); B.thT = S.ready; S.thMax = S.ready; S.inPlace = false; S.ret = null;
  toPhase('pour'); camGo(framePour(S.cur, true), 0.6);
}
function release(){
  if (!S.holding) return; S.holding = false;
  if (S.phase !== 'pour') return;
  const dry = S.emitted < 0.3e-6 && B.Q <= 0 && B.d <= 0;
  if (dry){
    if (B.th.v > 0) B.th.v = 0; B.thT = Math.min(B.thT, B.th.x);
    S.ret = null; toPhase('aim'); camGo(framePour(S.cur), 0.5); return;
  }
  toLift();
}
function toLift(){ S.holding = false; S.ret = null; B.thT = 0; toPhase('lift'); }
function update(dt){
  S.t += dt;
  const G = curG();
  for (const g of S.glasses){
    if (g.appear !== undefined && g.appear < 1){
      const before = g.appear; g.appear += dt / 0.35;
      const t = clamp(g.appear, 0, 1); g.grp.position.y = 0.05 * (1 - easeOut(t)); g.grp.visible = g.appear > 0;
      if (before < 1 && g.appear >= 1){ g.grp.position.y = 0; sfx('place'); lastSig = ''; }
    }
  }
  rigExit(dt); fadeMarks(dt); fadeGuides(dt); toastUpdate(dt);
  S.hold = false;
  if (S.phase !== 'pour' && S.phase !== 'auto') S.dT = -1;
  switch (S.phase){
    case 'title': setHint(''); break;
    case 'intro': {
      setHint('');
      const t0 = 0.35 + S.glasses.length * 0.13;
      if (S.t > t0 && !S.introB){ S.introB = true; S.rigFrom = S.rigX; S.rigTo = S.glasses[0].x; camGo(frameBottle(), 1.4); sfx('whoosh'); }
      if (S.introB) S.rigX = lerp(S.rigFrom, S.rigTo, easeInOut(clamp((S.t - t0) / 1.1, 0, 1)));
      const C = inspectCenter();
      B.mxT = C.x; B.myT = C.y + BOT.L / 2; B.mzT = C.z; B.thT = 0;
      if (!S.insp) B.qInsT.identity();
      break;
    }
    case 'move': {
      const dur = clamp(Math.abs(S.rigTo - S.rigFrom) * 1.6, 0.6, 1.3);
      const k = easeInOut(clamp(S.t / dur, 0, 1)); S.rigX = lerp(S.rigFrom, S.rigTo, k);
      if (S.poseFrom){ const p = idlePose(G); B.mxT = lerp(S.poseFrom.x, p.x, k); B.myT = lerp(S.poseFrom.y, p.y, k); B.mzT = lerp(S.poseFrom.z, p.z, k); }
      else B.myT = Math.abs(S.rigTo - S.rigX) > T.lowerNear ? T.inspectY + BOT.L / 2 : idlePose(G).y;
      if (S.t >= dur){ S.rigX = S.rigTo; if (isLastGlass()){ toPhase('auto'); S.ready = BOT.readyAngle(B.V); S.inPlace = false; S.fin = 0; camGo(frameFinale(), 0.6); } else toPhase('aim'); }
      setHint(''); break;
    }
    case 'aim':
      if (B.Q > 0){ toLift(); break; }
      returnPose(G);
      B.myT = idlePose(G).y + Math.sin(S.clock * 1.7) * 0.002;
      setHint(T.pourMarks && S.cur > 0 && S.stageNo <= 2 ? 'ボトルの<b>線の間隔</b>をそろえると同じ量' : '<span class="nb">画面を押したまま</span><span class="nb"><b>下へなぞる</b>と</span><span class="nb">ボトルが傾きます</span>'); break;
    case 'pour': {
      const H = $('app').clientHeight || 800;
      setTiltWant(clamp(S.ready + (S.dragY - S.dragY0) / H * T.tiltPerScreen, S.ready - T.tiltBelow, T.tiltMax));
      holdUntilInPlace(G);
      pourPose(G);
      S.thMax = Math.max(S.thMax, B.thT);
      if (S.emitted > 0.3e-6 && B.d <= 0 && B.Q < 0.5e-6 && B.thT < S.thMax - T.raiseDeg) S.stopT += dt; else S.stopT = 0;
      if (S.stopT > T.liftAfterStop || B.V <= 0 || G.overflow) toLift();
      setHint(S.emitted > 0.3e-6 ? '<b>指を離す</b>とこのグラスはおしまい' : 'もう少し下へ…');
      break;
    }
    case 'lift':
      setHint(''); returnPose(G);
      if (S.t > 0.5 && !chains.length && !drops.some(d => d.vol > 0) && (returned() || S.t > 2)){
        if (S.emitted < 0.3e-6 && !G.overflow && B.V > 1e-9 && !isLastGlass()){ toPhase('aim'); camGo(framePour(S.cur), 0.5); }
        else nextGlass();
      }
      break;
    case 'auto': {
      setTiltWant(lerp(S.ready - 4 * DEG, T.tiltMax, easeInOut(clamp(S.t / T.autoRamp, 0, 1))));
      holdUntilInPlace(G);
      pourPose(G);
      S.fin += dt;
      setHint('最後のグラスに<b>残りをぜんぶ</b>注ぎます');
      if (G.overflow){ toLift(); break; }
      if (S.t > T.autoRamp * 0.6 && B.V <= 0 && !chains.length && !drops.some(d => d.vol > 0) && B.Q === 0){ S.ret = null; toPhase('settle'); }
      break;
    }
    case 'settle':
      setHint('');
      if (S.rigOut === undefined || S.rigTo !== S.rigOut) returnPose(G); else B.thT = 0;
      if (S.t > 0.25 && S.rigTo !== S.rigOut){ S.rigOut = S.glasses[S.glasses.length - 1].x + 0.9; S.rigFrom = S.rigX; S.rigTo = S.rigOut; S.rigT = 0; }
      if (S.t > 0.6){ startJudge(); }
      break;
    case 'judge': judgeUpdate(); break;
  }
}
function rigExit(dt){ if (S.rigOut !== undefined && S.rigTo === S.rigOut && S.rigT < 1){ S.rigT = Math.min(1, S.rigT + dt / 1.1); S.rigX = lerp(S.rigFrom, S.rigTo, easeInOut(S.rigT)); B.myT = idlePose(curG()).y + 0.12 * easeInOut(S.rigT); } }
const BAR_H = 92;
const barY = v => clamp(v / (S.stage.target * 1.5), 0, 1) * BAR_H;
function startJudge(){
  const st = S.stage;
  const ovIdx = S.glasses.findIndex(G => G.overflow);
  const rows = S.glasses.map((G, i) => {
    const dev = (G.vol - st.target) / st.target; let v = verdictOf(dev, st.tol), skipped = false;
    if (G.overflow) v = { face: 'spill', word: 'あふれた！', bad: true };
    else if (ovIdx >= 0 && i > ovIdx && G.vol < 0.05){ v = { face: 'none', word: 'まだ' }; skipped = true; }
    return { G, vol: G.vol, dev, v, skipped };
  });
  const overflow = ovIdx >= 0;
  const pass = !overflow && rows.every(r => Math.abs(r.dev) <= st.tol);
  const perfect = pass && rows.every(r => Math.abs(r.dev) <= T.pourfect);
  const worst = rows.reduce((m, r) => Math.abs(r.dev) > Math.abs(m) ? r.dev : m, 0);
  const n = rows.length, rise = T.judgeRise[n <= 3 ? 0 : n <= 5 ? 1 : 2];
  let t = T.judgeLead;
  rows.forEach((r, i) => { r.t0 = t; r.dur = r.skipped ? 0.1 : rise * (i === n - 1 && !overflow ? T.judgeLast : 1); t += r.dur + T.judgeGap; });
  S.result = { rows, pass, perfect, overflow, ovIdx, worst, tEnd: t - T.judgeGap + T.judgeHold };
  S.revealed = 0;
  toPhase('judge');
  camGo(frameOverview(true), 1.1);
  labKey = '';
  $('labels').innerHTML = rows.map((r, i) => `<div class="lab wait v-${r.v.face}" id="lab${i}" hidden>${FACES[r.v.face]}<span class="w">${r.v.word}</span></div>`).join('');
  const card = $('result'); card.classList.add('judging'); card.classList.remove('open');
  $('rStage').textContent = `STAGE ${st.no}　${st.n}名様`;
  $('rTitle').textContent = 'お客様の反応は…';
  const lo = barY(st.target * (1 - st.tol)), hi = barY(st.target * (1 + st.tol));
  $('rBars').innerHTML = rows.map((r, i) => `<div class="bar" id="bar${i}">
      <div class="col"><div class="band" style="bottom:${lo}px;height:${hi - lo}px"></div>
      <div class="fill ${WINES[st.wine].fill}" style="height:0px"></div><div class="tgt" style="bottom:${barY(st.target)}px"></div></div>
      ${FACES[r.v.face]}<span class="dv">${r.G.overflow ? 'あふれ' : r.skipped ? '—' : pct(r.dev, st.tol)}</span></div>`).join('');
  rows.forEach((r, i) => { const el = $('bar' + i); r.el = { bar: el, col: el.firstElementChild, fill: el.querySelector('.fill'), lab: $('lab' + i) }; r.lo = lo; r.hi = hi; });
  $('rLegend').innerHTML = `<span><i class="lg-t"></i>ひとり分</span><span><i class="lg-b"></i>許容 ±${Math.round(st.tol * 100)}%</span>`;
  const el = $('app');
  card.hidden = el.clientHeight < 520 && el.clientWidth > el.clientHeight;
}
function judgeUpdate(){
  const R = S.result, n = R.rows.length;
  while (S.revealed < n){
    const r = R.rows[S.revealed]; if (S.t < r.t0) break;
    const el = r.el, k = clamp((S.t - r.t0) / r.dur, 0, 1), h = barY(r.vol) * easeOut(k);
    if (!r.on){ r.on = true; r.blip = -1; el.bar.classList.add('now'); el.lab.hidden = false; }
    el.fill.style.height = h.toFixed(1) + 'px';
    el.col.classList.toggle('in', h >= r.lo && h <= r.hi); el.col.classList.toggle('over', h > r.hi);
    if (!r.skipped && S.t - r.blip > 0.05){ r.blip = S.t; sfx('rise', h / BAR_H); }
    if (k < 1) break;
    el.bar.classList.remove('now'); el.bar.classList.add('done', 'v-' + r.v.face);
    el.col.classList.remove('in', 'over');
    if (r.v.bad) el.col.classList.add('miss', r.G.overflow || r.dev > 0 ? 'hi' : 'lo'); else if (!r.skipped) el.col.classList.add('hit');
    el.lab.classList.remove('wait');
    const f = r.v.face;
    if (f === 'great'){ sfx('ding', 2); sfx('happy'); } else if (f === 'good') sfx('ding', 1); else if (f === 'ok') sfx('ding', 0);
    else if (f === 'more') sfx('sorry'); else if (f === 'none') sfx('tick'); else sfx('grumble');
    S.revealed++;
  }
  if (S.revealed >= n && S.t > R.tEnd) showResult();
}
function showResult(){
  const R = S.result, st = S.stage, card = $('result');
  let mark = -1, kind = '';
  if (R.pass){
    S.served++;
    if (R.perfect && S.lives < T.lives){ S.lives++; mark = S.lives - 1; kind = 'gain'; }
  } else { S.lives = Math.max(0, S.lives - 1); mark = S.lives; kind = 'lost'; }
  const over = !R.pass && S.lives <= 0;
  const cleared = S.served;
  if (S.official && cleared > SAVE.bestStage){ SAVE.bestStage = cleared; writeSave(SAVE); }
  if (R.pass) S.run.push({ no: st.no, g: st.ids.slice(), t: st.total, v: R.rows.map(r => Math.round(r.vol * 10)) });
  $('rTitle').textContent = R.overflow ? 'グラスからあふれました' : R.perfect ? 'POURFECT！ 全員ぴったり' : R.pass ? '全員ご満足いただけました' : 'ご不満のお客様が…';
  const bad = R.rows.filter(r => Math.abs(r.dev) > st.tol).length;
  const why = R.overflow ? `${R.ovIdx + 1} 杯目のグラスです。` : `${bad}名様が許容 ±${Math.round(st.tol * 100)}% の外でした。`;
  const nb = t => `<span class="nb">${t}</span>`;
  $('rSub').innerHTML = !R.pass ? nb(why) + nb(over ? 'ゲームオーバー' : 'ライフが 1 つ減りました')
    : R.perfect ? (kind === 'gain' ? nb(`全員がひとり分の ${pm(T.pourfect)} 以内でした。`) + nb('ライフが 1 つ戻りました') : nb(`全員がひとり分の ${pm(T.pourfect)} 以内でした`)) : nb(`いちばん離れたお客様でも ${pct(R.worst, st.tol)}`);
  $('rLine').hidden = !(over || mark >= 0);
  $('rLeft').innerHTML = over ? `ご満足いただけたのは <b>${cleared}</b> 組` : `ライフ <span class="lives" role="img" aria-label="ライフ ${S.lives}">${livesHtml(mark, kind)}</span>`;
  $('rRight').innerHTML = !over ? '' : S.official && cleared > S.best0 ? '<i class="newrec">新記録</i>' : SAVE.bestStage > 0 ? `ベスト <b>${SAVE.bestStage}</b> 組` : '';
  $('btnNext').hidden = over; $('btnRetry').hidden = !over; $('btnTitle').hidden = !over;
  card.hidden = false; card.classList.remove('judging');
  clearTimeout(showResult.tm); showResult.tm = setTimeout(() => { if (!card.classList.contains('judging')) card.classList.add('open'); }, 520);
  sfx(R.perfect ? 'pourfect' : R.pass ? 'ok' : 'fail');
  if (R.pass) S.toast = { t: 0, reps: R.perfect ? 2 : 1, hit: 0, done: false };
  if (R.perfect){ $('app').classList.add('pourfect'); sparkle(); }
  toPhase('result');
  if (mark >= 0) $('hLives').innerHTML = livesHtml(mark, kind);
  if (WEB) WEB.onResult({ pass: R.pass, over, cleared, stages: S.run, official: S.official });
}
function toastUpdate(dt){
  const A = S.toast; if (!A || A.done) return;
  A.t += dt;
  const n = S.glasses.length, tin = T.toastIn, th = T.toastHold, tb = 0.2, t = A.t;
  const hits = A.reps === 2 ? [tin, tin + th + tb * 2] : [tin], tOut = hits[hits.length - 1] + th;
  let k = 1, up = 1;
  if (t < tin){ k = easeInOut(t / tin); up = easeOut(t / tin); }
  else if (A.reps === 2 && t > tin + th && t < tin + th + tb * 2){ const u = (t - tin - th) / tb; k = 1 - 0.4 * (u < 1 ? easeInOut(u) : 1 - easeInOut(u - 1)); }
  else if (t >= tOut){ const u = clamp((t - tOut) / T.toastOut, 0, 1); k = up = 1 - easeInOut(u); if (u >= 1){ A.done = true; sfx('place'); } }
  S.glasses.forEach((G, i) => { G.grp.position.x = G.x - (T.rowGap - T.toastGap) * (i - (n - 1) / 2) * k; G.grp.position.y = T.toastLift * up; });
  while (A.hit < hits.length && t >= hits[A.hit]){
    A.hit++; sfx('clink', n); vibrate(15);
    S.glasses.forEach((G, i) => { if (i > 0) waveKick(G.wave, -0.7, 0, T.toastKick); if (i < n - 1) waveKick(G.wave, 0.7, 0, T.toastKick); G.wave.energy = Math.max(G.wave.energy, 1e-3); G.dirty = true; });
  }
  lastSig = '';
}
function sparkle(){
  const el = $('app'), W = el.clientWidth, H = el.clientHeight; let html = '';
  for (const G of S.glasses){
    _p.set(G.x, G.ty.rimY + 0.01, 0).project(cam); const x = (_p.x + 1) / 2 * W, y = (1 - _p.y) / 2 * H;
    for (let j = 0; j < 3; j++) html += `<i class="spark" style="left:${(x + (Math.random() - 0.5) * 40).toFixed(1)}px;top:${(y - 8 - Math.random() * 34).toFixed(1)}px;animation-delay:${(0.08 + G.i * 0.07 + j * 0.17).toFixed(2)}s"></i>`;
  }
  $('labels').insertAdjacentHTML('beforeend', html);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _qz = new THREE.Quaternion(), _Z = new THREE.Vector3(0, 0, 1), _vh = new THREE.Vector3(), _qy2 = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qd = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const _nv = new THREE.Vector3(), _nr = new THREE.Vector3(), _ax2 = new THREE.Vector3(), _mw = new THREE.Vector3();
const _T = new THREE.Vector3(), _U = new THREE.Vector3(), _Bv = new THREE.Vector3(), _N0 = new THREE.Vector3();
function keepInside(e){
  let G = S.glasses[e.g], rW;
  if (G){
    const yRel = e.y - (G.grp.position.y + G.ty.d.bowlY);
    rW = G.ty.rFn(clamp(yRel, 0, G.ty.depth));
  } else {
    G = curG(); if (!G) return;
    const top = G.grp.position.y + G.ty.rimY, dy = e.y - top;
    if (dy < 0 || dy > e.r || Math.hypot(e.x - G.x, e.z) > G.ty.rimR) return;
    rW = G.ty.rimR;
  }
  const dx = e.x - G.x, dz = e.z, rr = Math.hypot(dx, dz);
  if (e.r > rW * 0.45) e.r = Math.max(0.0005, rW * 0.45);
  const lim = rW - e.r - 0.0003;
  if (rr > lim && rr > 1e-6){ const k = Math.max(0, lim) / rr; e.x = G.x + dx * k; e.z = dz * k; }
}
function buildStream(){
  const pos = sGeo.attributes.position.array, nor = sGeo.attributes.normal.array, idx = sGeo.index.array;
  let vi = 0, ii = 0;
  _N0.set(yawS, 0, yawC);
  for (const ch of chains){
    const list = [];
    if (ch.end && S.clock - ch.endT < 0.03) list.push({ x: ch.end.x, y: ch.end.y, z: ch.end.z, r: ch.end.r, wf: ch.end.wf, g: ch.end.g === undefined ? -1 : ch.end.g });
    for (const p of ch.pts) list.push({ x: p.x, y: p.y, z: p.z, r: streamR(p), age: p.age, wf: p.wall ? p.wf : null, g: p.wall ? -1 : p.inG });
    for (const e of list) if (!e.wf) keepInside(e);
    if (list.length < 2) continue;
    if (vi / SSEG + list.length > SMAX) break;
    const attached = ch === B.chain, base = vi / SSEG;
    for (let j = 0; j < list.length; j++){
      const a = list[Math.max(0, j - 1)], b = list[Math.min(list.length - 1, j + 1)], p = list[j];
      _T.set(b.x - a.x, b.y - a.y, b.z - a.z); if (_T.lengthSq() < 1e-14) _T.set(0, 1, 0); _T.normalize();
      _Bv.crossVectors(_T, _N0); if (_Bv.lengthSq() < 1e-8) _Bv.set(1, 0, 0); _Bv.normalize(); _U.crossVectors(_Bv, _T);
      let r = p.r, sc = 1;
      if (!attached && j === list.length - 1) sc = 0.45;
      if (j === 0 && !(ch.end && S.clock - ch.endT < 0.03)) sc = 0.45;
      r *= sc;
      const fallW = smooth(0.01, 0.12, p.age || 0.2), wf = p.wf;
      if (wf){
        let Ax = wf.ax, Ay = wf.ay, Az = wf.az, Nx = wf.nx, Ny = wf.ny, Nz = wf.nz;
        if ((Ay * Nz - Az * Ny) * _T.x + (Az * Nx - Ax * Nz) * _T.y + (Ax * Ny - Ay * Nx) * _T.z < 0){ Nx = -Nx; Ny = -Ny; Nz = -Nz; }
        if (Ax * _U.x + Ay * _U.y + Az * _U.z < 0){ Ax = -Ax; Ay = -Ay; Az = -Az; Nx = -Nx; Ny = -Ny; Nz = -Nz; }
        const hh = wf.h * sc;
        for (let k = 0; k < SSEG; k++){
          const ang = k / SSEG * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
          const ww = wf.w * sc * (1 + 0.08 * Math.sin(2 * ang + S.clock * 17 + j * 0.7));
          pos[vi*3] = p.x + ca * ww * Ax + sa * hh * Nx; pos[vi*3+1] = p.y + ca * ww * Ay + sa * hh * Ny; pos[vi*3+2] = p.z + ca * ww * Az + sa * hh * Nz;
          let mx = ca * hh * Ax + sa * ww * Nx, my = ca * hh * Ay + sa * ww * Ny, mz = ca * hh * Az + sa * ww * Nz; const ml = Math.hypot(mx, my, mz) || 1;
          nor[vi*3] = mx / ml; nor[vi*3+1] = my / ml; nor[vi*3+2] = mz / ml; vi++;
        }
        continue;
      }
      for (let k = 0; k < SSEG; k++){
        const ang = k / SSEG * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
        const wob = 1 + 0.13 * fallW * Math.sin(3 * ang + S.clock * 31 + j * 0.55) + 0.06 * Math.sin(2 * ang - S.clock * 23 + j * 0.9);
        const nx = ca * _U.x + sa * _Bv.x, ny = ca * _U.y + sa * _Bv.y, nz = ca * _U.z + sa * _Bv.z;
        pos[vi*3] = p.x + nx * r * wob; pos[vi*3+1] = p.y + ny * r * wob; pos[vi*3+2] = p.z + nz * r * wob;
        nor[vi*3] = nx; nor[vi*3+1] = ny; nor[vi*3+2] = nz; vi++;
      }
    }
    for (let j = 0; j < list.length - 1; j++) for (let k = 0; k < SSEG; k++){
      const a = (base + j) * SSEG + k, b = (base + j) * SSEG + (k + 1) % SSEG, c = (base + j + 1) * SSEG + k, d = (base + j + 1) * SSEG + (k + 1) % SSEG;
      idx[ii++] = a; idx[ii++] = b; idx[ii++] = c; idx[ii++] = b; idx[ii++] = d; idx[ii++] = c;
    }
  }
  sGeo.setDrawRange(0, ii);
  if (ii > 0) for (const [a, n] of [[sGeo.attributes.position, vi * 3], [sGeo.attributes.normal, vi * 3], [sGeo.index, ii]]){ a.clearUpdateRanges(); a.addUpdateRange(0, n); a.needsUpdate = true; }
  streamF.visible = streamB.visible = ii > 0;
}
let dropsWarmed = false;
function buildDrops(){
  let n = 0;
  for (const p of drops){
    if (n >= DMAX) break;
    const sp = Math.hypot(p.vx, p.vy, p.vz), st = 1 + Math.min(1.2, sp * 0.5);
    _p.set(p.x, p.y, p.z);
    if (sp > 0.05){ _T.set(p.vx / sp, p.vy / sp, p.vz / sp); _q.setFromUnitVectors(_s.set(0, 1, 0), _T); } else _q.identity();
    _s.set(p.r / Math.sqrt(st), p.r * st, p.r / Math.sqrt(st));
    _m.compose(_p, _q, _s); dropF.setMatrixAt(n++, _m);
  }
  if (!n && !dropsWarmed){ dropsWarmed = true; dropF.setMatrixAt(0, _m.makeScale(0, 0, 0)); n = 1; }
  if (n){ const a = dropF.instanceMatrix; a.clearUpdateRanges(); a.addUpdateRange(0, n * 16); a.needsUpdate = true; }
  dropF.count = dropB.count = n;
}
function buildFoam(dt){
  const pos = fGeo.attributes.position.array, sz = fGeo.attributes.aSize.array, al = fGeo.attributes.aAlpha.array;
  let n = 0;
  const drag = Math.pow(0.97, dt * 60);
  for (let i = foam.length - 1; i >= 0; i--){
    const f = foam[i]; f.life += dt; if (f.life > f.max || !S.glasses.includes(f.G)){ foam.splice(i, 1); continue; }
    f.x += f.vx * dt; f.z += f.vz * dt; f.vx *= drag; f.vz *= drag;
    const rr = Math.hypot(f.x, f.z); if (rr > 0.93){ f.x *= 0.93 / rr; f.z *= 0.93 / rr; }
  }
  for (const f of foam){
    const G = f.G, R = Math.max(0.001, G.ty.rFn(G.yl) - 0.0008);
    pos[n*3] = G.x + f.x * R; pos[n*3+1] = G.grp.position.y + G.ty.d.bowlY + G.yl + 0.0006 + waveSample(G.wave, f.x, f.z) * T.waveAmp; pos[n*3+2] = f.z * R;
    sz[n] = f.size * (0.6 + 0.4 * smooth(0, 0.15, f.life)); al[n] = (1 - smooth(f.max * 0.6, f.max, f.life)) * 0.85 * (G.vol > 0.3 ? 1 : 0); n++;
  }
  fGeo.setDrawRange(0, n);
  if (n) for (const [a, k] of [[fGeo.attributes.position, 3], [fGeo.attributes.aSize, 1], [fGeo.attributes.aAlpha, 1]]){ a.clearUpdateRanges(); a.addUpdateRange(0, n * k); a.needsUpdate = true; }
}
const _v2 = new THREE.Vector2();
function render(){
  renderer.getDrawingBufferSize(_v2);
  if (!_v2.x || !_v2.y) return;
  if (backRT.width !== _v2.x || backRT.height !== _v2.y){ sceneRT.setSize(Math.max(1, _v2.x >> 1), Math.max(1, _v2.y >> 1)); backRT.setSize(_v2.x, _v2.y); WU.uRes.value.copy(_v2); }
  scene.updateMatrixWorld();
  cam.layers.set(L_OPAQUE); renderer.setRenderTarget(sceneRT); renderer.setClearColor(0x120808, 1); renderer.clear(); renderer.render(scene, cam);
  cam.layers.set(L_BACK); renderer.setRenderTarget(backRT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
  renderer.setRenderTarget(null); renderer.setClearColor(0x120808, 1); renderer.clear();
  cam.layers.set(L_OPAQUE); renderer.render(scene, cam);
  cam.layers.set(L_WINE); renderer.render(scene, cam);
  cam.layers.set(L_FX); renderer.render(scene, cam);
}
function resize(){
  lastSig = '';
  const el = $('app'), w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight;
  renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); setRigYaw();
  foamMat.uniforms.uScale.value = h * DPR / (2 * Math.tan(cam.fov * DEG / 2));
}
window.addEventListener('resize', resize);
let lastT = performance.now(), acc = 0, pourMeter = 0, splashMeter = 0;
S.clock = 0;
const frameSig = () => [cam.position.x, cam.position.y, cam.position.z, cam.quaternion.x, cam.quaternion.y, S.rigX, B.mx.x, B.my.x, B.mz.x, B.th.x, bottle.rotation.y, B.V,
  pivot.quaternion.x, pivot.quaternion.y, pivot.quaternion.z, B.sl.x, B.sl.z, B.stopper].map(v => v.toFixed(6)).join();
const busy = () => (S.toast && !S.toast.done) || chains.length || drops.length || foam.length || marks.some(m => m.userData.t < 1) || guides.length && guides.some(m => m.userData.out || m.userData.t < 1) || S.glasses.some(G => G.wave.energy > 1e-7 || (G.appear !== undefined && G.appear < 1));
function frame(now){
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  tick(dt);
  const sig = frameSig();
  if (busy() || sig !== lastSig) try { lastSig = sig; render(); } catch (e) { if (!frame.errs) frame.errs = 0; if (frame.errs++ < 3) console.error('render', e, { level: B.level, my: B.my.x, cam: cam.position.toArray() }); }
  if (DEBUG) debugOut();
}
function tick(dt){
  S.clock += dt;
  update(dt);
  auBgmLevel();
  acc += dt; let steps = 0;
  while (acc >= T.simDt && steps < 16){ simStep(T.simDt); acc -= T.simDt; steps++; }
  if (steps >= 16) acc = 0;
  B.qIns.slerp(B.qInsT, 1 - Math.exp(-dt * (S.insp ? 14 : 4)));
  rig.position.x = S.rigX;
  _qz.setFromAxisAngle(_Z, B.th.x); pivot.quaternion.copy(B.qIns).multiply(_qz);
  _vh.set(0, BOT.L / 2, 0).applyQuaternion(B.qIns);
  pivot.position.set(B.mx.x + _vh.x, B.my.x + _vh.y - BOT.L / 2, B.mz.x + _vh.z);
  _qy2.setFromAxisAngle(_Y, rigYaw); _qw.copy(_qy2).multiply(pivot.quaternion);
  const sl = B.sl;
  if (S.phase === 'pour' || S.phase === 'auto'){ sl.x = sl.z = sl.vx = sl.vz = 0; }
  else {
    if (B.qPrev && (S.phase === 'intro' || S.phase === 'move')){
      _qd.copy(_qw).multiply(_qp.copy(B.qPrev).invert());
      _nv.set(sl.x, 1, sl.z).normalize(); _nr.copy(_nv).applyQuaternion(_qd);
      const ry = Math.max(_nr.y, 0.25);
      sl.x = lerp(sl.x, _nr.x / ry, T.sloshDrag); sl.z = lerp(sl.z, _nr.z / ry, T.sloshDrag);
    }
    const w = T.sloshOmega, z = T.sloshZeta;
    sl.vx += (-w * w * sl.x - 2 * z * w * sl.vx) * dt; sl.vz += (-w * w * sl.z - 2 * z * w * sl.vz) * dt;
    sl.x = clamp(sl.x + sl.vx * dt, -0.5, 0.5); sl.z = clamp(sl.z + sl.vz * dt, -0.5, 0.5);
  }
  B.qPrev = (B.qPrev || new THREE.Quaternion()).copy(_qw);
  const n = bClipN.value.set(sl.x, 1, sl.z).normalize();
  _ax2.set(0, 1, 0).applyQuaternion(_qw);
  const thEff = Math.acos(clamp(_ax2.dot(n), -1, 1));
  const lv = B.V > 0 ? BOT.levelAt(thEff, B.V) : -1;
  const px = pivot.position.x, pz = pivot.position.z;
  _mw.set(S.rigX + px * yawC + pz * yawS, pivot.position.y, -px * yawS + pz * yawC);
  bClip.value = Number.isFinite(lv) && B.V > 0 ? n.dot(_mw) + lv : -10;
  if (B.stopper < 1 && B.stopper > 0) B.stopper = Math.max(0, B.stopper - dt / 0.35);
  if (S.phase === 'title') B.stopper = 1;
  stopper.visible = B.stopper > 0; stopper.position.y = BOT.L + easeOut(1 - B.stopper) * 0.05;
  bWineF.visible = bWineB.visible = B.V > 0.15e-6;
  spring(B.spin, (S.phase === 'title' ? 0 : Math.PI) - rigYaw, 5, dt); spring(B.spinOff, B.spinOffT, 9, dt); bottle.rotation.y = B.spin.x + B.spinOff.x;
  const bsx = B.mx.x + Math.sin(B.th.x) * BOT.L * 0.5, bx = S.rigX + bsx * yawC + B.mz.x * yawS, bz = -bsx * yawS + B.mz.x * yawC;
  bShadow.position.set(bx, 0.0005, bz + 0.03); const bh = B.my.x - BOT.L * Math.cos(B.th.x) * 0.5; bShadow.scale.set(0.09 + bh * 0.2, 1, 0.14 + bh * 0.3); bShadow.material.opacity = 0.3 * clamp(1 - bh * 2.2, 0, 1);
  for (const G of S.glasses){
    if (G.wave.energy > 1e-8 || G === curG()){
      const h = G === curG() ? 1 / 120 : 1 / 60;
      G.waveAcc += dt;
      for (let k = 0; G.waveAcc >= h - 1e-9 && k < 8; k++){ waveStep(G.wave); G.waveAcc -= h; }
      if (G.waveAcc >= h) G.waveAcc = 0;
    } else G.waveAcc = 0;
    updateGlassVisual(G, dt);
  }
  buildStream(); buildDrops(); buildFoam(dt);
  const G = curG();
  if (G){
    const inflow = G.inflow / Math.max(dt, 1e-3); G.inflow = 0;
    pourMeter += (inflow - pourMeter) * (1 - Math.exp(-dt / 0.05));
    const col = Math.max(0.012, G.ty.rimY - G.ty.d.bowlY - G.yl + 0.012);
    auPour({ in: pourMeter, out: B.Q * 1e6, air: (BOT.total - B.V) * 1e6, pitch: clamp(343 / (4 * col), 300, 2800), splash: smooth(0.8, 1.8, B.my.x - G.ty.d.bowlY - G.yl), sub: B.sub || 0 }, dt);
  } else auPour({ in: 0, out: 0, air: 0, pitch: 600, splash: 0, sub: 0 }, dt);
  camUpdate(dt);
  if (S.phase === 'judge' || S.phase === 'result') placeLabels();
}
let labKey = '';
function placeLabels(){
  const el = $('app'), W = el.clientWidth, H = el.clientHeight;
  const card = $('result'), lo = hudRowBottom() + LAB.gap, hi = (card.hidden ? H : card.offsetTop) - LAB.gap;
  const key = [cam.position.x, cam.position.y, cam.position.z, cam.quaternion.x, cam.quaternion.y, cam.aspect].map(v => v.toFixed(5)).join() + W + 'x' + H + (S.toast && !S.toast.done ? S.toast.t.toFixed(3) : '') + '|' + lo.toFixed(1) + '|' + hi.toFixed(1);
  if (key === labKey) return;
  labKey = key;
  const x0 = S.glasses.map(G => (_p.set(G.x, G.ty.rimY + 0.012, 0).project(cam).x + 1) / 2 * W);
  const xs = S.glasses.map(G => { _p.set(G.grp.position.x, G.ty.rimY + 0.012 + G.grp.position.y, 0).project(cam); return [(_p.x + 1) / 2 * W, (1 - _p.y) / 2 * H]; });
  let gap = 1e9; for (let i = 1; i < x0.length; i++) gap = Math.min(gap, x0[i] - x0[i-1]);
  const compact = labCompact = gap < 74; $('labels').classList.toggle('compact', compact);
  const top = Math.min(...xs.map(p => p[1]));
  const need = compact ? LAB.hCompact + LAB.stagger : LAB.h;
  const cl = card.hidden ? 0 : card.offsetLeft - card.offsetWidth / 2 - LAB.half, cr = card.hidden ? 0 : card.offsetLeft + card.offsetWidth / 2 + LAB.half;
  const fit = (y, x) => clamp(y, lo + need, x === undefined || (x > cl && x < cr) ? hi : H);
  $('labels').classList.toggle('off', hi - lo < need);
  xs.forEach(([x, y], i) => { const lab = $('lab' + i); if (!lab) return; lab.style.left = x + 'px'; lab.style.top = (compact ? fit(top) - (i % 2) * LAB.stagger : fit(y, x)) + 'px'; });
}
function debugOut(){
  const d = $('dbg'); if (!d) return; d.hidden = false;
  d.textContent = `phase ${S.phase}  θ ${(B.th.x / DEG).toFixed(1)}° (ready ${(S.ready / DEG).toFixed(1)}°)\nbottle ${(B.V * 1e6).toFixed(1)}ml  d ${(B.d * 1000).toFixed(1)}mm  Q ${(B.Q * 1e6).toFixed(1)}ml/s\n` +
    S.glasses.map(G => `${G.i + 1}:${G.ty.name} ${G.vol.toFixed(1)}/${G.ty.cap.toFixed(0)}ml`).join('\n') + `\nspilled ${S.spilled.toFixed(2)}ml  chains ${chains.length} drops ${drops.length} foam ${foam.length}`;
}
let pid = null, pidType = '';
function endPointer(){
  if (pid === null) return;
  const id = pid; pid = null;
  try { if (cv.hasPointerCapture(id)) cv.releasePointerCapture(id); } catch (er) {}
  if (S.insp) inspectEnd(); else release();
}
cv.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  if (pid !== null && e.isPrimary){
    let held = false; try { held = cv.hasPointerCapture(pid); } catch (er) {}
    if (e.pointerType === pidType || !held) endPointer();
  }
  if (pid !== null || (S.phase !== 'aim' && S.phase !== 'intro')) return;
  pid = e.pointerId; pidType = e.pointerType; try { cv.setPointerCapture(pid); } catch (er) {}
  if (S.phase === 'intro') inspectStart(e.clientX, e.clientY); else grab(e.clientY);
});
cv.addEventListener('pointermove', e => { if (e.pointerId !== pid) return; if (S.insp) inspectMove(e.clientX, e.clientY); else S.dragY = e.clientY; });
const up = e => { if (e.pointerId === pid) endPointer(); };
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) cv.addEventListener(ev, up);
cv.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('blur', endPointer);
$('btnStart').addEventListener('click', () => { if (S.phase !== 'title') return; auInit(); sfx('tap'); startRun(); });
$('btnGo').addEventListener('click', () => { if (S.phase !== 'intro' || S.t < 0.6) return; auInit(); sfx('tap'); beginPouring(); });
$('btnNext').addEventListener('click', () => { if (S.phase !== 'result') return; auInit(); sfx('tap'); $('result').hidden = true; loadStage(S.stageNo + 1); });
$('btnRetry').addEventListener('click', () => { if (S.phase !== 'result') return; auInit(); sfx('tap'); $('result').hidden = true; startRun(); });
$('btnTitle').addEventListener('click', () => { if (S.phase !== 'result') return; auInit(); sfx('tap'); $('result').hidden = true; toTitle(); });
const sbtn = $('btnSound');
sbtn.setAttribute('aria-pressed', String(AU.on));
sbtn.addEventListener('click', () => { auInit(); auSetOn(!AU.on); SAVE.sound = AU.on; writeSave(SAVE); sbtn.setAttribute('aria-pressed', String(AU.on)); });
document.addEventListener('visibilitychange', () => {
  lastSig = '';
  if (document.hidden){
    endPointer();
    if (AU.ctx && AU.ctx.state === 'running') try { const p = AU.ctx.suspend(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  else auResume();
});
for (const ev of ['pageshow', 'focus']) window.addEventListener(ev, () => { lastSig = ''; auResume(); });
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, auResume, true);
function gallery(ids, fill = 0.32, wine = 'red'){
  clearStage();
  $('title').hidden = true; $('intro').hidden = true; $('result').hidden = true; $('hud').hidden = true;
  S.stage = { no: 0, n: ids.length, ids, wine, tol: T.tol, total: 0, target: 100 };
  const xs = buildRow(ids); S.glasses = ids.map((id, i) => makeGlass(id, xs[i], i));
  for (const G of S.glasses){ G.vol = G.ty.cap * fill; G.dirty = true; }
  setWine(wine); S.cur = 0; S.rigX = xs[xs.length - 1] + 2; S.phase = 'gallery';
  camGo(frameOverview(), 0.6);
}
function startRun(){
  if (WEB && WEB.onRunStart) try { WEB.onRunStart(); } catch (e) { console.error('web', e); }
  S.official = START_STAGE === 1 && !DEBUG;
  S.best0 = SAVE.bestStage; S.run = []; S.lives = T.lives; S.served = 0;
  S.rng = mulberry32((Math.random() * 2 ** 31) | 0);
  $('title').hidden = true;
  loadStage(START_STAGE);
}
function toTitle(){
  clearStage(); clearMarks(); clearGuides(); B.stopper = 1; B.qIns.identity(); B.qInsT.identity();
  S.stage = null; S.phase = 'title'; S.rigOut = undefined; S.ret = null; S.poseFrom = null;
  S.glasses = [makeGlass('bordeaux', 0, 0)]; S.glasses[0].vol = 128; S.glasses[0].dirty = true; S.cur = 0;
  setWine('red'); B.V = 430e-6; S.rigX = 0; setIdlePose(true);
  camGo(frameTitle(), 1.0);
  $('hud').hidden = true; $('intro').hidden = true; $('result').hidden = true; $('title').hidden = false;
  $('tBest').textContent = SAVE.bestStage ? `ベスト ${SAVE.bestStage} 組` : '';
  if (WEB) WEB.onTitle();
}
if (DEV) window.__ps = { S, B, T, BOT, AU, TYPES, glassType, chains, drops, foam, idlePose, uprightReach, bakeEnv, endPointer, grab, release, setDrag: y => { S.dragY = y; }, loadStage: (no, custom) => { S.official = false; loadStage(no, custom); }, startRun, makeStage, FLOW, auBuild, auPour, WATER, BGM, auBgmLevel, auBgmDecode, auBgmLinear, keepInside, beginPouring,
  judgeWith(vols){ S.official = false; $('intro').hidden = true; S.glasses.forEach((G, i) => { G.vol = vols[i]; G.dirty = true; G.overflow = false; }); B.V = 0; S.cur = S.glasses.length - 1; toPhase('settle'); }, inspectStart, inspectMove, inspectEnd, renderer, cam, scene, CAM, bClip, sceneRT, backRT, THREE,
  gallery, advance(sec, fps = 60){ for (let t = 0; t < sec; t += 1 / fps) tick(1 / fps); lastSig = frameSig(); render(); return S.phase; },
  idle(){ tick(1 / 60); return !(busy() || frameSig() !== lastSig); } };
resize();
toTitle();
try { if (WEB) WEB.attach({ phase: () => S.phase, sfx, auInit, hold: auHold, soundOn: () => AU.on }); } catch (e) { console.error('web', e); }
if (QS.has('gallery')) gallery(QS.get('gallery') === 'weird' ? WEIRD : CLASSIC, parseFloat(QS.get('fill') || '0.32'), QS.get('wine') || 'red');
CAM.t = 1;
requestAnimationFrame(t => { lastT = t; frame(t); });
clearTimeout(window.__psLoadTimer);
{ const le = $('loadErr'); if (le) le.remove(); }
