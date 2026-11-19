/**
 * A face that turns under a finger, made on the device from one photo. The photo is laid over a fine grid whose depth
 * is the face's own (MediaPipe's 478 points, each with its depth) inside its outline and a rounded head fitted to it
 * round that, the edge of the frame pinned where it is; then it is drawn with WebGL and turned. The face
 * turns, the hair comes round with it, the room behind stays put. A little either way only: it is a preview drawn
 * here, not a photograph from another angle, and the mirror says so while it is turned.
 */

import { OVAL } from '../studio/face.js';

/** @typedef {{ x: number, y: number, z?: number }} Pt */

/** Delaunay triangles over points in the plane (Bowyer–Watson), as index triples. @param {Pt[]} pts */
export function delaunay(pts) {
  const n = pts.length;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const d = Math.max(x1 - x0, y1 - y0) || 1, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const all = [...pts, { x: mx - 20 * d, y: my - d }, { x: mx, y: my + 20 * d }, { x: mx + 20 * d, y: my - d }];
  /** @param {number} a @param {number} b @param {number} c */
  const tri = (a, b, c) => {
    const A = all[a], B = all[b], C = all[c], D = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y)) || 1e-9;
    const ux = ((A.x ** 2 + A.y ** 2) * (B.y - C.y) + (B.x ** 2 + B.y ** 2) * (C.y - A.y) + (C.x ** 2 + C.y ** 2) * (A.y - B.y)) / D;
    const uy = ((A.x ** 2 + A.y ** 2) * (C.x - B.x) + (B.x ** 2 + B.y ** 2) * (A.x - C.x) + (C.x ** 2 + C.y ** 2) * (B.x - A.x)) / D;
    return { a, b, c, x: ux, y: uy, r: (A.x - ux) ** 2 + (A.y - uy) ** 2 };
  };
  let tris = [tri(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const p = all[i], keep = [], edges = new Map();
    for (const t of tris) {
      if ((p.x - t.x) ** 2 + (p.y - t.y) ** 2 < t.r) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) { const k = u < v ? u * 4096 + v : v * 4096 + u; edges.set(k, edges.has(k) ? null : [u, v]); }
      else keep.push(t);
    }
    tris = keep;
    for (const e of edges.values()) if (e) tris.push(tri(e[0], e[1], i));
  }
  return tris.filter(t => t.a < n && t.b < n && t.c < n).map(t => [t.a, t.b, t.c]);
}

/**
 * The face's depth, smoothed over its own mesh with its outline held: the landmarker's depth is good at the scale of a
 * nose and a cheek but uneven from one point to the next near the edge of the face, and turned, that unevenness shows
 * as a saw-tooth where the cheek meets the hair. A few passes of each point towards its neighbours take it out.
 * @param {{ x: number, y: number, z: number }[]} v the face's points (their depth is changed in place)
 * @returns {number[][]} the face's own triangles, for laying its depth on the grid
 */
function smoothDepth(v, passes = 8, pull = .5) {
  const tris = delaunay(v), near = /** @type {Set<number>[]} */ (v.map(() => new Set()));
  for (const [a, b, c] of tris) { near[a].add(b).add(c); near[b].add(a).add(c); near[c].add(a).add(b); }
  const held = new Set(OVAL);
  for (let k = 0; k < passes; k++) {
    const z = v.map((p, i) => { if (held.has(i) || !near[i].size) return p.z; let s = 0; for (const j of near[i]) s += v[j].z; return p.z + (s / near[i].size - p.z) * pull; });
    v.forEach((p, i) => { p.z = z[i]; });
  }
  return tris;
}

const smooth = (/** @type {number} */ u) => { const t = Math.max(0, Math.min(1, u)); return t * t * (3 - 2 * t); };

/**
 * A grid's values blurred a little, the edge held (a few passes of 1 4 6 4 1 each way).
 * @param {Float32Array} a @param {number} cols @param {number} rows @param {number} passes
 */
function blur(a, cols, rows, passes) {
  let src = Float32Array.from(a), tmp = new Float32Array(a.length);
  const K = [1, 4, 6, 4, 1];
  for (let k = 0; k < passes; k++) {
    for (const [step, len, lines, stride] of [[1, cols, rows, cols], [cols, rows, cols, 1]]) {
      for (let l = 0; l < lines; l++) for (let i = 0; i < len; i++) {
        let s = 0;
        for (let t = -2; t <= 2; t++) { const j = Math.max(0, Math.min(len - 1, i + t)); s += K[t + 2] * src[l * stride + j * step]; }
        tmp[l * stride + i * step] = s / 16;
      }
      [src, tmp] = [tmp, src];
    }
  }
  return src;
}

