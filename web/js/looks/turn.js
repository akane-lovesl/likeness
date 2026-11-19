/**
 * A face that turns under a finger, made on the device from one photo. The photo is laid over its own face mesh
 * (MediaPipe's 478 points, each with its depth), the rest of the head and the hair round it as a few more points at
 * the head's depth, and the edge of the frame pinned where it is; then it is drawn with WebGL and turned. The face
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
 */
function smoothDepth(v, passes = 8, pull = .5) {
  const near = /** @type {Set<number>[]} */ (v.map(() => new Set()));
  for (const [a, b, c] of delaunay(v)) { near[a].add(b).add(c); near[b].add(a).add(c); near[c].add(a).add(b); }
  const held = new Set(OVAL);
  for (let k = 0; k < passes; k++) {
    const z = v.map((p, i) => { if (held.has(i) || !near[i].size) return p.z; let s = 0; for (const j of near[i]) s += v[j].z; return p.z + (s / near[i].size - p.z) * pull; });
    v.forEach((p, i) => { p.z = z[i]; });
  }
}

/**
 * The mesh a face turns on: its own points; the hair and the head round it, as two bands pushed out from the face's
 * outline and set behind it (so on the near side they swing out ahead of the cheek, and on the far side go behind
 * it); and the frame's edge, which stays put. Each point carries how far it turns with the head: 1 for the face, less
 * for the neck and the shoulders, 0 for the room. The head turns about its own middle, level with the ears.
 * @param {{ pts: Pt[], w: number, h: number, box: number[] }} f
 */
export function meshOf(f) {
  const [bx, by, bw, bh] = f.box, cx = bx + bw / 2, cy = by + bh / 2;
  /** @type {{ x: number, y: number, z: number, m: number, g: number, under?: number }[]} */
  const v = f.pts.map((p, i) => ({ x: p.x + ((i * 7919) % 13) * 1e-3, y: p.y + ((i * 104729) % 11) * 1e-3, z: p.z || 0, m: 1, g: 0 }));
  smoothDepth(v);
  const ears = (v[234].z + v[454].z) / 2;
  const smooth = (/** @type {number} */ u) => { const t = Math.max(0, Math.min(1, u)); return t * t * (3 - 2 * t); };
  // the bands: out from the outline (further above, for the hair; less below, for the neck), deeper than it, and below
  // the mouth turning less and less with the head
  for (const [out, deep, g] of [[.24, .03, 1], [.66, .08, 2]]) {
    for (const i of OVAL) {
      const p = v[i], dx = p.x - cx, dy = p.y - cy;
      const x = p.x + dx * out, y = p.y + dy * out * (dy < 0 ? 1.35 : .7), under = smooth((p.y - (cy + bh * .12)) / (bh * .38));
      if (x > 1 && x < f.w - 1 && y > 1 && y < f.h - 1) v.push({ x, y, z: p.z + deep * f.w, m: 0, g, under });
    }
  }
  // the edge of the frame stays where it is
  for (let k = 0; k <= 8; k++) for (const [x, y] of [[k / 8 * f.w, 0], [k / 8 * f.w, f.h], [0, k / 8 * f.h], [f.w, k / 8 * f.h]]) v.push({ x, y, z: ears, m: 0, g: 3 });
  const seen = new Set(), pts = v.filter(p => { const k = Math.round(p.x * 4) + ':' + Math.round(p.y * 4); if (seen.has(k)) return false; seen.add(k); return true; });
  const mesh = { v: pts, tris: delaunay(pts), centre: { x: cx, y: cy - bh * .04, z: ears * .9 } };
  weigh(mesh);
  return mesh;
}

/**
 * How far each point turns with the head: the face all the way, the room not at all, and the bands between. With the
 * hair found, a band point on hair turns with the head and one on the room behind stays nearly put, so the hair comes
 * round and the wall behind it does not bend; without it, a guess that suits most portraits. Below the mouth, less
 * and less: the neck and the shoulders do not turn with a glance.
 * @param {{ v: { m: number, g: number, x: number, y: number, under?: number }[] }} mesh
 * @param {(x: number, y: number) => number} [hair] how much hair there is at a point, 0 to 1
 */
export function weigh(mesh, hair) {
  for (const p of mesh.v) {
    if (p.g === 0) { p.m = 1; continue; }
    if (p.g === 3) { p.m = 0; continue; }
    const a = hair ? hair(p.x, p.y) : -1;
    const [top, low] = p.g === 1 ? (a < 0 ? [1, .55] : [.5 + .5 * a, .4 + .35 * a]) : (a < 0 ? [.55, .12] : [.06 + .84 * a, .04 + .36 * a]);
    p.m = top + (low - top) * (p.under || 0);
  }
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
const FS = `precision mediump float; uniform sampler2D u_tex; varying vec2 v_uv;
void main() { gl_FragColor = texture2D(u_tex, v_uv); }`;

/**
 * A turner on one canvas, or null where WebGL is not to be had. It turns one face at a time: the face of the picture
 * on show, which can be changed (a take is its own picture, and its face may sit a little differently).
 * @param {HTMLCanvasElement} canvas @param {{ pts: Pt[], w: number, h: number, box: number[] }} first
 */
export function turner(canvas, first) {
  const gl = /** @type {WebGLRenderingContext | null} */ (canvas.getContext('webgl', { antialias: true, premultipliedAlpha: true, alpha: true }));
  if (!gl) return null;
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
  let f = first, mesh = meshOf(first), count = 0, yaw = 0, pitch = 0, ready = false;
  const weights = () => { gl.bindBuffer(gl.ARRAY_BUFFER, weightBuf); gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(mesh.v, p => p.m), gl.STATIC_DRAW); };
  /** @param {{ pts: Pt[], w: number, h: number, box: number[] }} next */
  const load = (next) => {
    f = next; mesh = meshOf(next);
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
    depth(i) { return mesh.v[i]?.z ?? mesh.centre.z; },
    /** Turns the head: yaw left and right, pitch up and down, in radians. @param {number} y @param {number} [p] */
    turn(y, p = 0) { yaw = y; pitch = p; draw(); },
    get yaw() { return yaw; },
    draw,
    get triangles() { return mesh.tris.length; },
  };
}
