/*
 * Test de fumée sans navigateur : charge les scripts "classiques" dans un
 * contexte VM partagé (en simulant `window`), puis exerce le moteur et le coach.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.Date = Date;
sandbox.Math = Math;
const ctx = vm.createContext(sandbox);

function load(file) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInContext(code, ctx, { filename: file });
}

load('vendor/chess.js');
load('engine.js');
load('coach.js');

let failures = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ ' + msg); failures++; }
}

console.log('1) chess.js exposé');
ok(typeof sandbox.Chess === 'function', 'Chess est défini');
ok(typeof sandbox.ChessEngine === 'object', 'ChessEngine est défini');
ok(typeof sandbox.ChessCoach === 'object', 'ChessCoach est défini');

console.log('2) Règles de base');
const g = new sandbox.Chess();
ok(g.moves().length === 20, '20 coups initiaux');
ok(g.move('e4') !== null, 'e4 légal');
ok(g.move('e5') !== null, 'e5 légal');
ok(g.move('zz9') === null, 'coup illégal rejeté');

console.log('3) Recherche moteur (depth 2 et 3)');
const t0 = Date.now();
const r2 = sandbox.ChessEngine.search(g, { depth: 2, time: 800 });
ok(r2.bestMove && r2.bestMove.san, 'depth 2 renvoie un meilleur coup: ' + (r2.bestMove && r2.bestMove.san));
ok(typeof r2.scoreWhite === 'number', 'scoreWhite numérique: ' + r2.scoreWhite);
ok(Array.isArray(r2.rootScores) && r2.rootScores.length > 0, 'rootScores non vide (' + r2.rootScores.length + ')');
const r3 = sandbox.ChessEngine.search(g, { depth: 3, time: 1200 });
ok(r3.bestMove && r3.bestMove.san, 'depth 3 renvoie un meilleur coup: ' + (r3.bestMove && r3.bestMove.san));
console.log('   (temps total recherche: ' + (Date.now() - t0) + ' ms)');

console.log('4) Détection de gaffe : pion en prise libre');
// Position où jouer un coup qui pend une pièce doit être détecté.
const g2 = new sandbox.Chess();
// 1.e4 e5 2.Nf3 -> noir au trait. On analyse avant/après un mauvais coup (Qh4??-ish).
g2.move('e4'); g2.move('e5'); g2.move('Nf3');
const pre = sandbox.ChessEngine.search(g2, { depth: 3, time: 1000 });
ok(pre.bestMove && pre.bestMove.san, 'analyse pré-coup ok (' + pre.bestMove.san + ')');
// Noir joue un coup gratuitement perdant : ...d5 ?! puis on teste un vrai blunder
g2.move('Nc6');
g2.move('Bc4');
const preW = sandbox.ChessEngine.search(g2, { depth: 3, time: 1000 });
// Blanc joue volontairement une gaffe : avance un pion qui pend ? On force un coup nul.
// On teste plutôt la classification directement avec des évals synthétiques.

console.log('5) Coach : classification');
const C = sandbox.ChessCoach;
// Joueur blanc, meilleur coup valait +50, après son coup -250 => grosse perte.
const blunder = C.classify(50, -250, null, null, 'w', false);
ok(blunder.category === 'blunder', 'perte de ~3 pions = gaffe (got ' + blunder.category + ')');
const bestC = C.classify(40, 38, null, null, 'w', true);
ok(bestC.category === 'best', 'coup optimal = best (got ' + bestC.category + ')');
const inacc = C.classify(50, 0, null, null, 'w', false);
ok(inacc.category === 'inaccuracy', 'perte de 0.5 pion = imprécision (got ' + inacc.category + ')');
// Côté noir : signes inversés. Meilleur -50 (bon pour noir), après +250 (mauvais pour noir) => gaffe
const blunderB = C.classify(-50, 250, null, null, 'b', false);
ok(blunderB.category === 'blunder', 'gaffe côté noir détectée (got ' + blunderB.category + ')');
// Mat permis
const mateAllowed = C.classify(0, 0, null, { side: 'b', in: 2 }, 'w', false);
ok(mateAllowed.category === 'blunder', 'laisser un mat = gaffe (got ' + mateAllowed.category + ')');

console.log('6) Coach : explication complète sur un vrai coup');
const g3 = new sandbox.Chess();
g3.move('e4');
const move = g3.move('e5'); // coup noir verbeux
const post = sandbox.ChessEngine.search(g3, { depth: 2, time: 600 });
const expl = C.explain({
  classification: C.classify(20, post.scoreWhite, null, null, 'b', true),
  playedMove: move,
  bestMove: post.bestMove,
  bestSan: post.bestMove ? post.bestMove.san : null,
  scoreWhite: post.scoreWhite,
  mate: post.mate,
  userColor: 'b',
  oppBestMove: post.bestMove,
  gaveCheck: false,
  isMate: false,
  userColorOppName: 'les Blancs'
});
ok(typeof expl.message === 'string' && expl.message.length > 0, 'message coach: "' + expl.message + '"');
ok(typeof expl.detail === 'string', 'detail coach: "' + expl.detail + '"');

console.log('7) Ouvertures');
ok(C.detectOpening(['e4', 'c5']) === 'Défense sicilienne', 'sicilienne reconnue');
ok(C.detectOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']).indexOf('Ruy Lopez') !== -1, 'espagnole reconnue');
ok(C.detectOpening(['a3']) === null, 'ouverture inconnue => null');

console.log('8) Mat en 1 détecté par le moteur');
// Mat du berger position : 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#
const g4 = new sandbox.Chess();
['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6'].forEach(m => g4.move(m));
const mateSearch = sandbox.ChessEngine.search(g4, { depth: 2, time: 800 });
ok(mateSearch.bestMove && mateSearch.bestMove.san === 'Qxf7#', 'trouve Qxf7# (got ' + (mateSearch.bestMove && mateSearch.bestMove.san) + ')');
ok(mateSearch.mate && mateSearch.mate.in === 1 && mateSearch.mate.side === 'w', 'mat en 1 pour les blancs détecté');

console.log('\n' + (failures === 0 ? 'TOUS LES TESTS PASSENT ✅' : (failures + ' TEST(S) EN ÉCHEC ❌')));
process.exit(failures === 0 ? 0 : 1);
