/* ════════════════════════════════════════════════════════════════
   Nos 4 ans — logique de la page
   Vanilla JS, zéro dépendance. Lit le contenu depuis config.js.
   ════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const C = window.SITE || {};
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);

  /* ── 1. Remplissage du contenu textuel ───────────────────────── */
  function fillText() {
    $("heroNames").textContent = `${C.toi || "Toi"} & ${C.moi || "Moi"}`;
    $("heroSubtitle").textContent = C.sousTitre || "";
    document.title = C.titre || document.title;

    // Titre lettre par lettre, pour l'animation d'arrivée
    const title = C.titre || "Nos 4 ans";
    const host = $("heroTitle");
    host.setAttribute("aria-label", title);
    [...title].forEach((ch, i) => {
      const span = document.createElement("span");
      span.className = "char";
      span.textContent = ch === " " ? " " : ch;
      span.setAttribute("aria-hidden", "true");
      span.style.animationDelay = `${0.3 + i * 0.06}s`;
      host.appendChild(span);
    });
  }

  /* ── 2. Frise des souvenirs ──────────────────────────────────── */
  function buildTimeline() {
    const list = $("timelineList");
    (C.souvenirs || []).forEach((s) => {
      const item = document.createElement("div");
      item.className = "tl-item";
      item.setAttribute("data-reveal", "");
      item.innerHTML = `
        <p class="tl-date">${esc(s.date)}</p>
        <h3 class="tl-title"><span class="tl-emoji">${esc(s.emoji || "")}</span>${esc(s.titre)}</h3>
        <p class="tl-text">${esc(s.texte)}</p>`;
      list.appendChild(item);
    });
  }

  /* ── 3. La lettre ────────────────────────────────────────────── */
  function buildLetter() {
    const body = $("letterBody");
    (C.lettre || []).forEach((p) => {
      const para = document.createElement("p");
      para.textContent = p;
      body.appendChild(para);
    });
    $("letterSign").textContent = C.signature || "";
  }

  /* ── 4. Compteur du temps partagé ────────────────────────────── */
  function startCounter() {
    const d = C.debut || {};
    const start = new Date(
      d.annee || 2022,
      (d.mois || 1) - 1,
      d.jour || 1,
      d.heure || 0,
      d.minute || 0
    );
    const pad = (n) => String(n).padStart(2, "0");

    function tick() {
      let ms = Date.now() - start.getTime();
      if (ms < 0) ms = 0;
      const sec = Math.floor(ms / 1000);
      $("cDays").textContent = Math.floor(sec / 86400).toLocaleString("fr-FR");
      $("cHours").textContent = pad(Math.floor((sec % 86400) / 3600));
      $("cMin").textContent = pad(Math.floor((sec % 3600) / 60));
      $("cSec").textContent = pad(sec % 60);
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ── 5. Raisons qui défilent ─────────────────────────────────── */
  function startReasons() {
    const reasons = C.raisons || [];
    if (!reasons.length) return;
    const text = $("reasonText");
    const dotsHost = $("reasonDots");
    let i = 0;

    reasons.forEach(() => dotsHost.appendChild(document.createElement("i")));
    const dots = [...dotsHost.children];

    function show(n) {
      text.textContent = reasons[n];
      dots.forEach((dot, k) => dot.classList.toggle("on", k === n));
    }
    show(0);

    if (reduced || reasons.length === 1) return;
    setInterval(() => {
      text.classList.add("swap");
      setTimeout(() => {
        i = (i + 1) % reasons.length;
        show(i);
        text.classList.remove("swap");
      }, 500);
    }, 3800);
  }

  /* ── 6. Révélation au scroll + barre de progression ──────────── */
  function setupScroll() {
    const els = document.querySelectorAll("[data-reveal]");
    if ("IntersectionObserver" in window && !reduced) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("is-visible");
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.15 }
      );
      els.forEach((el) => io.observe(el));
    } else {
      els.forEach((el) => el.classList.add("is-visible"));
    }

    const bar = $("progressBar");
    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const h = document.documentElement.scrollHeight - window.innerHeight;
          bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + "%";
          ticking = false;
        });
      },
      { passive: true }
    );
  }

  /* ── 7. Bouton cœur → pluie de cœurs ─────────────────────────── */
  function setupHeart() {
    const btn = $("heartBtn");
    if (!btn) return;
    const glyphs = ["❤️", "💖", "💕", "💗", "🌹", "✨"];
    btn.addEventListener("click", () => {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const n = reduced ? 1 : 14;
      for (let k = 0; k < n; k++) {
        const el = document.createElement("span");
        el.className = "flyheart";
        el.textContent = glyphs[(Math.random() * glyphs.length) | 0];
        el.style.left = cx + (Math.random() - 0.5) * 80 + "px";
        el.style.top = cy + "px";
        el.style.setProperty("--r", (Math.random() - 0.5) * 80 + "deg");
        el.style.animationDelay = Math.random() * 0.3 + "s";
        el.style.fontSize = 1 + Math.random() * 1.4 + "rem";
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
      }
    });
  }

  /* ── 8. Pétales en fond (canvas léger) ───────────────────────── */
  function setupPetals() {
    const canvas = $("petals");
    if (!canvas || reduced) return;
    const ctx = canvas.getContext("2d");
    let w, h, petals;
    const COUNT = Math.min(
      36,
      Math.max(14, Math.round((window.innerWidth * window.innerHeight) / 45000))
    );

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    function make() {
      return {
        x: Math.random() * w,
        y: Math.random() * h - h,
        r: 3 + Math.random() * 5,
        sp: 0.4 + Math.random() * 0.9,
        sway: Math.random() * Math.PI * 2,
        swSp: 0.01 + Math.random() * 0.02,
        op: 0.25 + Math.random() * 0.4,
        hue: 335 + Math.random() * 25,
      };
    }
    function init() {
      resize();
      petals = Array.from({ length: COUNT }, make);
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const p of petals) {
        p.y += p.sp;
        p.sway += p.swSp;
        p.x += Math.sin(p.sway) * 0.6;
        if (p.y > h + 10) {
          p.y = -10;
          p.x = Math.random() * w;
        }
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r, p.r * 0.6, p.sway, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 75%, ${p.op})`;
        ctx.fill();
      }
      requestAnimationFrame(draw);
    }
    init();
    draw();
    let t;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(init, 200);
    });
  }

  /* ── Petit utilitaire anti-injection ─────────────────────────── */
  function esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);
  }

  /* ── Démarrage ───────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", () => {
    fillText();
    buildTimeline();
    buildLetter();
    startCounter();
    startReasons();
    setupScroll();
    setupHeart();
    setupPetals();
  });
})();
