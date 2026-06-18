/*
 * Simule une partie complète (moteur vs moteur) en exerçant à chaque demi-coup
 * la classification et l'explication du coach, comme le ferait l'app.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const sandbox = {}; sandbox.window = sandbox; sandbox.console = console;
sandbox.Date = Date; sandbox.Math = Math;
const ctx = vm.createContext(sandbox);
const load = f => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
load('vendor/chess.js'); load('engine.js'); load('coach.js');

const { Chess, ChessEngine, ChessCoach } = sandbox;

function chooseReply(rootScores, window) {
  const best = rootScores[0].score;
  const cands = rootScores.filter(r => r.score >= best - window);
  return cands[Math.floor(Math.random() * cands.length)].move;
}

const g = new Chess();
let ply = 0;
let crashed = false;
const counts = {};

while (!g.game_over() && ply < 80) {
  const userColor = g.turn(); // on "coache" le camp au trait à chaque coup
  // Analyse avant le coup.
  const fenA = g.fen();
  const pre = ChessEngine.search(g, { depth: 3, time: 150 }); // temps court => force des timeouts
  if (g.fen() !== fenA) { console.log('  ✗ recherche a corrompu la position ! ' + fenA + ' -> ' + g.fen()); process.exit(3); }
  // On joue un coup (pas toujours le meilleur, pour générer de la variété).
  const move = chooseReply(pre.rootScores, 120);
  const fenBefore = g.fen();
  const played = g.move(move);
  if (!played) {
    console.log('  ✗ move() a renvoyé null');
    console.log('    FEN: ' + fenBefore);
    console.log('    move objet: ' + JSON.stringify(move));
    process.exit(2);
  }
  // Analyse après le coup.
  const post = ChessEngine.search(g, { depth: 2, time: 400 });

  try {
    const isBest = pre.bestMove && pre.bestMove.san === played.san;
    const cls = ChessCoach.classify(pre.scoreWhite, post.scoreWhite, pre.mate, post.mate, userColor, isBest);
    counts[cls.category] = (counts[cls.category] || 0) + 1;
    const out = ChessCoach.explain({
      classification: cls,
      playedMove: played,
      bestMove: pre.bestMove,
      bestSan: pre.bestMove ? pre.bestMove.san : null,
      scoreWhite: post.scoreWhite,
      mate: post.mate,
      userColor: userColor,
      oppBestMove: post.bestMove,
      gaveCheck: g.in_check(),
      isMate: g.in_checkmate(),
      userColorOppName: userColor === 'w' ? 'les Noirs' : 'les Blancs'
    });
    if (typeof out.message !== 'string' || out.message.length === 0) throw new Error('message vide');
    if (ply < 6) console.log(`  ${ply + 1}. ${played.san.padEnd(7)} [${cls.glyph} ${cls.label}] ${out.message}`);
  } catch (e) {
    console.log('  ✗ CRASH au coup ' + (ply + 1) + ' (' + played.san + '): ' + e.message);
    crashed = true; break;
  }
  ply++;
}

console.log('\nPartie simulée : ' + ply + ' demi-coups joués.');
console.log('Répartition des évaluations du coach :', counts);
console.log('État final : ' + (g.in_checkmate() ? 'échec et mat' : g.in_draw() ? 'nulle' : g.game_over() ? 'terminée' : 'interrompue (limite atteinte)'));
console.log(crashed ? '\nÉCHEC ❌' : '\nAUCUN CRASH ✅');
process.exit(crashed ? 1 : 0);