/**
 * @typedef {{ cols: number, rows: number, n: number, X: Float32Array, Y: Float32Array, Z: Float32Array, face: Float32Array, tight: Float32Array, loose: Float32Array, neck: Float32Array, low: Float32Array, edge: Float32Array }} Grid
 * @typedef {{ v: { x: number, y: number, z: number, m: number }[], tris: number[][], centre: { x: number, y: number, z: number }, grid: Grid, zAt: (x: number, y: number) => number }} Mesh
 */

/**
 * The mesh a face turns on: a fine grid over the whole picture, each point of it carrying a depth and how far it turns
 * with the head, both smooth, so that a curve in the picture (a jaw, a beard's edge, a strand of hair) is still a curve
 * when it is turned. Inside the face's outline the depth is the face's own (smoothed, and level across the eyes and the
 * bridge of the nose, so glasses turn as one piece); round it, a head fitted to the face: rounded, falling away
 * steeply at the sides, so on the far side the ear folds away behind the cheek and on the near side it comes round.
 * The head turns about its own middle, level with the ears; the neck and the shoulders less; the room not at all; and
 * the frame's edge is pinned.
 * @param {{ pts: Pt[], w: number, h: number, box: number[] }} f
 * @param {number} [C] columns across the picture: fewer where WebGL is drawn without a graphics chip
 * @returns {Mesh}
 */
