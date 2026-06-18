/*
 * Test d'intégration de app.js SANS navigateur.
 * On fabrique un faux DOM minimal (juste ce que app.js utilise), on charge les
 * scripts dans un contexte VM, puis on simule : démarrage de partie -> sélection
 * d'une pièce -> déplacement -> réponse du moteur. On échoue à la moindre erreur.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');

let failures = 0;
const errors = [];
process.on('unhandledRejection', (e) => { errors.push('unhandledRejection: ' + (e && e.stack || e)); });

// --- Faux DOM ---
function ClassList() { this._s = new Set(); }
ClassList.prototype.add = function (c) { this._s.add(c); };
ClassList.prototype.remove = function (c) { this._s.delete(c); };
ClassList.prototype.contains = function (c) { return this._s.has(c); };
ClassList.prototype.toggle = function (c, on) {
  if (on === undefined) on = !this._s.has(c);
  if (on) this._s.add(c); else this._s.delete(c);
  return on;
};

function El(tag) {
  this.tag = tag || 'div';
  this.children = [];
  this._listeners = {};
  this.style = {};
  this.classList = new ClassList();
  this.textContent = '';
  this._html = '';
  this.disabled = false;
  this.checked = false;
  this._attrs = {};
  this.className = '';
  this.scrollTop = 0;
  this.scrollHeight = 0;
  this.onclick = null;
}
Object.defineProperty(El.prototype, 'innerHTML', {
  get() { return this._html; },
  set(v) { this._html = v; if (v === '') this.children = []; }
});
El.prototype.addEventListener = function (t, h) { (this._listeners[t] = this._listeners[t] || []).push(h); };
El.prototype.dispatch = function (t, ev) { (this._listeners[t] || []).forEach(h => h(ev)); };
El.prototype.getAttribute = function (k) { return this._attrs[k] !== undefined ? this._attrs[k] : null; };
El.prototype.setAttribute = function (k, v) { this._attrs[k] = v; };
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.closest = function () { return null; };

// Boutons de segment (couleur / niveau).
function segBtn(attr, val) {
  const b = new El('button');
  b._attrs[attr] = val;
  return b;
}

const ids = {};
function mk(id, children) {
  const e = new El();
  e._attrs.id = id;
  if (children) children.forEach(c => e.appendChild(c));
  ids[id] = e;
  return e;
}

// Éléments présents dans index.html et utilisés par app.js.
[
  'sound-btn', 'new-btn', 'eval-bar', 'eval-fill', 'eval-num', 'board',
  'captured', 'captured-bottom', 'coach-card', 'move-badge', 'coach-msg',
  'coach-detail', 'hint-btn', 'undo-btn', 'flip-btn', 'status', 'history',
  'tip', 'setup', 'promo', 'promo-choices', 'coach-toggle'
].forEach(id => mk(id));

mk('color-seg', [segBtn('data-color', 'w'), segBtn('data-color', 'b'), segBtn('data-color', 'r')]);
mk('level-seg', [segBtn('data-level', '1'), segBtn('data-level', '2'), segBtn('data-level', '3')]);
mk('play-btn');

const coachAvatar = new El();

const documentStub = {
  readyState: 'complete',
  getElementById: (id) => ids[id] || null,
  querySelector: (sel) => sel === '.coach-avatar' ? coachAvatar : null,
  createElement: (t) => new El(t),
  addEventListener: () => {}
};

// --- Sandbox ---
const sandbox = {};
sandbox.window = sandbox;
sandbox.document = documentStub;
sandbox.console = console;
sandbox.Date = Date;
sandbox.Math = Math;
sandbox.setTimeout = setTimeout;
sandbox.clearTimeout = clearTimeout;
sandbox.Promise = Promise;
sandbox.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = v; },
};
sandbox.AudioContext = function () {
  return { state: 'running', currentTime: 0, resume() {},
    createOscillator() { return { type: '', frequency: {}, connect() {}, start() {}, stop() {} }; },
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; },
    destination: {} };
};
const ctx = vm.createContext(sandbox);
const load = f => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });

function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); failures++; } }

try {
  load('vendor/chess.js');
  load('engine.js');
  load('coach.js');
  load('app.js'); // app.js appelle init() immédiatement (readyState=complete)
  console.log('1) Chargement + init()');
  ok(true, 'aucun crash au chargement/init');
  ok((ids['tip'].textContent || '').length > 0, 'un conseil est affiché');

  console.log('2) Démarrage de partie (Blancs, débutant)');
  // play-btn.onclick est défini par bindSetup.
  ok(typeof ids['play-btn'].onclick === 'function', 'le bouton Jouer a un handler');
  ids['play-btn'].onclick();
  ok(ids['board']._html.length > 0, "l'échiquier est rendu (innerHTML non vide)");
  ok(ids['setup'].classList.contains('hidden'), 'la modale de setup est masquée');
  ok((ids['board']._html.match(/data-sq=/g) || []).length === 64, '64 cases rendues');

  console.log('3) Coup humain : e2 -> e4');
  function clickSquare(sq) {
    const cell = { getAttribute: (k) => (k === 'data-sq' ? sq : null) };
    const ev = { target: { closest: (s) => (s === '.sq' ? cell : null) } };
    ids['board'].dispatch('click', ev);
  }
  clickSquare('e2'); // sélection
  ok(ids['board']._html.indexOf('class="dot"') !== -1 || ids['board']._html.indexOf('dot') !== -1, 'des coups légaux sont indiqués après sélection');

  // On laisse l'analyse de fond se terminer (comme un humain qui réfléchit),
  // puis on joue, puis on attend la réponse du moteur.
  setTimeout(() => clickSquare('e4'), 1500);

  setTimeout(() => {
    console.log('4) Après le coup et la réponse du moteur');
    const hist = ids['history']._html;
    ok(hist.indexOf('e4') !== -1, "l'historique contient e4 (got: " + (hist.slice(0, 60)) + '…)');
    ok((ids['coach-msg'].textContent || '').length > 0, 'le coach a dit quelque chose : "' + ids['coach-msg'].textContent + '"');
    ok(/\d/.test(ids['eval-num'].textContent || ''), "la barre d'éval affiche un nombre : " + ids['eval-num'].textContent);
    // l'adversaire a répondu -> au moins 2 demi-coups dans l'historique
    const moves = (hist.match(/class="mv"/g) || []).length;
    ok(moves >= 2, 'au moins 2 demi-coups joués (got ' + moves + ')');

    if (errors.length) { errors.forEach(e => { console.log('  ✗ ' + e); }); failures += errors.length; }
    console.log('\n' + (failures === 0 ? 'INTÉGRATION DOM OK ✅' : failures + ' PROBLÈME(S) ❌'));
    process.exit(failures === 0 ? 0 : 1);
  }, 6000);

} catch (e) {
  console.log('  ✗ EXCEPTION: ' + (e && e.stack || e));
  process.exit(1);
}
