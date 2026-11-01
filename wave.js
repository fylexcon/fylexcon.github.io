// A particle in superposition drawn across the bottom of the hero: the cyan
// line is Re ψ, the amber area is |ψ|². Pointing at it is a measurement: the
// density collapses onto that x and then spreads back out. Left alone, the
// page measures it itself every few seconds.
(function () {
  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const root = document.documentElement;
      const dark =
        root.dataset.theme === "dark" ||
        (!root.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.dataset.theme = dark ? "light" : "dark";
    });
  }

  const stage = document.querySelector(".stage");
  const canvas = document.getElementById("wave");
  if (!stage || !canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stateEl = document.getElementById("readout-state");
  const xEl = document.getElementById("readout-x");

  const COLOR = {
    wave: "#4fd1c5",
    density: "255, 181, 71",
    measure: "#ff6b8b",
    axis: "rgba(139, 152, 165, 0.45)",
    text: "#0b0f14",
  };

  const X_MIN = -10;
  const X_MAX = 10;
  const N = 360;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;
  let last = performance.now();

  // collapse state
  let c = 0; // 0 = superposition, 1 = collapsed
  let hitX = 0;
  let heldUntil = 0;
  let nextAuto = 2.5;
  let pointerX = null;

  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const gauss = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));

  function envelope(x) {
    // three packets drifting slowly, so the superposition never looks static
    const a = gauss(x, -5 + 1.2 * Math.sin(t * 0.21), 1.5);
    const b = gauss(x, 0.5 + 1.5 * Math.sin(t * 0.17 + 1), 1.2) * 0.8;
    const d = gauss(x, 5.5 + 1.0 * Math.sin(t * 0.13 + 2), 1.4) * 0.9;
    const sup = a + b + d;
    const col = gauss(x, hitX, 0.35) * 1.7;
    return (1 - c) * sup + c * col;
  }

  function toPx(x) {
    return ((x - X_MIN) / (X_MAX - X_MIN)) * w;
  }

  function measure(x, now) {
    hitX = x;
    heldUntil = now + 0.9;
    if (stateEl) {
      stateEl.textContent = "measured";
      stateEl.classList.add("measured");
    }
    if (xEl) xEl.textContent = "x = " + x.toFixed(2);
  }

  function step(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;

    if (pointerX !== null) {
      measure(pointerX, t);
    } else if (t > nextAuto && c < 0.02) {
      // sample the auto measurement from the current density, like a real one
      const xs = [];
      let total = 0;
      for (let i = 0; i < N; i++) {
        const x = X_MIN + ((X_MAX - X_MIN) * i) / (N - 1);
        const p = envelope(x) ** 2;
        total += p;
        xs.push([x, total]);
      }
      const r = Math.random() * total;
      const hit = xs.find(([, cum]) => cum >= r);
      measure(hit ? hit[0] : 0, t);
      nextAuto = t + 6 + Math.random() * 3;
    }

    const target = t < heldUntil ? 1 : 0;
    const speed = target ? 9 : 0.7;
    c += (target - c) * Math.min(1, speed * dt);
    if (c < 0.02 && target === 0 && stateEl && stateEl.classList.contains("measured")) {
      stateEl.textContent = "superposition";
      stateEl.classList.remove("measured");
      if (xEl) xEl.textContent = "";
    }

    draw();
    if (!reduceMotion.matches) requestAnimationFrame(step);
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const narrow = w < 820;
    const base = h * (narrow ? 0.88 : 0.84);
    const amp = h * (narrow ? 0.07 : 0.11);
    const phase = t * 2.2;

    ctx.strokeStyle = COLOR.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, base);
    ctx.lineTo(w, base);
    ctx.stroke();

    const re = new Float32Array(N);
    const rho = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = X_MIN + ((X_MAX - X_MIN) * i) / (N - 1);
      const e = envelope(x);
      re[i] = e * Math.cos(2.4 * x - phase);
      rho[i] = e * e;
    }

    const grad = ctx.createLinearGradient(0, base - amp * 2.6, 0, base);
    grad.addColorStop(0, `rgba(${COLOR.density}, 0.5)`);
    grad.addColorStop(1, `rgba(${COLOR.density}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, base);
    for (let i = 0; i < N; i++) ctx.lineTo((w * i) / (N - 1), base - rho[i] * amp * 0.95);
    ctx.lineTo(w, base);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = COLOR.wave;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const px = (w * i) / (N - 1);
      const py = base - re[i] * amp;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    if (c > 0.35) {
      const px = toPx(hitX);
      ctx.globalAlpha = Math.min(1, (c - 0.35) * 2);
      ctx.strokeStyle = COLOR.measure;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px, base - amp * 3);
      ctx.lineTo(px, base);
      ctx.stroke();
      ctx.setLineDash([]);
      const label = "x = " + hitX.toFixed(2);
      ctx.font = '12px "JetBrains Mono", ui-monospace, monospace';
      const tw = ctx.measureText(label).width + 12;
      const lx = Math.min(px + 8, w - tw - 8);
      ctx.fillStyle = COLOR.measure;
      ctx.fillRect(lx, base - amp * 3, tw, 20);
      ctx.fillStyle = COLOR.text;
      ctx.fillText(label, lx + 6, base - amp * 3 + 14);
      ctx.globalAlpha = 1;
    }
  }

  stage.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    const y = e.clientY - r.top;
    if (y < r.height * 0.55) {
      pointerX = null;
      return;
    }
    pointerX = X_MIN + ((e.clientX - r.left) / r.width) * (X_MAX - X_MIN);
  });
  stage.addEventListener("pointerleave", () => {
    pointerX = null;
  });

  window.addEventListener("resize", () => {
    resize();
    if (reduceMotion.matches) draw();
  });

  resize();
  if (reduceMotion.matches) {
    draw();
  } else {
    requestAnimationFrame(step);
  }
})();
