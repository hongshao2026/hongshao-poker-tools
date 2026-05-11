import init, { equity_mc, analyze } from './pkg/equity_wasm.js';

let ready = false;
let initPromise = null;

function ensureReady() {
  if (!initPromise) {
    initPromise = init().then(() => { ready = true; });
  }
  return initPromise;
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      await ensureReady();
      self.postMessage({ type: 'ready' });
      return;
    }
    if (m.type === 'run') {
      await ensureReady();
      const result = equity_mc(m.r1, m.r2, m.board || '', m.sims);
      self.postMessage({ type: 'done', result });
      return;
    }
    if (m.type === 'analyze') {
      await ensureReady();
      const result = analyze(m.range, m.board);
      self.postMessage({ type: 'analysis', result });
      return;
    }
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err && err.message || err) });
  }
};