export function meshOf(f, C = 64) {
  const W = f.w, H = f.h;
  const v0 = f.pts.map((p, i) => ({ x: p.x + ((i * 7919) % 13) * 1e-3, y: p.y + ((i * 104729) % 11) * 1e-3, z: p.z || 0 }));
  const faceTris = smoothDepth(v0);
  // the head, from the face: its middle level with the ears, a little wider than the face is there, up to the crown
  const L = v0[234], R = v0[454], top = v0[10], chin = v0[152];
  const hx = (L.x + R.x) / 2, hy = (L.y + R.y) / 2, a = Math.max(8, Math.abs(R.x - L.x) / 2 * 1.06);
  const faceH = Math.max(8, chin.y - top.y), up = Math.max(8, (hy - top.y) * 1.6), down = Math.max(8, (chin.y - hy) * 1.02);
  /** how far out on the head a point is (1 at its outline), and how much of that is sideways */
  const at = (/** @type {number} */ x, /** @type {number} */ y) => { const u = (x - hx) / a, w = (y - hy) / (y < hy ? up : down), r = Math.hypot(u, w); return { r, side: r ? u * u / (r * r) : 0 }; };
  // its surface towards the camera: level in the middle, falling away fast at the outline, and past it at the sides
  // (the ears, the hair over them) going on round behind; over the crown and under the chin, level with the ears
  const shape = (/** @type {number} */ r, /** @type {number} */ side) => (r <= 1 ? Math.cos(Math.PI / 2 * r ** 4) : -side * Math.sin(Math.PI / 2 * Math.min(1, r ** 4 - 1)));
  let n = 0, sx = 0, sz = 0, sxx = 0, sxz = 0;
  for (const p of v0) { const { r, side } = at(p.x, p.y), s = shape(r, side); n++; sx += s; sz += p.z; sxx += s * s; sxz += s * p.z; }
  const deep = Math.max(.45 * a, Math.min(1.1 * a, -(n * sxz - sx * sz) / Math.max(1e-6, n * sxx - sx * sx))), mid = (sz + deep * sx) / n;
  const head = (/** @type {number} */ x, /** @type {number} */ y) => { const { r, side } = at(x, y); return mid - deep * shape(r, side); };
  // across the eyes and the bridge of the nose, nearly level with the head's own curve: glasses sit there, and turn whole
  const ex = (v0[33].x + v0[263].x) / 2, ey = (v0[33].y + v0[133].y + v0[362].y + v0[263].y) / 4;
  const eX = Math.max(4, Math.abs(v0[263].x - v0[33].x) / 2 * 1.3), eY = Math.max(4, Math.abs(v0[105].y - ey), Math.abs(v0[334].y - ey)) * 1.25;
  const eyes = (/** @type {number} */ x, /** @type {number} */ y) => 1 - smooth((Math.hypot((x - ex) / eX, (y - ey) / eY) - .7) / .35);
  let k = 0, off = 0;
  for (const p of v0) if (eyes(p.x, p.y) > .5) { off += p.z - head(p.x, p.y); k++; }
  off = k ? off / k : 0;
  for (const p of v0) p.z += (head(p.x, p.y) + off - p.z) * eyes(p.x, p.y) * .85;
  // the face's outline, for how far inside it a point is
  const ring = OVAL.map(i => v0[i]);
  const inside = (/** @type {number} */ x, /** @type {number} */ y) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const A = ring[i], B = ring[j]; if ((A.y > y) !== (B.y > y) && x < (B.x - A.x) * (y - A.y) / (B.y - A.y) + A.x) c = !c; } return c; };
  const edgeOf = (/** @type {number} */ x, /** @type {number} */ y) => { let d = Infinity; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const A = ring[j], B = ring[i], dx = B.x - A.x, dy = B.y - A.y, t = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / (dx * dx + dy * dy || 1))); d = Math.min(d, Math.hypot(x - A.x - t * dx, y - A.y - t * dy)); } return d; };
  // the grid
  const Rw = Math.max(8, Math.round(C * H / W)), cols = C + 1, rows = Rw + 1, N = cols * rows;
  const X = new Float32Array(N), Y = new Float32Array(N), Z = new Float32Array(N), Zf = new Float32Array(N).fill(NaN);
  const face = new Float32Array(N), core = new Float32Array(N), tight = new Float32Array(N), loose = new Float32Array(N), neck = new Float32Array(N), low = new Float32Array(N), edge = new Float32Array(N);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { X[j * cols + i] = i / C * W; Y[j * cols + i] = j / Rw * H; }
  // the face's own depth, laid on the grid from its triangles
  for (const [A, B, Cc] of faceTris) {
    const pa = v0[A], pb = v0[B], pc = v0[Cc], det = (pb.y - pc.y) * (pa.x - pc.x) + (pc.x - pb.x) * (pa.y - pc.y);
    if (Math.abs(det) < 1e-9) continue;
    const i0 = Math.max(0, Math.ceil(Math.min(pa.x, pb.x, pc.x) / W * C)), i1 = Math.min(C, Math.floor(Math.max(pa.x, pb.x, pc.x) / W * C));
    const j0 = Math.max(0, Math.ceil(Math.min(pa.y, pb.y, pc.y) / H * Rw)), j1 = Math.min(Rw, Math.floor(Math.max(pa.y, pb.y, pc.y) / H * Rw));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const q = j * cols + i, x = X[q], y = Y[q];
      const l1 = ((pb.y - pc.y) * (x - pc.x) + (pc.x - pb.x) * (y - pc.y)) / det, l2 = ((pc.y - pa.y) * (x - pc.x) + (pa.x - pc.x) * (y - pc.y)) / det, l3 = 1 - l1 - l2;
      if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) Zf[q] = l1 * pa.z + l2 * pb.z + l3 * pc.z;
    }
  }
  for (let q = 0; q < N; q++) {
    const x = X[q], y = Y[q], sd = (inside(x, y) ? 1 : -1) * edgeOf(x, y), hz = head(x, y), { r } = at(x, y);
    face[q] = smooth((sd + .03 * a) / (.13 * a));
    core[q] = smooth((sd - .1 * a) / (.2 * a));
    Z[q] = Number.isNaN(Zf[q]) ? hz : hz + (Zf[q] - hz) * face[q];
    // how far it turns: the head itself (out to its outline, or a little past it for hair not yet found), not below the
    // chin; the neck under it, half as much and less further down; hair that hangs below the chin, less than the head
    const under = smooth((y - chin.y + .02 * faceH) / (.25 * faceH));
    tight[q] = (1 - smooth((r - .98) / .12)) * (1 - under);
    loose[q] = (1 - smooth((r - 1) / .3)) * (1 - under);
    neck[q] = smooth((y - chin.y + .12 * faceH) / (.17 * faceH)) * (1 - smooth((Math.abs(x - hx) - .5 * a) / (.8 * a))) * (.5 - .38 * smooth((y - chin.y) / (.8 * faceH)));
    low[q] = smooth((y - chin.y + .1 * faceH) / (.6 * faceH));
    edge[q] = smooth(Math.min(x, W - x, y, H - y) / (.04 * Math.min(W, H)));
  }
  // smoothed everywhere but the middle of the face, which keeps its own
  const Zb = blur(Z, cols, rows, 3);
  for (let q = 0; q < N; q++) Z[q] = Zb[q] + (Z[q] - Zb[q]) * core[q];
  const tris = [];
  for (let j = 0; j < Rw; j++) for (let i = 0; i < C; i++) {
    const q = j * cols + i;
    if ((i + j) % 2) tris.push([q, q + 1, q + cols + 1], [q, q + cols + 1, q + cols]); else tris.push([q, q + 1, q + cols], [q + 1, q + cols + 1, q + cols]);
  }
  const grid = { cols, rows, n: N, X, Y, Z, face, tight, loose, neck, low, edge };
  /** the mesh's depth at any point of the picture */
  const zAt = (/** @type {number} */ x, /** @type {number} */ y) => {
    const gx = Math.max(0, Math.min(C - 1e-6, x / W * C)), gy = Math.max(0, Math.min(Rw - 1e-6, y / H * Rw)), i = Math.floor(gx), j = Math.floor(gy), u = gx - i, w = gy - j, q = j * cols + i;
    return (Z[q] * (1 - u) + Z[q + 1] * u) * (1 - w) + (Z[q + cols] * (1 - u) + Z[q + cols + 1] * u) * w;
  };
  const mesh = { v: Array.from({ length: N }, (_, q) => ({ x: X[q], y: Y[q], z: Z[q], m: 0 })), tris, centre: { x: hx, y: hy, z: mid }, grid, zAt };
  weigh(mesh);
  return mesh;
}

