# ♟ Échecs Coach

Une petite application web pour **jouer aux échecs et progresser** : tu joues
contre un moteur, et un entraîneur t'explique en français, à chaque coup, si
c'était bon, pourquoi, et quel était le meilleur coup.

Pensée pour les joueurs qui aiment les échecs mais veulent s'améliorer sans se
plonger dans une analyse austère. Tout tourne **hors-ligne, dans le navigateur**,
sans installation ni serveur.

## ✨ Ce que ça fait

- **Tu joues, le coach commente.** Après chacun de tes coups, un message clair
  le classe (Meilleur coup ✓ / Bon coup / Imprécision ?! / Erreur ? / Gaffe ??)
  et explique l'idée : pièce en prise, meilleur coup disponible, capture, échec…
- **Barre d'évaluation** en direct, pour visualiser qui est mieux.
- **Indices à deux niveaux** : d'abord la pièce à jouer, puis le coup complet si
  tu veux.
- **Détection des gaffes** : si tu laisses une pièce en prise ou si tu rates un
  mat, le coach te le dit.
- **Reconnaissance d'ouvertures** (sicilienne, italienne, espagnole, française…)
  pour apprendre leurs noms en jouant.
- **Conseils de principe** qui défilent (développement, centre, roque…).
- **Trois niveaux** d'adversaire : Débutant, Intermédiaire, Avancé.
- **Annuler**, **tourner l'échiquier**, **sons** discrets, choix de la couleur,
  promotion, roque, en passant — les règles complètes.

## 🚀 Lancer l'app

Aucune dépendance à installer. Deux options :

1. **Le plus simple** : ouvre `index.html` directement dans ton navigateur
   (double-clic). Tout est embarqué.
2. **Avec un petit serveur** (recommandé si ton navigateur est strict sur les
   fichiers locaux) :
   ```bash
   python3 -m http.server 8000
   # puis ouvre http://localhost:8000
   ```

## 📱 Mettre en ligne pour le téléphone

L'app est une PWA (installable, fonctionne hors-ligne). Pour y accéder depuis
ton téléphone, publie-la sur **GitHub Pages** (gratuit, dépôt public). Activation
en une fois (GitHub n'autorise pas un robot à activer Pages la première fois) :

1. Ouvre le dépôt sur GitHub → **Settings** → **Pages**.
2. Sous **Build and deployment** → **Source** : choisis **Deploy from a branch**.
3. **Branch** : `claude/new-project-brainstorm-y6y92y`, dossier `/ (root)` → **Save**.
4. Attends ~1 minute. L'URL apparaît :
   `https://paulin-vergezdeheine.github.io/nos-4-ans/`

Sur le téléphone, ouvre cette URL puis **Ajouter à l'écran d'accueil**
(menu Partager sur iPhone, menu ⋮ sur Android) : l'app s'installe comme une vraie
appli et marche ensuite même sans réseau.

## 🧠 Comment ça marche

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page |
| `style.css` | Mise en forme (échiquier, panneau, modales) |
| `vendor/chess.js` | Règles officielles du jeu ([chess.js](https://github.com/jhlywa/chess.js), MIT) — coups légaux, échec/mat, nulles, FEN |
| `engine.js` | Moteur maison : recherche **alpha-bêta** + **quiescence** + évaluation (matériel + tables position/pièce). Sert d'adversaire **et** de cerveau au coach |
| `coach.js` | Transforme les évaluations en conseils français : classification des coups, détection des gaffes, livre d'ouvertures |
| `app.js` | Interface : rendu de l'échiquier, interactions, barre d'éval, orchestration |

Le moteur évalue chaque position en centièmes de pion. Pour juger un de tes
coups, il compare l'évaluation **avant** (en supposant le meilleur coup) et
**après** ton coup : l'écart donne la « perte » qui détermine la classification.
La recherche est bornée en temps pour ne jamais figer l'interface durablement.

> Note : le moteur est volontairement simple (pas de Stockfish), ce qui garde
> l'app 100 % autonome et légère. Il est largement assez fort pour battre un
> débutant et repérer les fautes courantes, mais ses conseils restent ceux d'un
> entraîneur de club, pas d'un super-ordinateur.

## ✅ Tests

Les fichiers JS sont écrits comme des scripts « classiques », ce qui permet de
les tester sous Node via un faux contexte navigateur.

```bash
npm test            # logique moteur/coach + intégration DOM simulée
npm run test:game   # simule une partie complète (stress des timeouts, ~1 min)
```

- `test/smoke.js` : règles, recherche, classification, ouvertures, mat en 1.
- `test/dom.js` : démarre une partie et joue un coup dans un DOM simulé.
- `test/game.js` : 80 demi-coups, vérifie l'intégrité de l'état à chaque coup.

## 🛣️ Idées d'évolution

- Flèches de menace et surbrillance des cases attaquées.
- Mini-leçons sur les motifs tactiques (fourchette, clouage, enfilade).
- Sauvegarde et reprise de partie, export PGN.
- Mode « puzzle » à partir de tes propres gaffes.
