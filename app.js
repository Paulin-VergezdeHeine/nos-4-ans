/*
 * Échecs Coach — interface et orchestration.
 * Relie chess.js (règles), ChessEngine (analyse) et ChessCoach (conseils).
 */
(function () {
  'use strict';

  var FILES = 'abcdefgh';
  var GLYPH = {
    w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
  };

  // Réglages moteur selon le niveau.
  var LEVELS = {
    1: { depth: 2, time: 500, window: 180, noise: 0.30 }, // Débutant
    2: { depth: 3, time: 800, window: 60, noise: 0.05 },  // Intermédiaire
    3: { depth: 4, time: 1300, window: 0, noise: 0 }      // Avancé
  };
  // Profondeur d'analyse du coach (qualité des conseils, indépendante du niveau).
  function coachOpts(level) {
    return level >= 3 ? { depth: 4, time: 1300 } : { depth: 3, time: 800 };
  }

  // --- État global ---
  var S = {
    game: null,
    userColor: 'w',
    level: 1,
    coachEnabled: true,
    flipped: false,
    phase: 'idle',     // idle | user | thinking | over
    selected: null,
    targets: {},       // squareName -> flags
    lastMove: null,    // {from, to}
    pre: null,         // analyse de la position avant le coup humain
    hintLevel: 0,
    busy: false
  };

  // --- DOM ---
  var el = {};
  function $(id) { return document.getElementById(id); }

  // --- Audio (Web Audio, créé au premier geste) ---
  var audio = { ctx: null, on: true };
  function ensureAudio() {
    if (!audio.ctx) {
      try { audio.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { audio.ctx = null; }
    }
  }
  function beep(freq, dur, type, vol) {
    if (!audio.on || !audio.ctx) return;
    var o = audio.ctx.createOscillator();
    var g = audio.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    o.connect(g); g.connect(audio.ctx.destination);
    var t = audio.ctx.currentTime;
    g.gain.setValueAtTime(vol || 0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur);
  }
  function soundMove(m) {
    ensureAudio();
    if (m && /[#]/.test(m.san)) { beep(523, 0.18, 'sine', 0.08); setTimeout(function () { beep(784, 0.2, 'sine', 0.06); }, 110); return; }
    if (m && m.captured) beep(200, 0.12, 'triangle', 0.09);
    else beep(430, 0.07, 'sine', 0.05);
    if (m && /\+/.test(m.san)) setTimeout(function () { beep(660, 0.1, 'sine', 0.05); }, 70);
  }
  function soundEnd() {
    ensureAudio();
    beep(392, 0.18, 'sine', 0.07);
    setTimeout(function () { beep(330, 0.24, 'sine', 0.06); }, 130);
  }

  // --- Persistance légère ---
  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem('chesscoach') || '{}');
      if (typeof p.sound === 'boolean') audio.on = p.sound;
      if (p.color) S.userColor = p.color;
      if (p.level) S.level = p.level;
      if (typeof p.coach === 'boolean') S.coachEnabled = p.coach;
    } catch (e) { /* ignore */ }
  }
  function savePrefs() {
    try {
      localStorage.setItem('chesscoach', JSON.stringify({
        sound: audio.on, color: S.userColor, level: S.level, coach: S.coachEnabled
      }));
    } catch (e) { /* ignore */ }
  }

  // --- Utilitaires ---
  function think(opts, game) {
    // Laisse le navigateur peindre l'état "réflexion" avant la recherche bloquante.
    game = game || S.game;
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(window.ChessEngine.search(game, opts)); }, 18);
    });
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function squareName(r, c) { return FILES[c] + (8 - r); }
  function oppColor(c) { return c === 'w' ? 'b' : 'w'; }
  function colorNameFr(c, cap) {
    var s = c === 'w' ? 'les Blancs' : 'les Noirs';
    return cap ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // ====================================================================
  //  Rendu de l'échiquier
  // ====================================================================
  function render() {
    var board = S.game.board();
    var html = '';
    var checkSquare = null;
    if (S.game.in_check()) checkSquare = findKing(board, S.game.turn());

    for (var dr = 0; dr < 8; dr++) {
      for (var dc = 0; dc < 8; dc++) {
        var r = S.flipped ? 7 - dr : dr;
        var c = S.flipped ? 7 - dc : dc;
        var name = squareName(r, c);
        var dark = ((c + (7 - r)) % 2) === 0;
        var classes = 'sq ' + (dark ? 'dark' : 'light');
        if (S.selected === name) classes += ' sel';
        if (S.lastMove && (S.lastMove.from === name || S.lastMove.to === name)) classes += ' last';
        if (checkSquare === name) classes += ' check';
        if (S.hintSquares && S.hintSquares.indexOf(name) !== -1) classes += ' hint';

        var inner = '';
        // Pastilles de coups légaux.
        if (S.targets[name] !== undefined) {
          var cap = S.targets[name].indexOf('c') !== -1 || S.targets[name].indexOf('e') !== -1;
          inner += '<span class="dot' + (cap ? ' capture' : '') + '"></span>';
        }
        // Coordonnées.
        if (dr === 7) inner += '<span class="coord file ' + (dark ? 'on-dark' : 'on-light') + '">' + FILES[c] + '</span>';
        if (dc === 0) inner += '<span class="coord rank ' + (dark ? 'on-dark' : 'on-light') + '">' + (8 - r) + '</span>';
        // Pièce.
        var sq = board[r][c];
        if (sq) inner += '<span class="piece ' + sq.color + '">' + GLYPH[sq.color][sq.type] + '</span>';

        html += '<div class="' + classes + '" data-sq="' + name + '">' + inner + '</div>';
      }
    }
    el.board.innerHTML = html;
    renderCaptured();
  }

  function findKing(board, color) {
    for (var r = 0; r < 8; r++)
      for (var c = 0; c < 8; c++) {
        var sq = board[r][c];
        if (sq && sq.type === 'k' && sq.color === color) return squareName(r, c);
      }
    return null;
  }

  function renderCaptured() {
    var hist = S.game.history({ verbose: true });
    var byUser = [];        // pièces adverses prises par l'humain
    var byOpp = [];
    var mat = 0;            // avantage matériel de l'humain (pions)
    var VAL = window.ChessCoach.PIECE_FR ? { p: 1, n: 3, b: 3, r: 5, q: 9 } : {};
    for (var i = 0; i < hist.length; i++) {
      var m = hist[i];
      if (!m.captured) continue;
      var gained = VAL[m.captured] || 0;
      if (m.color === S.userColor) { byUser.push(GLYPH[oppColor(S.userColor)][m.captured]); mat += gained; }
      else { byOpp.push(GLYPH[S.userColor][m.captured]); mat -= gained; }
    }
    var row = '<span>' + byUser.join('') + '</span>';
    if (mat > 0) row += '<span class="adv">+' + mat + '</span>';
    else if (mat < 0) row += '<span class="adv" style="color:#e2614a">' + mat + '</span>';
    el.capturedBottom.innerHTML = row;
  }

  function setEval(scoreWhite, mate) {
    var share;
    if (mate) share = mate.side === 'w' ? 0.97 : 0.03;
    else {
      var p = Math.max(-12, Math.min(12, scoreWhite / 100));
      share = 1 / (1 + Math.pow(10, -p / 4));
    }
    share = Math.max(0.05, Math.min(0.95, share));
    el.evalFill.style.height = (share * 100) + '%';
    el.evalFill.classList.toggle('flip', S.flipped);
    var txt;
    if (mate) txt = '#' + mate.in;
    else txt = (scoreWhite >= 0 ? '+' : '') + (scoreWhite / 100).toFixed(1);
    el.evalNum.textContent = txt;
  }

  // ====================================================================
  //  Interaction
  // ====================================================================
  function onBoardClick(e) {
    var cell = e.target.closest('.sq');
    if (!cell || S.phase !== 'user' || S.busy) return;
    var name = cell.getAttribute('data-sq');
    var piece = S.game.get(name);

    if (S.selected) {
      if (name === S.selected) { clearSelection(); return; }
      if (S.targets[name] !== undefined) { attemptMove(S.selected, name); return; }
      if (piece && piece.color === S.userColor) { selectSquare(name); return; }
      clearSelection();
      return;
    }
    if (piece && piece.color === S.userColor && S.game.turn() === S.userColor) {
      selectSquare(name);
    }
  }

  function selectSquare(name) {
    S.selected = name;
    S.targets = {};
    var moves = S.game.moves({ square: name, verbose: true });
    for (var i = 0; i < moves.length; i++) S.targets[moves[i].to] = moves[i].flags;
    S.hintSquares = null;
    render();
  }
  function clearSelection() {
    S.selected = null;
    S.targets = {};
    render();
  }

  function isPromotion(from, to) {
    var p = S.game.get(from);
    if (!p || p.type !== 'p') return false;
    var rank = to[1];
    return (p.color === 'w' && rank === '8') || (p.color === 'b' && rank === '1');
  }

  function attemptMove(from, to) {
    if (isPromotion(from, to)) openPromotion(from, to);
    else doUserMove(from, to, null);
  }

  function openPromotion(from, to) {
    var choices = ['q', 'r', 'b', 'n'];
    el.promoChoices.innerHTML = '';
    choices.forEach(function (t) {
      var b = document.createElement('button');
      b.innerHTML = GLYPH[S.userColor][t];
      b.onclick = function () {
        el.promo.classList.add('hidden');
        doUserMove(from, to, t);
      };
      el.promoChoices.appendChild(b);
    });
    el.promo.classList.remove('hidden');
  }

  // ====================================================================
  //  Boucle de jeu
  // ====================================================================
  function startGame() {
    S.game = new window.Chess();
    if (S.userColor === 'r') S.userColor = Math.random() < 0.5 ? 'w' : 'b';
    S.flipped = (S.userColor === 'b');
    S.phase = 'thinking';
    S.selected = null; S.targets = {}; S.lastMove = null; S.pre = null;
    S.hintSquares = null; S.hintLevel = 0;
    setEval(0, null);
    render();
    el.history.innerHTML = '';
    el.coachDetail.textContent = '';
    el.moveBadge.classList.add('hidden');
    el.tip.textContent = window.ChessCoach.randomTip();
    coachSay('🦉', "C'est parti ! " + (S.userColor === 'w'
      ? "Tu as les Blancs, à toi de commencer."
      : "Tu as les Noirs, je joue d'abord."));

    if (S.userColor === 'b') enginePlayFirst();
    else userTurn();
  }

  function enginePlayFirst() {
    setStatus('thinking', "L'adversaire réfléchit…");
    var lv = LEVELS[S.level];
    think({ depth: lv.depth, time: lv.time }).then(function (res) {
      var move = chooseReply(res.rootScores, S.level) || res.bestMove;
      applyMove(move);
      setEval(res.scoreWhite, res.mate);
      userTurn();
    });
  }

  function userTurn() {
    if (checkGameEnd()) return;
    S.phase = 'user';
    S.selected = null; S.targets = {}; S.hintSquares = null; S.hintLevel = 0;
    S.pre = null;
    render();
    updateControls();
    setStatus('your-turn', 'À toi de jouer ♟');
    showOpening();

    // Analyse de fond NON bloquante : tu peux jouer immédiatement. Si elle se
    // termine alors que la position n'a pas changé, on met à jour la barre d'éval
    // et on garde le résultat pour classer ton coup / donner un indice.
    if (S.coachEnabled) {
      var fen = S.game.fen();
      think(coachOpts(S.level)).then(function (res) {
        if (S.game.fen() === fen && S.phase === 'user') {
          S.pre = res;
          setEval(res.scoreWhite, res.mate);
        }
      });
    }
  }

  function doUserMove(from, to, promotion) {
    if (S.busy) return;
    var preFen = S.game.fen(); // position AVANT ton coup (pour classer)
    var moveSpec = { from: from, to: to };
    if (promotion) moveSpec.promotion = promotion;
    var move = S.game.move(moveSpec);
    if (!move) { clearSelection(); return; }

    soundMove(move);
    S.lastMove = { from: from, to: to };
    S.selected = null; S.targets = {}; S.hintSquares = null;
    S.busy = true;
    S.phase = 'thinking';
    render();
    updateControls();

    var humanMated = S.game.in_checkmate();
    var humanDraw = !humanMated && S.game.game_over();

    setStatus('thinking', S.coachEnabled ? 'Le coach analyse ton coup…' : "L'adversaire réfléchit…");

    // Si l'analyse de fond n'était pas prête, on la recalcule sur une partie
    // temporaire (sans toucher à l'état réel).
    var prePromise;
    if (S.coachEnabled && !S.pre) {
      prePromise = think(coachOpts(S.level), new window.Chess(preFen));
    } else {
      prePromise = Promise.resolve(S.pre);
    }

    prePromise.then(function (pre) {
      var opts = S.coachEnabled ? coachOpts(S.level) : { depth: LEVELS[S.level].depth, time: LEVELS[S.level].time };
      think(opts).then(function (post) {
        if (S.coachEnabled && pre) coachOnUserMove(move, pre, post);
        setEval(post.scoreWhite, post.mate);
        S.pre = null;

        if (humanMated) { soundEnd(); endGame(); return; }
        if (humanDraw) { endGame(); return; }

        // Réplique de l'adversaire.
        var reply = chooseReply(post.rootScores, S.level) || post.bestMove;
        setTimeout(function () {
          applyMove(reply);
          if (S.game.game_over()) { soundEnd(); endGame(); return; }
          S.busy = false;
          userTurn();
        }, 280);
      });
    });
  }

  function applyMove(move) {
    var m = S.game.move(move);
    if (!m) return;
    soundMove(m);
    S.lastMove = { from: m.from, to: m.to };
    appendHistory(m, null);
    render();
  }

  // Sélectionne la réponse de l'adversaire selon le niveau.
  function chooseReply(rootScores, level) {
    if (!rootScores || rootScores.length === 0) return null;
    var cfg = LEVELS[level];
    var best = rootScores[0].score;
    // Bruit "débutant" : de temps en temps un coup nettement moins bon.
    if (cfg.noise && Math.random() < cfg.noise && rootScores.length > 1) {
      var loose = rootScores.filter(function (r) { return r.score >= best - 400; });
      return pick(loose).move;
    }
    var cands = rootScores.filter(function (r) { return r.score >= best - cfg.window; });
    return pick(cands).move;
  }

  // ====================================================================
  //  Coaching
  // ====================================================================
  function coachOnUserMove(move, pre, post) {
    var C = window.ChessCoach;
    var isBest = pre.bestMove && pre.bestMove.san === move.san;
    var cls = C.classify(
      pre.scoreWhite, post.scoreWhite,
      pre.mate, post.mate,
      S.userColor, isBest
    );

    var ctx = {
      classification: cls,
      playedMove: move,
      bestMove: pre.bestMove,
      bestSan: pre.bestMove ? pre.bestMove.san : null,
      scoreWhite: post.scoreWhite,
      mate: post.mate,
      userColor: S.userColor,
      oppBestMove: post.bestMove,
      gaveCheck: S.game.in_check(),
      isMate: S.game.in_checkmate(),
      userColorOppName: colorNameFr(oppColor(S.userColor), false)
    };
    var out = C.explain(ctx);

    coachSay('🦉', out.message, cls);
    el.coachDetail.textContent = out.detail || '';
    badge(cls);
    appendHistory(move, cls);
  }

  function showOpening() {
    if (!S.coachEnabled) return;
    var hist = S.game.history();
    if (hist.length === 0 || hist.length > 12) return;
    var name = window.ChessCoach.detectOpening(hist);
    if (name) el.coachDetail.textContent = '📖 ' + name + '.';
  }

  function coachSay(avatar, msg, cls) {
    el.coachAvatar.textContent = avatar || '🦉';
    el.coachMsg.textContent = msg;
    if (cls) el.coachMsg.style.color = cls.color;
    else el.coachMsg.style.color = '';
  }

  function badge(cls) {
    el.moveBadge.textContent = cls.glyph + ' ' + cls.label;
    el.moveBadge.style.background = cls.color;
    el.moveBadge.classList.remove('hidden');
  }

  // ====================================================================
  //  Historique
  // ====================================================================
  function appendHistory(move, cls) {
    // Reconstruit proprement la liste à partir de l'historique complet,
    // en réappliquant les annotations connues.
    if (!S._annot) S._annot = {};
    if (cls) S._annot[S.game.history().length] = cls;

    var hist = S.game.history();
    var html = '';
    for (var i = 0; i < hist.length; i += 2) {
      var num = (i / 2) + 1;
      html += '<span class="num">' + num + '.</span>';
      html += cellHtml(hist[i], i + 1);
      html += hist[i + 1] !== undefined ? cellHtml(hist[i + 1], i + 2) : '<span class="mv"></span>';
    }
    el.history.innerHTML = html;
    el.history.scrollTop = el.history.scrollHeight;
  }
  function cellHtml(san, plyIndex) {
    var a = S._annot[plyIndex];
    var g = a ? ' <span class="g" style="color:' + a.color + '">' + a.glyph + '</span>' : '';
    return '<span class="mv">' + san + g + '</span>';
  }

  // ====================================================================
  //  Contrôles
  // ====================================================================
  function onHint() {
    if (S.phase !== 'user' || !S.game) return;
    ensureAudio();
    function reveal(res) {
      var bm = res.bestMove;
      if (!bm) return;
      if (S.hintLevel === 0) {
        S.hintSquares = [bm.from];
        S.hintLevel = 1;
        coachSay('🦉', 'Essaie de jouer avec ' + pieceAt(bm.from) + ' en ' + bm.from + '.');
      } else {
        S.hintSquares = [bm.from, bm.to];
        coachSay('🦉', 'Le meilleur coup est ' + bm.san + '.');
      }
      render();
    }
    if (S.pre && S.pre.bestMove) reveal(S.pre);
    else {
      setStatus('thinking', 'Le coach cherche un indice…');
      think(coachOpts(S.level)).then(function (res) {
        S.pre = res;
        reveal(res);
        if (S.phase === 'user') setStatus('your-turn', 'À toi de jouer ♟');
      });
    }
  }
  function pieceAt(sq) {
    var p = S.game.get(sq);
    return p ? 'ton ' + (window.ChessCoach.PIECE_FR[p.type] || 'pièce') : 'ta pièce';
  }

  function onUndo() {
    if (S.phase !== 'user' || S.busy) return;
    if (S.game.history().length === 0) return;
    // Annule le dernier coup adverse, puis le tien, pour te rendre la main.
    S.game.undo();
    if (S.game.turn() !== S.userColor && S.game.history().length > 0) S.game.undo();

    S._annot = {};
    S.lastMove = null;
    S.pre = null;
    S.hintSquares = null;
    el.moveBadge.classList.add('hidden');
    el.coachDetail.textContent = '';
    appendHistory(null, null); // reconstruit la liste des coups

    // Si on est retombé sur un trait de l'adversaire (ex. annulation de son
    // coup d'ouverture quand tu as les Noirs), on le laisse rejouer.
    if (S.game.turn() !== S.userColor) {
      coachSay('🦉', 'On repart en arrière, je rejoue.');
      enginePlayFirst();
    } else {
      coachSay('🦉', 'Coup annulé. À toi de rejouer.');
      userTurn();
    }
  }

  function onFlip() {
    S.flipped = !S.flipped;
    render();
    el.evalFill.classList.toggle('flip', S.flipped);
  }

  function updateControls() {
    var playing = S.phase === 'user';
    el.hintBtn.disabled = !playing;
    el.undoBtn.disabled = !(playing && S.game && S.game.history().length > 0);
  }

  // ====================================================================
  //  Fin de partie
  // ====================================================================
  function checkGameEnd() {
    if (S.game && S.game.game_over()) { endGame(); return true; }
    return false;
  }

  function endGame() {
    S.phase = 'over';
    S.busy = false;
    S.selected = null; S.targets = {}; S.hintSquares = null;
    render();
    updateControls();

    var msg, badgeTxt, detail = '';
    if (S.game.in_checkmate()) {
      var loser = S.game.turn();
      var userWon = loser !== S.userColor;
      if (userWon) {
        msg = '🏆 Échec et mat — tu gagnes ! Magnifique.';
        detail = 'Tu as conclu proprement. Rejoue pour enchaîner les progrès.';
      } else {
        msg = 'Échec et mat. L\'adversaire l\'emporte cette fois.';
        detail = 'Pas grave : analyse tes derniers coups, c\'est là qu\'on apprend le plus.';
      }
      badgeTxt = userWon ? '🏆 Victoire' : '✗ Défaite';
    } else if (S.game.in_stalemate()) {
      msg = 'Pat ! Aucun coup légal mais pas d\'échec : partie nulle.';
      detail = 'Le pat sauve souvent une position perdante — souviens-t\'en.';
      badgeTxt = '= Nulle';
    } else if (S.game.in_threefold_repetition()) {
      msg = 'Nulle par répétition de la position.';
      badgeTxt = '= Nulle';
    } else if (S.game.insufficient_material()) {
      msg = 'Nulle : matériel insuffisant pour mater.';
      badgeTxt = '= Nulle';
    } else {
      msg = 'Partie nulle (règle des 50 coups).';
      badgeTxt = '= Nulle';
    }

    coachSay('🦉', msg);
    el.coachDetail.textContent = detail;
    el.moveBadge.textContent = badgeTxt;
    el.moveBadge.style.background = '#b88a4a';
    el.moveBadge.classList.remove('hidden');
    setStatus('over', 'Partie terminée — clique « Nouvelle partie ».');
  }

  function setStatus(cls, text) {
    el.status.className = 'status ' + (cls || '');
    el.status.textContent = text;
  }

  // ====================================================================
  //  Modale de configuration
  // ====================================================================
  function bindSetup() {
    var colorSeg = $('color-seg'), levelSeg = $('level-seg');
    seg(colorSeg, function (v) { S.userColor = v; });
    seg(levelSeg, function (v) { S.level = parseInt(v, 10); });
    // Pré-sélection d'après les préférences.
    preselect(colorSeg, 'color', S.userColor);
    preselect(levelSeg, 'level', String(S.level));
    el.coachToggle.checked = S.coachEnabled;

    $('play-btn').onclick = function () {
      ensureAudio();
      if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
      S.coachEnabled = el.coachToggle.checked;
      savePrefs();
      el.setup.classList.add('hidden');
      startGame();
    };
  }
  function seg(container, cb) {
    container.addEventListener('click', function (e) {
      var b = e.target.closest('.seg-btn');
      if (!b) return;
      Array.prototype.forEach.call(container.children, function (c) { c.classList.remove('active'); });
      b.classList.add('active');
      cb(b.getAttribute('data-color') || b.getAttribute('data-level'));
    });
  }
  function preselect(container, attr, value) {
    Array.prototype.forEach.call(container.children, function (c) {
      var match = (attr === 'color' ? c.getAttribute('data-color') : c.getAttribute('data-level')) === value;
      c.classList.toggle('active', match);
    });
  }

  function openSetup() {
    el.setup.classList.remove('hidden');
  }

  // ====================================================================
  //  Init
  // ====================================================================
  function init() {
    el = {
      board: $('board'), evalFill: $('eval-fill'), evalNum: $('eval-num'),
      capturedBottom: $('captured-bottom'),
      coachAvatar: document.querySelector('.coach-avatar'),
      coachMsg: $('coach-msg'), coachDetail: $('coach-detail'), moveBadge: $('move-badge'),
      status: $('status'), history: $('history'), tip: $('tip'),
      hintBtn: $('hint-btn'), undoBtn: $('undo-btn'), flipBtn: $('flip-btn'),
      setup: $('setup'), promo: $('promo'), promoChoices: $('promo-choices'),
      coachToggle: $('coach-toggle'), soundBtn: $('sound-btn')
    };

    loadPrefs();
    el.tip.textContent = window.ChessCoach.randomTip();
    updateSoundBtn();

    el.board.addEventListener('click', onBoardClick);
    el.hintBtn.addEventListener('click', onHint);
    el.undoBtn.addEventListener('click', onUndo);
    el.flipBtn.addEventListener('click', onFlip);
    $('new-btn').addEventListener('click', openSetup);
    el.soundBtn.addEventListener('click', function () {
      audio.on = !audio.on;
      updateSoundBtn();
      savePrefs();
    });

    bindSetup();
  }
  function updateSoundBtn() {
    el.soundBtn.textContent = audio.on ? '🔊' : '🔇';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