/**
 * How far each point turns with the head: the face all the way, the room not at all, and between them the head round
 * the face, the hair and the neck. With the hair found, hair turns with the head (less where it hangs below the chin)
 * and the wall beside it stays put, so the hair comes round and the wall behind it does not bend; without it, the head
 * and a little round it. Smoothed, so nothing between them creases; the frame's edge stays where it is.
 * @param {Mesh} mesh
 * @param {(x: number, y: number) => number} [hair] how much hair there is at a point, 0 to 1
 */
export function weigh(mesh, hair) {
  const g = mesh.grid, m = new Float32Array(g.n);
  for (let q = 0; q < g.n; q++) {
    const h = hair ? hair(g.X[q], g.Y[q]) : -1;
    m[q] = Math.max(g.face[q], h < 0 ? g.loose[q] : Math.max(g.tight[q], h * (1 - .6 * g.low[q])), g.neck[q]);
  }
  const mb = blur(m, g.cols, g.rows, 2);
  for (let q = 0; q < g.n; q++) mesh.v[q].m = Math.max(g.face[q] > .999 ? 1 : 0, mb[q]) * g.edge[q];
}

const VS = `attribute vec3 a_pos; attribute float a_m;
uniform vec2 u_size; uniform vec3 u_c; uniform vec2 u_turn;
varying vec2 v_uv;
void main() {
  vec3 p = a_pos - u_c;
  float cy = cos(u_turn.x), sy = sin(u_turn.x), cx = cos(u_turn.y), sx = sin(u_turn.y);
  vec3 r = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  r = vec3(r.x, r.y * cx - r.z * sx, r.y * sx + r.z * cx);
  vec3 q = mix(p, r, a_m);
  float d = u_size.x * 3.5, k = (1.0 + p.z / d) / (1.0 + q.z / d);
  vec2 xy = u_c.xy + q.xy * k;
  v_uv = a_pos.xy / u_size;
  gl_Position = vec4(xy.x / u_size.x * 2.0 - 1.0, 1.0 - xy.y / u_size.y * 2.0, clamp(q.z / u_size.x, -1.0, 1.0) * 0.98, 1.0);
}`;
/** Whether WebGL here is drawn in software: found out once, on a canvas of its own. @type {boolean | null} */
let soft = null;
function drawnInSoftware() {
  if (soft !== null) return soft;
  try {
    const gl = document.createElement('canvas').getContext('webgl'), info = gl?.getExtension('WEBGL_debug_renderer_info');
    soft = !!gl && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ''));
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { soft = false; }
  return soft;
}
const FS = `precision mediump float; uniform sampler2D u_tex; varying vec2 v_uv;
void main() { gl_FragColor = texture2D(u_tex, v_uv); }`;

/**
 * A turner on one canvas, or null where WebGL is not to be had. It turns one face at a time: the face of the picture
 * on show, which can be changed (a take is its own picture, and its face may sit a little differently).
 * @param {HTMLCanvasElement} canvas @param {{ pts: Pt[], w: number, h: number, box: number[] }} first
 */
