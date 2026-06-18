/*
 * Moteur d'échecs minimaliste (recherche alpha-bêta + quiescence).
 * Sert à la fois d'adversaire et de "cerveau" pour le coach.
 * Dépend de la variable globale `Chess` (vendor/chess.js).
 *
 * Tout est exécuté sur le thread principal (pas de Web Worker) pour rester
 * compatible avec une ouverture directe du fichier (file://). La recherche est
 * bornée en profondeur ET en temps pour ne jamais geler l'interface.
 */
(function (global) {
  'use strict';

  var MATE = 1000000;      // score d'un mat
  var INF = 2000000;

  // Valeurs des pièces (centièmes de pion).
  var VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

  // Tables position/pièce, orientées rangée 0 = 8e rangée (comme chess.board()).
  // Vues du côté des Blancs ; pour les Noirs on miroir verticalement.
  var PST = {
    p: [
      0, 0, 0, 0, 0, 0, 0, 0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
      5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0,
      5, -5, -10, 0, 0, -10, -5, 5,
      5, 10, 10, -20, -20, 10, 10, 5,
      0, 0, 0, 0, 0, 0, 0, 0
    ],
    n: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20, 0, 0, 0, 0, -20, -40,
      -30, 0, 10, 15, 15, 10, 0, -30,
      -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30,
      -30, 5, 10, 15, 15, 10, 5, -30,
      -40, -20, 0, 5, 5, 0, -20, -40,
      -50, -40, -30, -30, -30, -30, -40, -50
    ],
    b: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 10, 10, 5, 0, -10,
      -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10,
      -10, 10, 10, 10, 10, 10, 10, -10,
      -10, 5, 0, 0, 0, 0, 5, -10,
      -20, -10, -10, -10, -10, -10, -10, -20
    ],
    r: [
      0, 0, 0, 0, 0, 0, 0, 0,
      5, 10, 10, 10, 10, 10, 10, 5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      0, 0, 0, 5, 5, 0, 0, 0
    ],
    q: [
      -20, -10, -10, -5, -5, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 5, 5, 5, 0, -10,
      -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5,
      -10, 5, 5, 5, 5, 5, 0, -10,
      -10, 0, 5, 0, 0, 0, 0, -10,
      -20, -10, -10, -5, -5, -10, -10, -20
    ],
    k: [
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20,
      -10, -20, -20, -20, -20, -20, -20, -10,
      20, 20, 0, 0, 0, 0, 20, 20,
      20, 30, 10, 0, 0, 10, 30, 20
    ]
  };

  var nodes = 0;

  // Évaluation statique, en centièmes de pion, du point de vue des Blancs.
  function evaluate(game) {
    var board = game.board(); // board[0] = 8e rangée (a8..h8)
    var score = 0;
    var bishops = { w: 0, b: 0 };
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var sq = board[r][c];
        if (!sq) continue;
        var v = VALUE[sq.type];
        var idx = r * 8 + c;
        if (sq.color === 'w') {
          score += v + PST[sq.type][idx];
          if (sq.type === 'b') bishops.w++;
        } else {
          // Miroir vertical pour les Noirs : rangée 7 - r.
          var midx = (7 - r) * 8 + c;
          score -= v + PST[sq.type][midx];
          if (sq.type === 'b') bishops.b++;
        }
      }
    }
    // Paire de fous.
    if (bishops.w >= 2) score += 30;
    if (bishops.b >= 2) score -= 30;
    return score;
  }

  // Évaluation du point de vue du camp au trait (négamax).
  function evalSTM(game) {
    var w = evaluate(game);
    return game.turn() === 'w' ? w : -w;
  }

  function isNoisy(m) {
    return m.flags.indexOf('c') !== -1 ||
      m.flags.indexOf('e') !== -1 ||
      m.flags.indexOf('p') !== -1;
  }

  // Tri MVV-LVA : prises de grosse pièce par petite pièce d'abord.
  function orderMoves(moves) {
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var s = 0;
      if (m.captured) s += 10 * VALUE[m.captured] - VALUE[m.piece];
      if (m.flags.indexOf('p') !== -1) s += 800;
      m._ord = s;
    }
    moves.sort(function (a, b) { return b._ord - a._ord; });
    return moves;
  }

  function quiescence(game, alpha, beta, deadline, ply) {
    nodes++;
    if ((nodes & 1023) === 0 && Date.now() > deadline) throw { timeout: true };
    var standPat = evalSTM(game);
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    var moves = game.moves({ verbose: true });
    var noisy = [];
    for (var i = 0; i < moves.length; i++) {
      if (isNoisy(moves[i])) noisy.push(moves[i]);
    }
    orderMoves(noisy);
    for (var j = 0; j < noisy.length; j++) {
      game.move(noisy[j]);
      var val;
      // try/finally garantit l'annulation même si un timeout est levé.
      try { val = -quiescence(game, -beta, -alpha, deadline, ply + 1); }
      finally { game.undo(); }
      if (val >= beta) return beta;
      if (val > alpha) alpha = val;
    }
    return alpha;
  }

  function negamax(game, depth, alpha, beta, deadline, ply) {
    nodes++;
    if ((nodes & 1023) === 0 && Date.now() > deadline) throw { timeout: true };

    var moves = game.moves({ verbose: true });
    if (moves.length === 0) {
      if (game.in_check()) return -MATE + ply; // camp au trait maté
      return 0; // pat
    }
    if (game.insufficient_material()) return 0;
    if (depth <= 0) return quiescence(game, alpha, beta, deadline, ply);

    orderMoves(moves);
    var best = -INF;
    for (var i = 0; i < moves.length; i++) {
      game.move(moves[i]);
      var val;
      try { val = -negamax(game, depth - 1, -beta, -alpha, deadline, ply + 1); }
      finally { game.undo(); }
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (alpha >= beta) break;
    }
    return best;
  }

  /*
   * Analyse la position courante.
   * Renvoie { bestMove, scoreWhite, rootScores, mate } où :
   *   - bestMove : meilleur coup (objet verbeux chess.js) ou null si terminal
   *   - scoreWhite : évaluation en centièmes de pion, vue des Blancs
   *   - rootScores : [{move, score}] triés (score vu du camp au trait)
   *   - mate : { side, in } si un mat forcé est détecté, sinon null
   */
  function search(game, opts) {
    opts = opts || {};
    var maxDepth = opts.depth || 3;
    var timeMs = opts.time || 900;
    var deadline = Date.now() + timeMs;
    nodes = 0;

    var color = game.turn();
    var rootMoves = game.moves({ verbose: true });
    if (rootMoves.length === 0) {
      var terminal = game.in_check() ? (-MATE) : 0;
      return {
        bestMove: null,
        scoreWhite: color === 'w' ? terminal : -terminal,
        rootScores: [],
        mate: null
      };
    }
    orderMoves(rootMoves);

    var completed = null;
    try {
      for (var depth = 1; depth <= maxDepth; depth++) {
        var scores = [];
        for (var i = 0; i < rootMoves.length; i++) {
          game.move(rootMoves[i]);
          // Fenêtre complète à la racine : scores exacts pour tous les coups
          // (nécessaire au coach et au choix de niveau).
          var sc;
          try { sc = -negamax(game, depth - 1, -INF, INF, deadline, 1); }
          finally { game.undo(); }
          scores.push({ move: rootMoves[i], score: sc });
        }
        scores.sort(function (a, b) { return b.score - a.score; });
        completed = scores;
        // Réordonne pour la prochaine itération (le meilleur en premier).
        rootMoves = scores.map(function (s) { return s.move; });
      }
    } catch (e) {
      if (!e || !e.timeout) throw e;
      // Temps écoulé : on garde le dernier niveau complété.
    }

    if (!completed) {
      completed = [{ move: rootMoves[0], score: 0 }];
    }

    var bestRoot = completed[0];
    var scoreWhite = color === 'w' ? bestRoot.score : -bestRoot.score;

    // Détection de mat forcé.
    var mate = null;
    var abs = Math.abs(bestRoot.score);
    if (abs > MATE - 1000) {
      var pliesToMate = MATE - abs;
      var movesToMate = Math.ceil(pliesToMate / 2);
      var winningSide;
      if (bestRoot.score > 0) {
        winningSide = color; // le camp au trait mate
      } else {
        winningSide = color === 'w' ? 'b' : 'w';
      }
      mate = { side: winningSide, in: movesToMate };
    }

    return {
      bestMove: bestRoot.move,
      scoreWhite: scoreWhite,
      rootScores: completed,
      mate: mate
    };
  }

  global.ChessEngine = {
    search: search,
    evaluate: evaluate,
    VALUE: VALUE,
    MATE: MATE
  };
})(window);
