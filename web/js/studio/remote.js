/**
 * A live studio over HTTP: pictures go up once (POST /api/assets), a turn is posted (POST /api/turns) and followed
 * event by event over server-sent events, with polling where a proxy swallows the stream. The same app talks to
 * the simulator and to the workstation; only the studio's answers differ.
 */
const json = async res => {
  if (res.ok) return res.json();
  const body = await res.json().catch(() => null);
  // the studio's own sentence where it gave one; a request it could not read (a list of field errors) said plainly
  const said = typeof body?.detail === 'string' ? body.detail : body?.detail ? 'The studio could not read that request.' : '';
  throw Object.assign(new Error(said || `The studio answered ${res.status}`), { status: res.status, hint: typeof body?.hint === 'string' ? body.hint : '' });
};
const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(json);
const sent = new Map();

async function postTurn(body, retry) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch('api/turns', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), ...(retry ? { signal: AbortSignal.timeout(15000) } : {}),
      });
      return await json(response);
    } catch (error) {
      if (!retry || attempt >= 2 || (error.status && ![502, 503, 504].includes(error.status))) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

/** Uploads a picture once per session; the studio keeps it under private/. */
export async function upload(key, blob, kind = 'image') {
  if (key && sent.has(key)) return sent.get(key);
  const form = new FormData(); form.append('file', blob, kind + '.png'); form.append('kind', kind);
  const asset = await fetch('api/assets', { method: 'POST', body: form }).then(json);
  if (key) sent.set(key, asset);
  return asset;
}

async function* follow(job, pollOnly) {
  const queue = [], wake = { now: () => {} }, push = ev => { queue.push(ev); wake.now(); };
  let source = null, polling = false, seen = 0, finished = false;
  const poll = async () => {
    polling = true;
    while (!finished) {
      const res = await fetch(`api/jobs/${job}`).catch(() => null);
      if (res?.status === 404) { push({ type: 'failed', message: 'The studio was restarted and this turn went with it.', hint: 'Try again.' }); return; }
      if (res?.status === 401 || res?.status === 403) { push({ type: 'failed', message: 'Reopen the studio with your access link.' }); return; }
      const state = res?.ok ? await res.json().catch(() => null) : null;
      if (state) { state.events.slice(seen).forEach(push); seen = state.events.length; }
      await new Promise(r => setTimeout(r, 700));
    }
  };
  if (pollOnly) poll();
  else try {
    source = new EventSource(`api/jobs/${job}/events`);
    for (const type of ['accepted', 'stage', 'plan', 'note', 'progress', 'partial', 'result', 'reply', 'done', 'failed']) source.addEventListener(type, e => { seen++; push({ type, ...JSON.parse(/** @type {MessageEvent} */ (e).data) }); });
    source.onerror = () => { source.close(); if (!finished && !polling) poll(); };
  } catch { poll(); }
  try {
    while (true) {
      while (queue.length) { const ev = queue.shift(); yield ev; if (ev.type === 'done' || ev.type === 'failed') return; }
      await new Promise(r => { wake.now = () => r(undefined); });
    }
  } finally { finished = true; source?.close(); }
}

/** A job's events as the app wants them: pictures fetched, failures thrown. */
async function* events(job, pollOnly) {
  for await (const ev of follow(job, pollOnly)) {
    if (ev.type === 'partial') yield { type: 'partial', index: ev.index, blob: await fetchBlob(ev.url) };
    else if (ev.type === 'result') yield { type: 'result', index: ev.index, blob: await fetchBlob(ev.url), url: ev.url, w: ev.w, h: ev.h, provenance: ev.provenance, prompt: ev.prompt };
    else if (ev.type === 'failed') throw Object.assign(new Error(ev.message || 'The studio could not finish this.'), { hint: ev.hint, cancelled: ev.cancelled });
    else if (ev.type !== 'accepted') yield ev;
  }
}

const fetchBlob = url => fetch(url).then(r => { if (!r.ok) throw new Error('A picture went missing on the way back.'); return r.blob(); });

export function remote(pollOnly = false) {
  const jobs = new Map(), stopped = new Set();
  return {
    kind: 'studio',
    /** @param {any} spec @param {Record<string, any>} inputs */
    async *turn(spec, inputs) {
      let posted = null;
      for (let attempt = 0; !posted; attempt++) {
        try { posted = await send(spec, inputs, pollOnly); } catch (e) {
          if (e.status === 409 && attempt === 0) { sent.clear(); continue; }   // the studio was restarted elsewhere: send the pictures again
          throw e;
        }
      }
      const { job, eta } = posted;
      jobs.set(spec.id, job);
      if (stopped.has(spec.id)) stopJob(job);   // Stop was pressed while the pictures were still on their way
      yield { type: 'accepted', eta, job };
      yield* events(job, pollOnly);
    },
    /** A turn already under way (the page was reloaded): its events again from the first. */
    async *resume(job) {
      jobs.set(job, job);
      yield* events(job, pollOnly);
    },
    cancel(id, job = null) { const known = jobs.get(id) || job; if (known) stopJob(known); else stopped.add(id); },
    /** A room from words (and optionally a palette), invented by the studio's model. */
    room: (text, palette = null) => post('api/rooms', { text, palette }),
    /** A look from words or a picture. */
    look: async (text, blob = null) => post('api/looks', { text, asset: blob ? (await upload(null, blob)).id : null }),
    /** Backdrop ideas for a picture. */
    backdrops: async (opts, blob = null) => post('api/backdrops', { ...opts, asset: blob ? (await upload(null, blob)).id : null }),
  };
}

const stopJob = job => fetch(`api/jobs/${job}/cancel`, { method: 'POST' }).catch(() => {});

/** Sends a turn's pictures (each once) and the turn itself. */
async function send(spec, inputs, retry = false) {
  const handles = {};
  for (const [id, inp] of Object.entries(inputs)) handles[inp.handle] = (await upload(id, inp.blob)).id;
  const asset = id => (id && inputs[id] ? handles[inputs[id].handle] : null);
  const pins = [];
  for (const p of spec.intent.pins || []) pins.push({ n: p.n, note: p.note || '', print: asset(p.print), mask: p.maskBlob ? (await upload(null, p.maskBlob, 'mask')).id : null });
  const subjectMask = spec.subjectMaskBlob ? (await upload(null, spec.subjectMaskBlob, 'mask')).id : null;
  const it = spec.intent;
  const body = {
    id: spec.id, text: spec.text, pace: spec.pace, n: spec.n, handles,
    intent: { op: it.op, subject: asset(it.subject), refs: it.refs.map(r => ({ asset: asset(r.id), role: r.role })).filter(r => r.asset) },
    look: it.look ? { id: it.look.id, name: it.look.name, prompt: it.look.prompt } : null,
    backdrop: spec.backdrop ? { name: spec.backdrop.name, words: spec.backdrop.words } : null, subject_mask: subjectMask, pins,
    room: { id: spec.room.id, name: spec.room.name, line: spec.room.line, colors: spec.room.colors, voice: spec.room.voice?.done || [] }, mood: spec.mood || null,
    taste: spec.taste || '', aspect: spec.aspect || null,
  };
  return postTurn(body, retry);
}