export function turner(canvas, first) {
  // drawn in software (no graphics chip), smoothed edges and a finer mesh cost whole frames; at rest no one can tell
  const lite = drawnInSoftware();
  const gl = /** @type {WebGLRenderingContext | null} */ (canvas.getContext('webgl', { antialias: !lite, premultipliedAlpha: true, alpha: true }));
  if (!gl) return null;
  const C = lite ? 44 : 64;
  const shader = (/** @type {number} */ type, /** @type {string} */ src) => { const s = /** @type {WebGLShader} */ (gl.createShader(type)); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = /** @type {WebGLProgram} */ (gl.createProgram());
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const attrib = (/** @type {string} */ name, /** @type {number} */ size) => {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    const at = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, size, gl.FLOAT, false, 0, 0);
    return b;
  };
  const posBuf = attrib('a_pos', 3), weightBuf = attrib('a_m', 1), indexBuf = gl.createBuffer();
  const sizeAt = gl.getUniformLocation(prog, 'u_size'), centreAt = gl.getUniformLocation(prog, 'u_c'), turnAt = gl.getUniformLocation(prog, 'u_turn');
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  let f = first, mesh = meshOf(first, C), count = 0, yaw = 0, pitch = 0, ready = false;
  const weights = () => { gl.bindBuffer(gl.ARRAY_BUFFER, weightBuf); gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(mesh.v, p => p.m), gl.STATIC_DRAW); };
  /** @param {{ pts: Pt[], w: number, h: number, box: number[] }} next */
  const load = (next) => {
    f = next; mesh = meshOf(next, C);
    const pos = new Float32Array(mesh.v.length * 3); mesh.v.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); });
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW); weights();
    const index = new Uint16Array(mesh.tris.flat()); count = index.length;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
    gl.uniform2f(sizeAt, f.w, f.h); gl.uniform3f(centreAt, mesh.centre.x, mesh.centre.y, mesh.centre.z);
  };
  load(first);
  const draw = () => {
    if (!ready) return;
    gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform2f(turnAt, yaw, pitch); gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
  };
  return {
    /** The face being turned. */
    get face() { return f; },
    /** Turns another face from now on (its picture comes with picture()). @param {{ pts: Pt[], w: number, h: number, box: number[] }} next */
    load(next) { if (next !== f) load(next); },
    /**
     * What is laid over the face: the picture on show, with any sketch on it, resampled to a power of two each way so
     * it can be mipmapped and stays as crisp, turned, as it is at rest.
     * @param {HTMLCanvasElement | HTMLImageElement} source
     */
    picture(source) {
      const sw = 'naturalWidth' in source ? source.naturalWidth : source.width, sh = 'naturalHeight' in source ? source.naturalHeight : source.height;
      const pot = (/** @type {number} */ n) => 2 ** Math.max(8, Math.min(11, Math.round(Math.log2(Math.max(1, n)))));
      const c = document.createElement('canvas'); c.width = pot(sw); c.height = pot(sh);
      const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')); x.imageSmoothingQuality = 'high'; x.drawImage(source, 0, 0, c.width, c.height);
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      ready = true; draw();
    },
    /**
     * The hair, found in the picture of the face being turned: the bands round it re-weighed (see weigh).
     * @param {HTMLCanvasElement} mask white where there is hair, at any size @param {object} of the face it was found for
     */
    hair(mask, of) {
      if (of !== f) return;
      const mw = mask.width, mh = mask.height, a = /** @type {CanvasRenderingContext2D} */ (mask.getContext('2d')).getImageData(0, 0, mw, mh).data;
      const at = (/** @type {number} */ x, /** @type {number} */ y) => { const i = Math.round(Math.max(0, Math.min(mh - 1, y / f.h * mh))) * mw + Math.round(Math.max(0, Math.min(mw - 1, x / f.w * mw))); return a[i * 4 + 3] / 255; };
      weigh(mesh, (x, y) => (at(x, y) + at(x - f.w * .015, y) + at(x + f.w * .015, y) + at(x, y - f.h * .012) + at(x, y + f.h * .012)) / 5);
      weights(); draw();
    },
    /**
     * Where a point of the picture is, turned (the shader's own sums, for things drawn over the face to follow it).
     * @param {number} x @param {number} y @param {number} [z] its depth; the head's middle where it is not known
     */
    project(x, y, z = mesh.centre.z) {
      const c = mesh.centre, d = f.w * 3.5, p = { x: x - c.x, y: y - c.y, z: z - c.z };
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
      const rx = p.x * cy + p.z * sy, rz0 = -p.x * sy + p.z * cy, ry = p.y * cx - rz0 * sx, rz = p.y * sx + rz0 * cx;
      const k = (1 + p.z / d) / (1 + rz / d);
      return { x: c.x + rx * k, y: c.y + ry * k };
    },
    /** The face's depth at one of its points, as the mesh has it. @param {number} i */
    depth(i) { const p = f.pts[i]; return p ? mesh.zAt(p.x, p.y) : mesh.centre.z; },
    /** Turns the head: yaw left and right, pitch up and down, in radians. @param {number} y @param {number} [p] */
    turn(y, p = 0) { yaw = y; pitch = p; draw(); },
    get yaw() { return yaw; },
    draw,
    get triangles() { return mesh.tris.length; },
  };
}
