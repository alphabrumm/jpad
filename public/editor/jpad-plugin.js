/* JPad-Erweiterung für den Lernpfad-Editor PathFinder.
 * Baustein „Programmier-Aufgabe“: JPad meldet nach jedem Programmlauf die Ausgabe; stimmt sie (und kommt im Code
 * vor, was verlangt ist), ist die Aufgabe gelöst. Code-Bausteine bekommen in JPad „In JPad übernehmen“.
 * Läuft PathFinder in JPad (Editor im Lernpfad-Bereich oder exportierter Lernpfad im Projekt), spricht
 * createBridgeHost() per postMessage mit JPad – siehe JPAD.md, „Lernpfad-Schnittstelle“. */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Prüfen ---------- */
const normOut = s => String(s ?? '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').trim();
const squash = s => normOut(s).replace(/\s+/g, ' ');
/** Ausgabe und Code gegen die Aufgabe prüfen → { ok, msg } */
export function checkRun(b, run) {
  if (!run) return { ok: false, msg: 'Starte dein Programm zuerst in JPad (▶).' };
  if (run.error) return { ok: false, msg: 'Dein Programm ist mit einem Fehler abgebrochen – schau in die Ausgabe.' };
  const code = (run.files || []).map(f => f.text).join('\n');
  for (const need of (b.needs || []).filter(Boolean)) if (!code.includes(need)) return { ok: false, msg: `In deinem Code fehlt noch: ${need}` };
  const want = b.expect || '';
  if (want) {
    const out = run.output || '';
    const ok = b.compare === 'gleich' ? normOut(out) === normOut(want) : squash(out).includes(squash(want));
    if (!ok) return { ok: false, msg: b.compare === 'gleich' ? 'Die Ausgabe stimmt noch nicht genau.' : 'In der Ausgabe fehlt noch, was verlangt ist.' };
  }
  return { ok: true, msg: '' };
}

/* ---------- Brücke zu JPad ---------- */
export function makeBridge(target = window.parent) {
  const W = {}, L = [];
  addEventListener('message', e => {
    if (e.source !== target) return; const m = e.data; if (!m || typeof m !== 'object') return;
    if (m.req && W[m.req]) { const f = W[m.req]; delete W[m.req]; f(m); return; }
    if (m.type === 'jpad-executed') L.forEach(f => { try { f(m); } catch (x) { } });
  });
  const ask = (action, data = {}) => new Promise((ok, no) => {
    const req = 'r' + String(Math.random()).slice(2); const t = setTimeout(() => { delete W[req]; no(new Error('JPad antwortet nicht')); }, 5000);
    W[req] = m => { clearTimeout(t); ok(m); }; target.postMessage({ type: 'jpad', action, req, ...data }, '*');
  });
  return { send: (action, data = {}) => target.postMessage({ type: 'jpad', action, ...data }, '*'), post: m => target.postMessage(m, '*'), ask, onExecuted: f => L.push(f) };
}
export function createBridgeHost(bridge, { editor = false } = {}) {
  bridge = bridge || makeBridge();
  let api = null, last = null;
  bridge.onExecuted(run => {
    last = run; if (!api) return;
    const open = api.doc.stations.flatMap(s => s.blocks).filter(b => b.type === 'jtask' && (b.expect || (b.needs || []).length) && !api.prog.solved[b.id]);
    for (const b of open) if (checkRun(b, run).ok) {
      if (api.mode === 'preview') api.solve(b.id); else api.toast(`✓ JPad: Programm passt zu „${esc(b.title)}“ (in der Vorschau zählt es)`);
      return;
    }
  });
  const host = {
    name: 'JPad', copyLabel: 'In JPad übernehmen',
    attach(a) { api = a; },
    reset() { },
    copyCode(b) { bridge.send('code', { code: b.code || '' }); },
    code(code) { bridge.send('code', { code }); },
    script: () => bridge.ask('script'),
    lastRun: () => last,
  };
  if (editor) host.adopt = async (html, title) => bridge.post({ type: 'jpad-set-lernpfad', html, title });
  return host;
}

