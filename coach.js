/*
 * Le coach : transforme les évaluations du moteur en conseils pédagogiques
 * en français. Classe chaque coup, détecte les gaffes, reconnaît quelques
 * ouvertures et distille des principes.
 */
(function (global) {
  'use strict';

  var VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  var PIECE_FR = {
    p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi'
  };

  // Petit livre d'ouvertures (séquences SAN -> nom).
  var OPENINGS = {
    'e4 e5': "Ouverture du pion roi",
    'e4 e5 Nf3': "Jeu ouvert",
    'e4 e5 Nf3 Nc6 Bb5': "Partie espagnole (Ruy Lopez)",
    'e4 e5 Nf3 Nc6 Bc4': "Partie italienne",
    'e4 e5 Nf3 Nc6 Bc4 Bc5': "Giuoco Piano (partie italienne)",
    'e4 e5 Nf3 Nf6': "Défense russe (Petroff)",
    'e4 c5': "Défense sicilienne",
    'e4 c6': "Défense Caro-Kann",
    'e4 e6': "Défense française",
    'e4 d5': "Défense scandinave",
    'e4 d6': "Défense Pirc",
    'd4 d5': "Ouverture du pion dame",
    'd4 d5 c4': "Gambit dame",
    'd4 Nf6': "Défenses indiennes",
    'd4 Nf6 c4 g6': "Défense est-indienne",
    'd4 Nf6 c4 e6': "Défense nimzo / ouest-indienne",
    'c4': "Ouverture anglaise",
    'Nf3': "Ouverture Réti",
    'e4 e5 Nf3 Nc6 Bb5 a6': "Espagnole, variante Morphy",
    'd4 d5 c4 e6': "Gambit dame refusé",
    'd4 d5 c4 dxc4': "Gambit dame accepté"
  };

  // Conseils généraux affichés en rotation.
  var TIPS = [
    "Développe tes pièces tôt : cavaliers et fous avant la dame.",
    "Contrôle le centre (cases d4, e4, d5, e5).",
    "Roque tôt pour mettre ton roi en sécurité.",
    "Ne sors pas ta dame trop tôt, elle devient une cible.",
    "Avant de jouer, demande-toi : « Est-ce que ma pièce sera en prise ? »",
    "Une pièce bien placée vaut mieux qu'une pièce qui bouge sans but.",
    "Regarde toujours les échecs, les prises et les menaces de l'adversaire.",
    "Les tours aiment les colonnes ouvertes.",
    "En finale, le roi devient une pièce active : fais-le avancer.",
    "Si tu as l'avantage matériel, propose des échanges pour simplifier.",
    "Un cavalier au bord est rarement bien placé.",
    "Compte le matériel après chaque échange pour ne pas perdre le fil."
  ];

  function pawns(cp) {
    return (cp / 100).toFixed(1);
  }

  // Décrit l'évaluation du point de vue du joueur humain.
  function evalText(scoreWhite, userColor) {
    var s = userColor === 'w' ? scoreWhite : -scoreWhite;
    var p = Math.abs(s) / 100;
    var sign = s >= 0 ? '+' : '-';
    var num = sign + p.toFixed(1);
    var who = s >= 0 ? 'Tu' : "L'adversaire";
    if (Math.abs(s) < 40) return "La position est à peu près égale (" + num + ").";
    if (Math.abs(s) < 120) {
      return who + (s >= 0 ? ' as' : '') + (s >= 0
        ? " un léger avantage (" + num + ")."
        : " a un léger avantage (" + num + ").");
    }
    if (Math.abs(s) < 300) {
      return who + (s >= 0
        ? " as un avantage net (" + num + ")."
        : " a un avantage net (" + num + ").");
    }
    return who + (s >= 0
      ? " es en position gagnante (" + num + ")."
      : " es en position perdante (" + num + ").");
  }

  // Matériel total d'un camp (en pions).
  function materialOf(board, color) {
    var total = 0;
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var sq = board[r][c];
        if (sq && sq.color === color) total += VALUE[sq.type];
      }
    }
    return total;
  }

  /*
   * Classe le coup joué par l'humain.
   *   preEval  : éval (Blancs) AVANT le coup, en supposant le meilleur coup
   *   postEval : éval (Blancs) APRÈS le coup joué
   *   preMate / postMate : infos de mat éventuelles
   * Renvoie { category, glyph, lossCp, label, color }
   */
  function classify(preEval, postEval, preMate, postMate, userColor, isBest) {
    var sign = userColor === 'w' ? 1 : -1;
    var preU = sign * preEval;   // valeur si le joueur avait joué au mieux
    var postU = sign * postEval; // valeur après le coup réellement joué

    // Cas mat.
    var allowsMate = postMate && postMate.side !== userColor;
    var hadMate = preMate && preMate.side === userColor;
    var stillMate = postMate && postMate.side === userColor;
    if (allowsMate) {
      return cat('blunder');
    }
    if (hadMate && !stillMate) {
      return cat('blunder'); // a laissé filer un mat
    }

    var loss = Math.max(0, preU - postU);
    if (isBest || loss <= 10) return cat('best');
    if (loss <= 25) return cat('good');
    if (loss <= 70) return cat('inaccuracy');
    if (loss <= 150) return cat('mistake');
    return cat('blunder');

    function cat(c) {
      var map = {
        best: { category: 'best', glyph: '✓', label: 'Meilleur coup', color: '#5bd1a6' },
        good: { category: 'good', glyph: '•', label: 'Bon coup', color: '#9bd15b' },
        inaccuracy: { category: 'inaccuracy', glyph: '?!', label: 'Imprécision', color: '#e6c84a' },
        mistake: { category: 'mistake', glyph: '?', label: 'Erreur', color: '#e89b4a' },
        blunder: { category: 'blunder', glyph: '??', label: 'Gaffe', color: '#e2614a' }
      };
      var out = map[c];
      out.lossCp = Math.round(loss);
      return out;
    }
  }

  /*
   * Construit le message du coach après un coup humain.
   * ctx = {
   *   classification, playedMove (verbeux), bestMove (verbeux), bestSan,
   *   scoreWhite, mate, userColor, boardBefore, boardAfter,
   *   oppBestMove (verbeux, réplique de l'adversaire), gaveCheck, isMate
   * }
   */
  function explain(ctx) {
    var cls = ctx.classification;
    var played = ctx.playedMove;
    var parts = [];
    var lines = [];

    // 1) Réaction principale selon la catégorie.
    var openers = {
      best: ['Parfait, c\'était le meilleur coup !', 'Excellent, exactement ce qu\'il fallait jouer.', 'Top, le coup le plus fort.'],
      good: ['Bon coup, tout à fait jouable.', 'Solide, rien à redire.', 'Très bien, coup sain.'],
      inaccuracy: ['Pas idéal : une petite imprécision.', 'Jouable, mais il y avait mieux.'],
      mistake: ['Attention, c\'est une erreur.', 'Ce coup coûte un peu de terrain.'],
      blunder: ['Aïe, c\'est une grosse gaffe.', 'Là tu perds beaucoup, attention !']
    };
    parts.push(pick(openers[cls.category]));

    // 2) Que fait le coup ?
    if (ctx.isMate) {
      parts.push('Et… échec et mat ! Bravo. ♛');
    } else if (ctx.gaveCheck) {
      parts.push('Tu mets le roi adverse en échec.');
    }
    if (played.captured) {
      parts.push('Tu captures ' + withArticle(played.captured) + '.');
    }
    if (played.flags.indexOf('k') !== -1 || played.flags.indexOf('q') !== -1) {
      parts.push('Beau réflexe : tu mets ton roi à l\'abri en roquant.');
    }
    if (played.flags.indexOf('p') !== -1 && played.promotion) {
      parts.push('Promotion en ' + PIECE_FR[played.promotion] + ' !');
    }

    // 3) Pédagogie selon la sévérité.
    if (cls.category === 'inaccuracy' || cls.category === 'mistake' || cls.category === 'blunder') {
      // Pièce laissée en prise ?
      var hung = detectHang(ctx);
      if (hung) {
        parts.push(hung);
      }
      if (ctx.bestSan && ctx.bestMove && ctx.bestMove.san !== played.san) {
        parts.push('Le meilleur coup était ' + ctx.bestSan + describeMove(ctx.bestMove) + '.');
      }
    } else if (cls.category === 'good' && ctx.bestSan && ctx.bestMove && ctx.bestMove.san !== played.san) {
      lines.push('À noter : ' + ctx.bestSan + ' était légèrement plus précis.');
    }

    // 4) Évaluation chiffrée.
    if (!ctx.isMate) {
      lines.push(evalText(ctx.scoreWhite, ctx.userColor));
    }

    return {
      message: parts.join(' '),
      detail: lines.join(' ')
    };
  }

  // Détecte si le coup laisse une pièce en prise (la réplique adverse gagne du matériel).
  function detectHang(ctx) {
    var opp = ctx.oppBestMove;
    if (!opp || !opp.captured) return null;
    var gain = VALUE[opp.captured];
    if (gain < 2) return null; // un simple pion : on ne dramatise pas
    // La pièce capturée est-elle celle qu'on vient de déplacer (en prise) ?
    if (opp.to === ctx.playedMove.to) {
      return 'Le souci : ' + withArticle(opp.captured) +
        ' que tu viens de jouer peut être pris (' + ctx.userColorOppName + ' joue ' + opp.san + ').';
    }
    return 'Du coup, l\'adversaire peut gagner du matériel avec ' + opp.san + '.';
  }

  function describeMove(m) {
    if (!m) return '';
    if (m.captured) return ' (qui gagne ' + withArticle(m.captured) + ')';
    if (m.flags && (m.flags.indexOf('k') !== -1 || m.flags.indexOf('q') !== -1)) return ' (le roque)';
    return '';
  }

  function withArticle(type) {
    var n = PIECE_FR[type] || 'pièce';
    // le pion, le cavalier, le fou, la tour, la dame, le roi
    if (type === 'r' || type === 'q') return 'la ' + n;
    return 'le ' + n;
  }

  // Reconnaît une ouverture d'après l'historique SAN.
  function detectOpening(historySan) {
    var key = historySan.join(' ');
    var best = null;
    for (var seq in OPENINGS) {
      if (!OPENINGS.hasOwnProperty(seq)) continue;
      if (key === seq || key.indexOf(seq + ' ') === 0) {
        if (!best || seq.length > best.length) best = seq;
      }
    }
    return best ? OPENINGS[best] : null;
  }

  var tipIndex = Math.floor(Math.random() * TIPS.length);
  function nextTip() {
    tipIndex = (tipIndex + 1) % TIPS.length;
    return TIPS[tipIndex];
  }
  function randomTip() {
    return TIPS[Math.floor(Math.random() * TIPS.length)];
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  global.ChessCoach = {
    classify: classify,
    explain: explain,
    evalText: evalText,
    detectOpening: detectOpening,
    nextTip: nextTip,
    randomTip: randomTip,
    materialOf: materialOf,
    PIECE_FR: PIECE_FR,
    withArticle: withArticle
  };
})(window);
