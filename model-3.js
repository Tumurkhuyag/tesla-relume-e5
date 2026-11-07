// Motion and the mobile menu for model-3.html. The page stays complete without this file.
(() => {
  const root = document.documentElement;
  root.classList.add("js");

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

  /* Springs: damped, unit mass, driven by a single animation frame loop. */
  const SPRING = {
    reveal: [90, 26],
    item: [170, 24],
    sheet: [190, 26],
    figure: [200, 24],
    copy: [110, 26],
  };
  const springs = new Set();
  let springFrame = 0;
  let lastFrame = 0;

  function stepSprings(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.25);
    lastFrame = now;
    for (const s of springs) {
      if (now < s.start) continue;
      for (let t = 0; t < dt; t += 1 / 240) {
        s.velocity += (-s.tension * (s.value - 1) - s.friction * s.velocity) / 240;
        s.value += s.velocity / 240;
      }
      if (Math.abs(s.value - 1) < 0.001 && Math.abs(s.velocity) < 0.001) {
        s.apply(1);
        s.finish();
        springs.delete(s);
      } else {
        s.apply(s.value);
      }
    }
    springFrame = springs.size ? requestAnimationFrame(stepSprings) : 0;
  }

  function animate([tension, friction], delay, apply, finish) {
    const now = performance.now();
    springs.add({ tension, friction, value: 0, velocity: 0, start: now + delay, apply, finish });
    if (!springFrame) {
      lastFrame = now;
      springFrame = requestAnimationFrame(stepSprings);
    }
  }

  function hide(el, distance) {
    el.style.opacity = "0";
    el.style.transform = `translateY(${distance})`;
  }

  function show(el, distance, config, delay) {
    const unit = distance.replace(/[\d.-]/g, "");
    const size = parseFloat(distance);
    animate(
      config,
      delay,
      (x) => {
        el.style.opacity = clamp(x);
        el.style.transform = `translateY(${(1 - x) * size}${unit})`;
      },
      () => {
        el.style.opacity = "";
        el.style.transform = "";
      }
    );
  }

  /* Text reveal. A hidden plain copy stays for assistive tech, the animated copy is aria-hidden. */
  function splitText(el, mode) {
    const copy = document.createElement("span");
    copy.className = "visually-hidden";
    copy.append(...[...el.childNodes].map((node) => node.cloneNode(true)));

    const animated = document.createElement("span");
    animated.setAttribute("aria-hidden", "true");
    animated.append(...el.childNodes);
    el.append(copy, animated);

    const parts = [];
    const walker = document.createTreeWalker(animated, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const node of textNodes) {
      const fragment = document.createDocumentFragment();
      const tokens = mode === "chars" ? [...node.textContent] : node.textContent.split(/(\s+)/);
      for (const token of tokens) {
        if (!token) continue;
        if (/^\s+$/.test(token)) {
          fragment.append(token);
          continue;
        }
        const span = document.createElement("span");
        span.className = "split-word";
        span.textContent = token;
        parts.push(span);
        fragment.append(span);
      }
      node.replaceWith(fragment);
    }
    return parts;
  }

  function setupReveals() {
    if (reduceMotion) return;
    const queue = new Map();

    document.querySelectorAll("[data-words]").forEach((el) => {
      const parts = splitText(el, "words");
      parts.forEach((part) => hide(part, "0.35em"));
      el.classList.add("is-pending");
      queue.set(el, (delay) => {
        parts.forEach((part, i) => show(part, "0.35em", SPRING.reveal, delay + i * 110));
        setTimeout(() => el.classList.remove("is-pending"), delay + parts.length * 110 + 200);
      });
    });

    document.querySelectorAll("[data-chars]").forEach((el) => {
      const parts = splitText(el, "chars");
      parts.forEach((part) => hide(part, "0.3em"));
      queue.set(el, (delay) =>
        parts.forEach((part, i) => show(part, "0.3em", SPRING.figure, delay + i * 24))
      );
    });

    document.querySelectorAll("[data-rise]").forEach((el) => {
      hide(el, "1.25rem");
      const siblings = [...el.parentElement.children].filter((c) => c.hasAttribute("data-rise"));
      const stagger = siblings.indexOf(el) * 90;
      queue.set(el, (delay) => show(el, "1.25rem", SPRING.item, delay + stagger));
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const delay = Number(entry.target.closest("[data-delay]")?.dataset.delay || 0);
          queue.get(entry.target)?.(delay);
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    queue.forEach((_, el) => observer.observe(el));
  }

  /* Burn-away seam between sections of different tone. */
  const SEAM = { cell: 24, solidUntil: 0.16, lift: 2, accentShare: 0.06 };
  const TONE = { light: "#f7fafb", dark: "#0e0f14" };
  const accent = getComputedStyle(root).getPropertyValue("--accent").trim();
  const seams = [];

  function noise(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function setupSeams() {
    if (reduceMotion) return;
    const toned = [...document.querySelectorAll("[data-tone]")];
    toned.forEach((section, i) => {
      const previous = toned[i - 1];
      if (!previous || previous.dataset.tone === section.dataset.tone) return;
      const canvas = document.createElement("canvas");
      canvas.className = "seam";
      canvas.setAttribute("aria-hidden", "true");
      section.prepend(canvas);
      seams.push({ section, canvas, color: TONE[previous.dataset.tone], drawn: -1 });
    });
  }

  function drawSeam(seam, viewport) {
    const top = seam.section.getBoundingClientRect().top;
    const progress = clamp((viewport - top) / viewport);
    if (top > viewport || progress === seam.drawn) return;
    seam.drawn = progress;
    const { canvas } = seam;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    const columns = Math.ceil(width / SEAM.cell);
    const rows = Math.ceil(height / SEAM.cell);
    for (let y = 0; y < rows; y++) {
      const depth = y / (rows - 1) + progress * SEAM.lift;
      if (depth >= 1) break;
      const solid = depth <= SEAM.solidUntil;
      const fade = 1 - (depth - SEAM.solidUntil) / (1 - SEAM.solidUntil);
      for (let x = 0; x < columns; x++) {
        if (!solid && ((x + y) % 2 !== 0 || noise(x, y) > fade)) continue;
        ctx.fillStyle = !solid && noise(x + 7, y + 13) < SEAM.accentShare ? accent : seam.color;
        ctx.fillRect(x * SEAM.cell, y * SEAM.cell, SEAM.cell, SEAM.cell);
      }
    }
  }

  /* Sticky stack. Tall sections stick by their bottom edge so all their content stays reachable. */
  const stack = [];

  function setupStack() {
    if (reduceMotion) return;
    document.querySelectorAll("[data-stack]").forEach((section) => {
      const shade = document.createElement("div");
      shade.className = "stack-shade";
      shade.setAttribute("aria-hidden", "true");
      section.append(shade);
      section.style.position = "sticky";
      stack.push({
        section,
        shade,
        inner: section.querySelector(":scope > .stack-inner"),
        next: section.nextElementSibling,
      });
    });
  }

  function measureStack() {
    for (const item of stack) {
      item.section.style.top = `${Math.min(0, innerHeight - item.section.offsetHeight)}px`;
    }
  }

  function updateStack(viewport) {
    const scaleAllowed = innerWidth >= 768;
    for (const { section, shade, inner, next } of stack) {
      const top = next.getBoundingClientRect().top;
      const progress = clamp(1 - top / viewport);
      shade.style.opacity = progress * 0.55;
      section.style.visibility = top <= 0 ? "hidden" : "";
      if (inner && scaleAllowed) {
        inner.style.transform = progress > 0 ? `scale(${1 - progress * 0.1})` : "";
      }
    }
  }

  /* Rail timeline and plate parallax. */
  const rail = document.querySelector(".rail");
  const plates = [...document.querySelectorAll(".plate__frame img")];

  function updateRail(viewport) {
    if (!rail || reduceMotion) return;
    const box = rail.getBoundingClientRect();
    rail.style.setProperty("--progress", clamp((viewport * 0.6 - box.top) / box.height).toFixed(4));
  }

  function updateParallax(viewport) {
    if (reduceMotion) return;
    for (const img of plates) {
      const box = img.parentElement.getBoundingClientRect();
      if (box.bottom < 0 || box.top > viewport) continue;
      const offset = (box.top + box.height / 2 - viewport / 2) / viewport;
      img.style.setProperty("--parallax", `${(offset * -box.height * 0.08).toFixed(1)}px`);
    }
  }

  /* Contour lines via marching squares, painted only while visible. */
  const CONTOUR = { columns: 96, lineCount: 2.5, waveAmount: 0.37, waveSpeed: 1.66, interval: 24 };

  function setupContours() {
    document.querySelectorAll("[data-contour]").forEach((host) => {
      const canvas = document.createElement("canvas");
      canvas.className = "contour";
      canvas.setAttribute("aria-hidden", "true");
      host.prepend(canvas);
      const ctx = canvas.getContext("2d");
      const stroke = host.dataset.contour;
      let visible = false;
      let last = 0;

      const paint = (now) => {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        const cols = CONTOUR.columns;
        const cell = width / cols;
        const rows = Math.ceil(height / cell);
        const t = (now / 1000) * CONTOUR.waveSpeed * 0.12;
        const field = new Float32Array((cols + 1) * (rows + 1));
        for (let y = 0; y <= rows; y++) {
          for (let x = 0; x <= cols; x++) {
            const u = (x / cols) * 6;
            const v = (y / cols) * 6;
            field[y * (cols + 1) + x] =
              (Math.sin(u + t) * Math.cos(v - t * 0.7) +
                CONTOUR.waveAmount * Math.sin((u + v) * 1.7 + t * 0.5)) *
              CONTOUR.lineCount;
          }
        }
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const edge = (ax, ay, a, bx, by, b, level) => {
          const k = (level - a) / (b - a);
          return [(ax + (bx - ax) * k) * cell, (ay + (by - ay) * k) * cell];
        };
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const i = y * (cols + 1) + x;
            const a = field[i];
            const b = field[i + 1];
            const c = field[i + cols + 2];
            const d = field[i + cols + 1];
            const low = Math.ceil(Math.min(a, b, c, d));
            const high = Math.floor(Math.max(a, b, c, d));
            for (let level = low; level <= high; level++) {
              const hits = [];
              if (a < level !== b < level) hits.push(edge(x, y, a, x + 1, y, b, level));
              if (b < level !== c < level) hits.push(edge(x + 1, y, b, x + 1, y + 1, c, level));
              if (c < level !== d < level) hits.push(edge(x + 1, y + 1, c, x, y + 1, d, level));
              if (d < level !== a < level) hits.push(edge(x, y + 1, d, x, y, a, level));
              for (let h = 0; h + 1 < hits.length; h += 2) {
                ctx.moveTo(...hits[h]);
                ctx.lineTo(...hits[h + 1]);
              }
            }
          }
        }
        ctx.stroke();
      };

      const loop = (now) => {
        if (!visible) return;
        if (now - last >= CONTOUR.interval) {
          last = now;
          paint(now);
        }
        requestAnimationFrame(loop);
      };

      if (reduceMotion) {
        paint(0);
        return;
      }
      new IntersectionObserver(([entry]) => {
        const wasVisible = visible;
        visible = entry.isIntersecting;
        if (visible && !wasVisible) requestAnimationFrame(loop);
      }).observe(host);
    });
  }

  /* Full-screen menu. */
  function setupMenu() {
    const burger = document.querySelector(".burger");
    const sheet = document.getElementById("menu");
    if (!burger || !sheet) return;
    const close = sheet.querySelector(".sheet__close");
    const links = [...sheet.querySelectorAll("a")];

    const closeMenu = () => {
      sheet.hidden = true;
      root.style.overflow = "";
      burger.setAttribute("aria-expanded", "false");
      burger.focus();
    };

    burger.addEventListener("click", () => {
      sheet.hidden = false;
      root.style.overflow = "hidden";
      burger.setAttribute("aria-expanded", "true");
      close.focus();
      if (reduceMotion) return;
      links.forEach((link, i) => {
        hide(link, "0.75rem");
        show(link, "0.75rem", SPRING.sheet, 120 + i * 55);
      });
    });

    close.addEventListener("click", closeMenu);
    links.forEach((link) => link.addEventListener("click", closeMenu));

    sheet.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
      if (event.key !== "Tab") return;
      const focusable = [close, ...links];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  /* Scroll-linked work shares one frame. */
  let scheduled = false;

  function update() {
    scheduled = false;
    const viewport = innerHeight;
    seams.forEach((seam) => drawSeam(seam, viewport));
    updateStack(viewport);
    updateRail(viewport);
    updateParallax(viewport);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }

  setupMenu();
  setupReveals();
  setupSeams();
  setupStack();
  setupContours();
  measureStack();
  update();
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", () => {
    measureStack();
    schedule();
  });
  addEventListener("load", () => {
    measureStack();
    schedule();
  });
})();