/* ---------- Bausteine ---------- */
export const jpadPlugin = {
  id: 'jpad', name: 'JPad',
  get bundle() {
    try {
      if (!/^https?:/.test(import.meta.url)) return null;
      return { icon: '☕', entry: 'plugin', exportName: 'jpadPlugin', hostExport: 'createBridgeHost',
        inside: `new Promise(r => { if (parent === window) return r(false); const t = setTimeout(() => r(false), 700); addEventListener('message', e => { if (e.data && e.data.type === 'jpad-hello') { clearTimeout(t); r(true); } }); parent.postMessage({ type: 'jpad', action: 'hello' }, '*'); })`,
        modules: [{ name: 'plugin', url: import.meta.url }] };
    } catch (e) { return null; }
  },
  blocks: {
    jtask: {
      n: 'Programmier-Aufgabe', ic: '☕', g: 'JPad', h: 'JPad prüft die Ausgabe des Programms (und Pflicht-Code)', openForm: true,
      make: () => ({ title: '', html: '', start: '', expect: '', compare: 'enthaelt', needs: [], xp: 20, tips: [], solution: '', img: '' }),
      check: () => true,
      label: b => b.title || 'die Programmier-Aufgabe',
      render(b, x) {
        const ok = x.prog.solved[b.id], fb = x.prog.quiz[b.id];
        const buttons = (b.start ? `<button class="lp-btn alt" data-run="start">⤵ Startcode in JPad übernehmen</button>` : '')
          + (!x.E() && !ok ? `<button class="lp-btn alt" data-run="checklast">✓ Letzten Programmlauf prüfen</button>` : '');
        const parts = [];
        if (b.expect) parts.push(`Ausgabe ${b.compare === 'gleich' ? 'genau' : 'enthält'} <code>${esc(b.expect.length > 60 ? b.expect.slice(0, 60) + '…' : b.expect)}</code>`);
        if ((b.needs || []).filter(Boolean).length) parts.push(`im Code: ${(b.needs || []).filter(Boolean).map(n => `<code>${esc(n)}</code>`).join(', ')}`);
        const hint = parts.length ? `JPad prüft nach jedem Programmlauf: ${parts.join(' · ')}.` : '⚙ → erwartete Ausgabe oder Pflicht-Code eintragen';
        let h = x.taskCard(b, { buttons, hint, where: '☕ JPad' });
        if (b.start && x.E()) h = h.replace(/<\/div>$/, `<pre class="jp-start">${esc(b.start)}</pre></div>`);
        if (fb && !ok && !x.E()) h = h.replace(/<\/div>$/, `<div class="fb jp-fb">✗ ${esc(fb.msg)}</div></div>`);
        return h;
      },
      exportAs: b => ({ type: 'task', id: b.id, title: b.title, html: `${b.html || ''}${b.start ? `<pre class="jp-start">${esc(b.start)}</pre>` : ''}${b.expect ? `<div>Erwartete Ausgabe:</div><pre class="jp-start">${esc(b.expect)}</pre>` : ''}<i>Programmiere in einer Java-Umgebung und hake danach ab.</i>`, xp: b.xp ?? 20, tips: b.tips || [], tipsHide: b.tipsHide, solution: b.solution, solHide: b.solHide, img: b.img || '' }),
      form: [
        { k: 'title', l: 'Titel', t: 'text' },
        { k: 'expect', l: 'Erwartete Ausgabe (leer = keine Prüfung der Ausgabe)', t: 'jp-code', rows: 3 },
        { k: 'compare', l: 'Vergleich', t: 'select', o: [['enthaelt', 'Ausgabe enthält diesen Text (Leerzeichen egal)'], ['gleich', 'Ausgabe genau gleich (bis auf Leerzeichen am Zeilenende)']] },
        { k: 'needs', l: 'Muss im Code vorkommen (optional, z. B. „for“ oder „extends Tier“)', t: 'list', ph: 'Code-Stück' },
        { k: 'start', l: 'Startcode (optional, wird als Datei in JPad übernommen)', t: 'jp-code', rows: 8, take: true },
        { k: 'tips', l: 'Tipps (werden nacheinander aufgedeckt)', t: 'list', ph: 'Tipp', vis: 'tipsHide' },
        { k: 'solution', l: 'Lösung zum Aufdecken (leer = keine)', t: 'text' },
        { k: 'solHide', l: 'Lösung für Schüler sichtbar', t: 'shown', show: b => !!b.solution },
        { k: 'img', l: 'Bild oder GIF zur Aufgabe', t: 'image' },
        { k: 'xp', l: 'XP', t: 'number' },
      ],
      async run(a, b, x) {
        const h = x.host;
        if (a === 'start') { if (h.code) h.code(b.start); else navigator.clipboard?.writeText(b.start).then(() => x.toast('⧉ kopiert')); return; }
        if (a === 'checklast') {
          if (!h.lastRun) { x.toast('Prüfen geht nur in JPad.'); return; }
          const r = checkRun(b, h.lastRun());
          if (r.ok) x.solve(b.id); else { x.prog.quiz[b.id] = { msg: r.msg }; x.prog.tries[b.id] = (x.prog.tries[b.id] || 0) + 1; x.render(); }
        }
      },
    },
  },
  fields: {
    'jp-code': {
      html(f, v, b, x) {
        const take = f.take && x.host.script ? `<div class="row"><button class="take" data-jptake="${f.k}">⤵ Datei aus JPad übernehmen</button></div>` : '';
        return `<label>${esc(f.l)}<textarea class="mono" data-k="${f.k}" rows="${f.rows || 5}" spellcheck="false" autocapitalize="off">${esc(v || '')}</textarea></label>${take}`;
      },
      async click(d, b, draw, x) {
        if (!d.jptake) return;
        const s = await x.host.script?.().catch(() => null);
        if (!s?.text) { x.toast('In JPad ist keine Datei geöffnet.'); return; }
        b[d.jptake] = s.text.replace(/\n+$/, ''); draw(); x.toast(`„${esc(s.name)}“ übernommen`);
      },
    },
  },
  // Textformat („Vorlage für KI“)
  text: {
    'programmier-aufgabe': {
      n: 'Programmier-Aufgabe', type: 'jtask', alias: ['programmieraufgabe', 'java-aufgabe', 'code-aufgabe'], fences: true,
      keys: ['ausgabe', 'vergleich', 'muss', 'tipp', 'loesung', 'xp', 'punkte'],
      help: `### Programmier-Aufgabe: Titel
Arbeitsauftrag, z. B. „Lass Bello dreimal bellen.“
Ausgabe: Wuff! Wuff! Wuff!        (was das Programm ausgeben soll; mehrere Zeilen mit \\n)
Vergleich: enthält | gleich        (Standard: enthält; Leerzeichen und Zeilenumbrüche zählen dann nicht)
Muss: for                          (optional, mehrfach: das muss im Code vorkommen)
Tipp: …
\`\`\`java start
public class Hund { … }            (optional: Startcode, wird in JPad als Datei übernommen)
\`\`\`
\`\`\`java lösung
…                                  (optional: Musterlösung zum Aufdecken)
\`\`\`
(Normale \`\`\`java-Codeblöcke außerhalb von Aufgaben bekommen in JPad den Knopf „In JPad übernehmen“.)`,
      make(S, H) {
        const start = S.code.find(c => !/^(loesung|losung|solution)$/.test(c.tag)), sol = S.code.find(c => /^(loesung|losung|solution)$/.test(c.tag));
        const expect = (S.one('ausgabe') || '').replace(/\\n/g, '\n');
        if (!expect && !S.all('muss').length) H.warn(S.line, `Programmier-Aufgabe „${S.title}“: ohne „Ausgabe:“ oder „Muss:“ kann JPad nichts prüfen.`);
        return { type: 'jtask', title: S.title, html: H.md(S.body), start: start ? start.code : '', expect, compare: /gleich|genau/i.test(S.one('vergleich') || '') ? 'gleich' : 'enthaelt', needs: S.all('muss'),
          xp: S.num('xp', 20), tips: S.all('tipp').map(H.inline || (t => t)), ...(S.hid?.('tipp').some(Boolean) ? { tipsHide: S.hid('tipp') } : {}),
          solution: sol ? `<pre>${esc(sol.code)}</pre>` : (S.one('loesung') ? (H.inline || (t => t))(S.one('loesung')) : ''), ...(S.hid?.('loesung')[0] ? { solHide: true } : {}), img: '' };
      },
      toText(b, { md }) {
        const solCode = /^<pre>([\s\S]*)<\/pre>$/.exec(b.solution || '');
        const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        return [`### Programmier-Aufgabe: ${md(b.title || '')}`, md(b.html || ''), b.expect ? `Ausgabe: ${b.expect.replace(/\n/g, '\\n')}` : '', b.compare === 'gleich' ? 'Vergleich: gleich' : '',
          ...(b.needs || []).filter(Boolean).map(n => `Muss: ${n}`), ...(b.tips || []).map((t, i) => `Tipp${b.tipsHide?.[i] ? ' (verborgen)' : ''}: ${md(t)}`),
          b.solution && !solCode ? `Lösung${b.solHide ? ' (verborgen)' : ''}: ${md(b.solution).replace(/\n+/g, ' ')}` : '', `XP: ${b.xp ?? 20}`,
          b.start ? '```java start\n' + b.start + '\n```' : '', solCode ? '```java lösung\n' + dec(solCode[1]) + '\n```' : ''].filter(Boolean).join('\n');
      },
    },
  },
  css: `
.jp-start { font: 13px/1.4 ui-monospace, Menlo, monospace; background: var(--surface-2, #f3f3f3); padding: 8px; border-radius: 8px; white-space: pre-wrap; overflow-x: auto; }
.jp-fb { color: var(--bad, #c0392b); font-weight: 700; margin-top: 6px; }
`,
};
