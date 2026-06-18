# Nos 4 ans 💕

Un petit site web romantique, élégant et interactif pour célébrer quatre années
d'amour. Aucune dépendance, aucun serveur compliqué : c'est du HTML, du CSS et
du JavaScript pur, qui s'ouvre dans n'importe quel navigateur.

## Ce qu'il contient

- **Une intro animée** avec le titre qui apparaît lettre par lettre.
- **Un compteur en direct** des jours, heures, minutes et secondes passés ensemble.
- **Une frise des souvenirs** qui se révèle au défilement.
- **Les raisons** qui défilent une à une, comme un petit poème.
- **Une lettre** présentée comme sur un beau papier.
- **Un bouton cœur** qui fait pleuvoir des cœurs. ❤️
- Des **pétales** qui tombent doucement en fond.

Le tout est responsive (beau sur téléphone comme sur ordinateur) et respecte le
réglage « réduire les animations » pour le confort de chacun.

## Comment le personnaliser

Tout se passe dans **`config.js`**. Ouvre ce fichier et modifie le texte entre
les guillemets : les prénoms, la date du début de votre histoire, les souvenirs,
les raisons et la lettre. Pas besoin de toucher au reste.

```js
window.SITE = {
  toi: "Son prénom",
  moi: "Ton prénom",
  debut: { annee: 2022, mois: 6, jour: 18, heure: 20, minute: 0 },
  // ...
};
```

## Comment le voir

Le plus simple : **double-clique sur `index.html`**, il s'ouvre dans ton
navigateur.

Pour un rendu identique en local à celui d'un hébergement, tu peux aussi lancer
un petit serveur :

```bash
python3 -m http.server 8000
# puis ouvre http://localhost:8000
```

## Comment le mettre en ligne (pour lui envoyer le lien)

C'est un site statique : il fonctionne tel quel sur n'importe quel hébergement
gratuit.

- **GitHub Pages** : pousse le dépôt, puis active Pages dans les réglages.
- **Netlify / Vercel** : glisse-dépose le dossier, c'est en ligne en 30 secondes.

## Structure

```
nos-4-ans/
├── index.html   ← la page
├── styles.css   ← le style
├── script.js    ← les animations et la logique
├── config.js    ← TON contenu (à personnaliser)
└── README.md
```

Fait avec amour. 🌹
