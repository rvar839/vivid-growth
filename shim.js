// Loads the numbers from the Vivid Centre data endpoint and hands them to app.js.
// The access code is checked by the server on every request; this file never decides who gets in.
(() => {
  const API = 'https://nwslmzkmpunwvgfqffqs.supabase.co/functions/v1/growth-data';
  const KEY = 'vivid-growth-code';
  const REFRESH_MS = 5 * 60 * 1000;

  const state = { status: 'loading', raw: {} };
  const calcs = {}, draws = {}, ons = [];
  let memo = {};
  let codeInMemory = null;

  window.dash = {
    colors: ['var(--s0)', 'var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'],
    data(id) {
      if (calcs[id]) {
        if (!(id in memo)) {
          const ins = calcs[id].inputs.map((i) => dash.data(i));
          const bad = ins.find((s) => s.status !== 'ok');
          if (bad) memo[id] = { status: bad.status, data: [] };
          else {
            try { memo[id] = { status: 'ok', data: calcs[id].fn(...ins.map((s) => s.data)) }; }
            catch (e) { console.error(id, e); memo[id] = { status: 'error', data: [] }; }
          }
        }
        return memo[id];
      }
      if (state.status !== 'ok') return { status: state.status, data: [] };
      return Array.isArray(state.raw[id]) ? { status: 'ok', data: state.raw[id] } : { status: 'missing', data: [] };
    },
    calc(id, o) { calcs[id] = o; },
    onData(fn) { ons.push(fn); },
    draw(name, fn) { if (fn) draws[name] = fn; else runDraw(name); },
    setLink(id) { try { history.replaceState(null, '', '#' + encodeURIComponent(id)); } catch (e) { /* ignore */ } },
    params() { return {}; },
  };

  function runDraw(name) {
    if (!draws[name]) return;
    document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => {
      if (el.closest('[hidden]')) return;
      try { draws[name](el); } catch (e) { console.error(name, e); el.textContent = '—'; }
    });
  }
  function render() {
    memo = {};
    ons.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    Object.keys(draws).forEach(runDraw);
    notes();
  }

  const $ = (id) => document.getElementById(id);
  const show = (id, on) => { const el = $(id); if (el) el.hidden = !on; };
  function notes() {
    const ok = state.status === 'ok';
    const months = ok && Array.isArray(state.raw.monthly) ? state.raw.monthly.length : 0;
    show('note-error', state.status === 'error');
    show('note-empty', ok && months === 0);
    show('note-early', ok && months > 0 && months < 3);
    show('note-baseline', ok && months > 0 && !state.raw.member_baseline_set);
    const u = $('updated');
    if (u && ok) u.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function savedCode() { try { return sessionStorage.getItem(KEY) || codeInMemory; } catch (e) { return codeInMemory; } }
  function keepCode(code) { codeInMemory = code; try { sessionStorage.setItem(KEY, code); } catch (e) { /* stays in memory */ } }
  function forgetCode() { codeInMemory = null; try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  function showLogin(message) {
    show('app', false); show('login', true);
    const err = $('login-error');
    err.textContent = message || '';
    err.hidden = !message;
    $('login-button').disabled = false;
    $('login-code').value = '';
    $('login-code').focus();
  }
  function showApp() { show('login', false); show('app', true); }

  async function load(code, fromLogin) {
    let res;
    try {
      res = await fetch(API, { method: 'POST', headers: { 'x-access-code': code } });
    } catch (e) {
      if (fromLogin) showLogin('Could not reach the server. Check your connection and try again.');
      else { state.status = 'error'; render(); }
      return;
    }
    if (res.status === 401 || res.status === 429 || res.status === 503) {
      const body = await res.json().catch(() => ({}));
      forgetCode();
      showLogin(body.error || 'That code is not right.');
      return;
    }
    if (!res.ok) {
      if (fromLogin) showLogin('Something went wrong loading the numbers. Try again in a minute.');
      else { state.status = 'error'; render(); }
      return;
    }
    state.raw = await res.json();
    window.VG_GOALS = state.raw.goals || {};
    window.VG_TODAY = state.raw.today || null;
    window.VG_SINCE = state.raw.tracking_since || null;
    state.status = 'ok';
    keepCode(code);
    showApp();
    render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = $('login-code').value.trim();
      if (!code) return;
      $('login-button').disabled = true;
      load(code, true);
    });
    $('signout').addEventListener('click', () => { forgetCode(); state.status = 'loading'; state.raw = {}; showLogin(''); });
    $('refresh').addEventListener('click', () => { const c = savedCode(); if (c) load(c, false); });

    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (!$('app').hidden) render(); }, 150); });
    setInterval(() => { const c = savedCode(); if (c && !document.hidden && !$('app').hidden) load(c, false); }, REFRESH_MS);

    const code = savedCode();
    if (code) load(code, true); else showLogin('');
  });
})();
