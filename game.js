(() => {
  "use strict";

  // ---------- Config ----------
  const MAX_POINTS = 5000;
  const PERFECT_MILES = 5;
  const FALLOFF_MILES = 300;
  const HINT_MULTIPLIER = 0.5;
  const TIMER_SECONDS = 30;
  const MODES = {
    classic: { rounds: 10, label: "Classic" },
    daily: { rounds: 5, label: "Daily" },
    endless: { rounds: Infinity, label: "Endless" },
  };

  const STATE_NAMES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
    CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
    LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
    MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
    NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
    OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
    SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
    WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  };

  // ---------- Storage (best-effort) ----------
  const store = {
    get(key, fallback = null) {
      try { const v = localStorage.getItem("zipdrop." + key); return v === null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem("zipdrop." + key, JSON.stringify(value)); } catch { /* ignore */ }
    },
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    map: $("map"),
    hud: $("hud"), hudRound: $("hud-round"), hudScore: $("hud-score"),
    hudTimerWrap: $("hud-timer-wrap"), hudTimer: $("hud-timer"),
    quit: $("btn-quit"),
    zipCard: $("zip-card"), zipDigits: $("zip-digits"), zipHint: $("zip-hint"),
    result: $("result"), resultPoints: $("result-points"), resultPlace: $("result-place"),
    resultDist: $("result-dist"), resultMeter: $("result-meter"),
    toast: $("toast"),
    actions: $("actions"), hint: $("btn-hint"), guess: $("btn-guess"), next: $("btn-next"), end: $("btn-end"),
    menu: $("menu"), menuZip: $("menu-zip"), loading: $("loading"), optTimer: $("opt-timer"),
    summary: $("summary"), sumRank: $("sum-rank"), sumTotal: $("sum-total"), sumMax: $("sum-max"),
    sumSub: $("sum-sub"), sumRounds: $("sum-rounds"),
    share: $("btn-share"), viewMap: $("btn-view-map"), again: $("btn-again"), toMenu: $("btn-menu"),
  };

  // ---------- Map setup ----------
  const US_BOUNDS = L.latLngBounds([24.4, -125.0], [49.5, -66.9]);
  const REGIONS = {
    lower48: US_BOUNDS,
    alaska: L.latLngBounds([51.0, -170.0], [71.5, -129.9]),
    hawaii: L.latLngBounds([18.8, -160.4], [22.3, -154.7]),
  };

  const map = L.map(el.map, {
    zoomControl: false,
    doubleClickZoom: false,
    minZoom: 3,
    maxZoom: 18,
    zoomSnap: 0.25,
    worldCopyJump: true,
    maxBounds: [[0, -200], [80, -40]],
    maxBoundsViscosity: 0.7,
  });
  map.fitBounds(US_BOUNDS);

  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  const esri = (service, extra = {}) => L.tileLayer(`${ESRI}${service}/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 18, maxZoom: 18, ...extra });
  const ESRI_ATTR = 'Imagery &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics';
  const BASEMAPS = {
    hybrid: () => L.layerGroup([
      esri("World_Imagery", { attribution: ESRI_ATTR }),
      esri("Reference/World_Transportation", { opacity: 0.7 }),
      esri("Reference/World_Boundaries_and_Places"),
    ]),
    satellite: () => esri("World_Imagery", { attribution: ESRI_ATTR }),
    streets: () => esri("World_Street_Map", {
      attribution: 'Map &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, HERE, Garmin, USGS, NGA',
    }),
  };
  let basemap = null;
  function setBasemap(name) {
    if (!BASEMAPS[name]) name = "hybrid";
    if (basemap) map.removeLayer(basemap);
    basemap = BASEMAPS[name]().addTo(map);
    document.querySelectorAll("#basemap-ctrl button").forEach((b) => b.classList.toggle("active", b.dataset.layer === name));
    store.set("basemap", name);
  }
  document.querySelectorAll("#basemap-ctrl button").forEach((b) => { b.onclick = () => setBasemap(b.dataset.layer); });
  document.querySelectorAll("#region-ctrl button").forEach((b) => {
    b.onclick = () => flyToBounds(REGIONS[b.dataset.region], { duration: 0.8 });
  });

  setBasemap(store.get("basemap", "hybrid"));

  const overlay = L.layerGroup().addTo(map);

  // Keep Leaflet's idea of the container size current (layout changes, hidden tabs).
  if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize()).observe(el.map);

  // Leaflet's fly animation divides by the container size, so a map that was laid out
  // at 0×0 (e.g. loaded in a background tab) breaks it. Re-measure first, and jump
  // without animating when there is still no size or the current view is invalid.
  function canAnimate() {
    map.invalidateSize(false);
    const s = map.getSize();
    return s.x > 0 && s.y > 0 && Number.isFinite(map.getZoom());
  }
  function flyToBounds(bounds, opts) {
    if (canAnimate()) map.flyToBounds(bounds, opts);
    else map.fitBounds(bounds, { ...opts, animate: false });
  }

  $("zoom-in").onclick = () => map.zoomIn(1);
  $("zoom-out").onclick = () => map.zoomOut(1);
  $("zoom-reset").onclick = () => resetView();

  function resetView(animate = true) {
    if (animate) flyToBounds(US_BOUNDS, { duration: 0.6 });
    else { map.invalidateSize(false); map.fitBounds(US_BOUNDS, { animate: false }); }
  }

  // points are [lon, lat]. Leave room at the top for the result card.
  function fitPoints(points) {
    const latlngs = points.map(([lon, lat]) => [lat, lon]);
    if (latlngs.length === 1) {
      if (canAnimate()) map.flyTo(latlngs[0], 7, { duration: 0.9 });
      else map.setView(latlngs[0], 7, { animate: false });
      return;
    }
    flyToBounds(L.latLngBounds(latlngs), {
      paddingTopLeft: [70, 180], paddingBottomRight: [70, 50], maxZoom: 11, duration: 0.9,
    });
  }

  // ---------- Data ----------
  let zips = [];          // [zip, city, st, county, lat, lon]
  let stateFeatures = {}; // name -> GeoJSON feature

  async function loadData() {
    const [topo, text] = await Promise.all([
      fetch("data/states-10m.json").then((r) => { if (!r.ok) throw new Error("map"); return r.json(); }),
      fetch("data/zips.txt").then((r) => { if (!r.ok) throw new Error("zips"); return r.text(); }),
    ]);

    topojson.feature(topo, topo.objects.states).features
      .forEach((f) => { stateFeatures[f.properties.name] = f; });

    zips = text.split("\n").map((line) => {
      const [z, city, st, county, lat, lon] = line.split("|");
      return [z, city, st, county, +lat, +lon];
    });
  }

  // ---------- Helpers ----------
  const fmt = (n) => Math.round(n).toLocaleString("en-US");

  function haversineMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function scoreFor(miles) {
    if (miles <= PERFECT_MILES) return MAX_POINTS;
    return Math.round(MAX_POINTS * Math.exp(-(miles - PERFECT_MILES) / FALLOFF_MILES));
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function emojiFor(points) {
    if (points >= 4500) return "🟩";
    if (points >= 2500) return "🟨";
    if (points >= 1000) return "🟧";
    return "🟥";
  }

  function rankFor(pct) {
    if (pct >= 0.9) return "Postmaster General";
    if (pct >= 0.75) return "Route Expert";
    if (pct >= 0.55) return "Mail Carrier";
    if (pct >= 0.35) return "Sorting Clerk";
    return "Return to Sender";
  }

  let toastTimer;
  function toast(msg, ms = 1800) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
  }

  // ---------- Markers ----------
  const PIN_SVG = '<svg viewBox="-9 -26 18 27" width="26" height="39"><path d="M0,0 C-1.5,-5 -8,-9.5 -8,-16 A8,8 0 1,1 8,-16 C8,-9.5 1.5,-5 0,0Z"/><circle cy="-16" r="3"/></svg>';

  function drawGuessPin([lon, lat]) {
    L.marker([lat, lon], {
      interactive: false, keyboard: false,
      icon: L.divIcon({ className: "pin-guess", html: `<div class="drop">${PIN_SVG}</div>`, iconSize: [26, 39], iconAnchor: [13, 38] }),
    }).addTo(overlay);
  }

  function drawActual([lon, lat], label, pulse = true) {
    const html = `${pulse ? '<span class="ring"></span>' : ""}<span class="dot"></span>` +
      (label ? `<span class="pin-label">${label}</span>` : "");
    L.marker([lat, lon], {
      interactive: false, keyboard: false, zIndexOffset: 500,
      icon: L.divIcon({ className: "pin-actual", html, iconSize: [16, 16], iconAnchor: [8, 8] }),
    }).addTo(overlay);
  }

  function drawLine([lon1, lat1], [lon2, lat2], cls = "guess-line animate") {
    L.polyline([[lat1, lon1], [lat2, lon2]], { className: cls, interactive: false }).addTo(overlay);
  }

  function highlightState(name) {
    const f = stateFeatures[name];
    if (f) L.geoJSON(f, { className: "state-target", interactive: false }).addTo(overlay);
  }

  function clearMap() {
    overlay.clearLayers();
  }

  // ---------- Game state ----------
  const game = {
    mode: "classic",
    rounds: [],     // { zip, guess, miles, points, hinted, timedOut }
    queue: [],
    index: 0,
    phase: "menu",  // menu | guessing | result | summary | review
    pin: null,      // { xy, lonlat }
    hinted: false,
    timer: null,
    timeLeft: 0,
  };

  function pickZips(mode) {
    if (mode === "daily") {
      const key = todayKey();
      const rng = mulberry32(+key.replace(/-/g, "") * 2654435761);
      const out = [];
      const seen = new Set();
      while (out.length < MODES.daily.rounds) {
        const z = zips[Math.floor(rng() * zips.length)];
        if (!seen.has(z[0])) { seen.add(z[0]); out.push(z); }
      }
      return out;
    }
    return [];
  }

  function randomZip() {
    const used = new Set(game.rounds.map((r) => r.zip[0]));
    let z;
    do { z = zips[Math.floor(Math.random() * zips.length)]; } while (used.has(z[0]));
    return z;
  }

  function startGame(mode) {
    game.mode = mode;
    game.rounds = [];
    game.queue = pickZips(mode);
    game.index = 0;
    el.menu.hidden = true;
    el.summary.hidden = true;
    el.hud.hidden = false;
    el.quit.hidden = false;
    el.actions.hidden = false;
    el.hudTimerWrap.hidden = !el.optTimer.checked;
    stopMenuTicker();
    startRound();
  }

  function currentZip() { return game.queue[game.index]; }

  function startRound() {
    if (!game.queue[game.index]) game.queue[game.index] = randomZip();
    const z = currentZip();
    game.phase = "guessing";
    game.pin = null;
    game.hinted = false;
    clearMap();
    resetView();
    el.map.classList.add("guessing");

    el.result.hidden = true;
    el.zipCard.hidden = false;
    el.zipHint.textContent = "";
    el.zipDigits.innerHTML = "";
    [...z[0]].forEach((d, i) => {
      const s = document.createElement("span");
      s.textContent = d;
      s.style.animationDelay = `${i * 60}ms`;
      el.zipDigits.appendChild(s);
    });

    el.hint.hidden = false;
    el.hint.disabled = false;
    el.guess.hidden = false;
    el.guess.disabled = true;
    el.guess.textContent = "Drop a pin on the map";
    el.next.hidden = true;
    el.end.hidden = game.mode !== "endless" || game.rounds.length === 0;
    updateHud();
    startTimer();
  }

  function updateHud() {
    const total = MODES[game.mode].rounds;
    el.hudRound.textContent = total === Infinity ? `${game.index + 1}` : `${game.index + 1}/${total}`;
    el.hudScore.textContent = fmt(game.rounds.reduce((s, r) => s + r.points, 0));
  }

  // ---------- Timer ----------
  function startTimer() {
    stopTimer();
    if (!el.optTimer.checked) return;
    game.timeLeft = TIMER_SECONDS;
    renderTimer();
    game.timer = setInterval(() => {
      game.timeLeft -= 1;
      renderTimer();
      if (game.timeLeft <= 0) {
        stopTimer();
        submitGuess(true);
      }
    }, 1000);
  }
  function stopTimer() { clearInterval(game.timer); game.timer = null; }
  function renderTimer() {
    el.hudTimer.textContent = Math.max(0, game.timeLeft);
    el.hudTimer.classList.toggle("warn", game.timeLeft <= 5);
  }

  // ---------- Input ----------
  map.on("click", (ev) => {
    if (game.phase !== "guessing") return;
    const { lat, lng } = ev.latlng.wrap();
    const lonlat = [lng, lat];
    game.pin = { lonlat };
    clearMap();
    drawGuessPin(lonlat);
    el.guess.disabled = false;
    el.guess.innerHTML = "Guess <kbd>Enter</kbd>";
  });

  el.guess.onclick = () => submitGuess(false);
  el.next.onclick = () => nextRound();
  el.end.onclick = () => showSummary();
  el.hint.onclick = () => {
    if (game.phase !== "guessing" || game.hinted) return;
    game.hinted = true;
    el.zipHint.textContent = `Hint: ${STATE_NAMES[currentZip()[2]]}`;
    el.hint.disabled = true;
  };
  el.quit.onclick = () => {
    if ((game.phase === "guessing" || game.phase === "result") && game.rounds.length > 0 &&
        !confirm("Quit this run? Your progress will be lost.")) return;
    showMenu();
  };

  document.addEventListener("keydown", (ev) => {
    if (ev.target.closest && ev.target.closest("input, textarea")) return;
    if (ev.key === "Enter" || ev.key === " ") {
      if (game.phase === "guessing" && game.pin) { ev.preventDefault(); submitGuess(false); }
      else if (game.phase === "result") { ev.preventDefault(); nextRound(); }
      else if (game.phase === "review") { ev.preventDefault(); backToSummary(); }
    } else if (ev.key.toLowerCase() === "h" && game.phase === "guessing") {
      el.hint.click();
    }
  });

  // ---------- Rounds ----------
  function submitGuess(timedOut) {
    if (game.phase !== "guessing") return;
    if (!game.pin && !timedOut) return;
    stopTimer();
    game.phase = "result";
    el.map.classList.remove("guessing");

    const z = currentZip();
    const actual = [z[5], z[4]];
    let miles = null, points = 0;
    if (game.pin) {
      miles = haversineMiles(game.pin.lonlat[1], game.pin.lonlat[0], z[4], z[5]);
      points = scoreFor(miles);
      if (game.hinted) points = Math.round(points * HINT_MULTIPLIER);
    }
    game.rounds.push({ zip: z, guess: game.pin, miles, points, hinted: game.hinted, timedOut: timedOut && !game.pin });

    // Draw
    highlightState(STATE_NAMES[z[2]]);
    if (game.pin) drawLine(game.pin.lonlat, actual);
    if (game.pin) drawGuessPin(game.pin.lonlat);
    drawActual(actual, z[0]);
    fitPoints(game.pin ? [game.pin.lonlat, actual] : [actual]);

    // Result card
    el.zipCard.hidden = true;
    el.result.hidden = false;
    el.result.style.animation = "none"; void el.result.offsetWidth; el.result.style.animation = "";
    el.resultPoints.className = "result-points" + (points >= 3500 ? "" : points >= 1200 ? " mid" : " low");
    countUp(el.resultPoints, points, (n) => `+${fmt(n)}`);
    el.resultPlace.textContent = `${z[1]}, ${z[2]} ${z[0]}`;
    el.resultDist.textContent = game.pin
      ? `${miles < 10 ? miles.toFixed(1) : fmt(miles)} mi away · ${z[3] ? z[3] + " County" : STATE_NAMES[z[2]]}${game.hinted ? " · hint used" : ""}`
      : "Time's up. No pin dropped.";
    el.resultMeter.style.width = "0";
    requestAnimationFrame(() => requestAnimationFrame(() => { el.resultMeter.style.width = `${(points / MAX_POINTS) * 100}%`; }));

    el.hint.hidden = true;
    el.guess.hidden = true;
    el.next.hidden = false;
    const isLast = game.index + 1 >= MODES[game.mode].rounds;
    el.next.innerHTML = isLast ? "See results <kbd>Enter</kbd>" : "Next ZIP <kbd>Enter</kbd>";
    el.end.hidden = game.mode !== "endless";
    updateHud();
  }

  function countUp(node, target, format) {
    const start = performance.now(), dur = 700;
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      node.textContent = format(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function nextRound() {
    if (game.phase !== "result") return;
    game.index += 1;
    if (game.index >= MODES[game.mode].rounds) showSummary();
    else startRound();
  }

  // ---------- Summary ----------
  function showSummary() {
    stopTimer();
    game.phase = "summary";
    const total = game.rounds.reduce((s, r) => s + r.points, 0);
    const n = game.rounds.length;
    const max = n * MAX_POINTS;
    const pct = max ? total / max : 0;

    el.sumRank.textContent = rankFor(pct);
    el.sumTotal.textContent = "0";
    countUp(el.sumTotal, total, fmt);
    el.sumMax.textContent = `/ ${fmt(max)}`;

    const dists = game.rounds.filter((r) => r.miles !== null).map((r) => r.miles);
    const avgMiles = dists.length ? dists.reduce((a, b) => a + b, 0) / dists.length : null;
    const parts = [`${n} round${n === 1 ? "" : "s"}`];
    if (avgMiles !== null) parts.push(`avg ${fmt(avgMiles)} mi off`);

    // Records
    let record = false;
    if (game.mode === "daily") {
      const key = "daily." + todayKey();
      if (store.get(key) === null) store.set(key, { total, emoji: game.rounds.map((r) => emojiFor(r.points)).join("") });
      else parts.push("first try counted");
    } else if (game.mode === "classic") {
      if (total > store.get("best.classic", 0)) { store.set("best.classic", total); record = n > 0; }
    } else if (game.mode === "endless" && n >= 5) {
      const avg = Math.round(total / n);
      if (avg > store.get("best.endless", 0)) { store.set("best.endless", avg); record = true; }
      parts.push(`${fmt(avg)} per round`);
    }
    if (record) parts.push("new best!");
    el.sumSub.textContent = parts.join(" · ");

    el.sumRounds.innerHTML = "";
    game.rounds.forEach((r, i) => {
      const li = document.createElement("li");
      const dist = r.miles === null ? "no guess" : `${r.miles < 10 ? r.miles.toFixed(1) : fmt(r.miles)} mi${r.hinted ? " · hint" : ""}`;
      li.innerHTML = `<span class="r-n">${i + 1}</span><span class="r-zip">${r.zip[0]}</span>` +
        `<span class="r-place"></span><span class="r-pts">${emojiFor(r.points)} ${fmt(r.points)}</span>`;
      const place = li.querySelector(".r-place");
      place.textContent = `${r.zip[1]}, ${r.zip[2]}`;
      const small = document.createElement("small");
      small.textContent = dist;
      place.appendChild(small);
      el.sumRounds.appendChild(li);
    });

    el.share.hidden = n === 0;
    el.viewMap.hidden = n === 0;
    el.again.textContent = game.mode === "daily" ? "Play Classic" : "Play again";
    el.result.hidden = true;
    el.zipCard.hidden = true;
    el.actions.hidden = true;
    el.summary.hidden = false;
    el.summary.scrollTop = 0;
  }

  function reviewMap() {
    game.phase = "review";
    el.summary.hidden = true;
    clearMap();
    el.map.classList.remove("guessing");
    game.rounds.forEach((r) => { if (r.guess) drawLine(r.guess.lonlat, [r.zip[5], r.zip[4]], "guess-line faded"); });
    game.rounds.forEach((r) => { if (r.guess) drawGuessPin(r.guess.lonlat); });
    game.rounds.forEach((r) => drawActual([r.zip[5], r.zip[4]], r.zip[0], false));
    const pts = game.rounds.flatMap((r) => [[r.zip[4], r.zip[5]], ...(r.guess ? [[r.guess.lonlat[1], r.guess.lonlat[0]]] : [])]);
    flyToBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 9, duration: 0.8 });
    el.actions.hidden = false;
    el.hint.hidden = true;
    el.guess.hidden = true;
    el.end.hidden = true;
    el.next.hidden = false;
    el.next.innerHTML = "Back to results <kbd>Enter</kbd>";
    el.next.onclick = backToSummary;
  }

  function backToSummary() {
    el.next.onclick = () => nextRound();
    el.actions.hidden = true;
    game.phase = "summary";
    el.summary.hidden = false;
  }

  el.viewMap.onclick = reviewMap;
  el.again.onclick = () => startGame(game.mode === "daily" ? "classic" : game.mode);
  el.toMenu.onclick = () => showMenu();
  el.share.onclick = async () => {
    const total = game.rounds.reduce((s, r) => s + r.points, 0);
    const n = game.rounds.length;
    const title = game.mode === "daily" ? `Zip Drop Daily ${todayKey()}` : `Zip Drop ${MODES[game.mode].label}`;
    const text = `${title}\n${game.rounds.map((r) => emojiFor(r.points)).join("")} ${fmt(total)}/${fmt(n * MAX_POINTS)}\n${location.href.split("#")[0]}`;
    try {
      await navigator.clipboard.writeText(text);
      el.share.textContent = "Copied!";
    } catch {
      prompt("Copy your result:", text);
    }
    setTimeout(() => { el.share.textContent = "Copy result"; }, 1600);
  };

  // ---------- Menu ----------
  let tickerTimer;
  function startMenuTicker() {
    stopMenuTicker();
    tickerTimer = setInterval(() => {
      if (zips.length) el.menuZip.textContent = zips[Math.floor(Math.random() * zips.length)][0];
    }, 1400);
  }
  function stopMenuTicker() { clearInterval(tickerTimer); }

  function refreshBests() {
    const bc = store.get("best.classic", 0);
    $("best-classic").textContent = bc ? `Best ${fmt(bc)}` : "";
    const daily = store.get("daily." + todayKey());
    $("best-daily").textContent = daily ? `Today ${daily.emoji}\n${fmt(daily.total)}` : "New today";
    $("best-daily").style.whiteSpace = "pre";
    const be = store.get("best.endless", 0);
    $("best-endless").textContent = be ? `Best ${fmt(be)}/rd` : "";
  }

  function showMenu() {
    stopTimer();
    game.phase = "menu";
    el.next.onclick = () => nextRound();
    clearMap();
    resetView(false);
    el.map.classList.remove("guessing");
    el.hud.hidden = true;
    el.quit.hidden = true;
    el.actions.hidden = true;
    el.zipCard.hidden = true;
    el.result.hidden = true;
    el.summary.hidden = true;
    el.menu.hidden = false;
    refreshBests();
    startMenuTicker();
  }

  document.querySelectorAll(".mode").forEach((btn) => {
    btn.disabled = true;
    btn.onclick = () => startGame(btn.dataset.mode);
  });
  el.optTimer.checked = !!store.get("timer", false);
  el.optTimer.onchange = () => store.set("timer", el.optTimer.checked);

  // ---------- Boot ----------
  showMenu();
  loadData().then(() => {
    el.loading.hidden = true;
    document.querySelectorAll(".mode").forEach((b) => { b.disabled = false; });
  }).catch((err) => {
    console.error(err);
    el.loading.textContent = "Couldn't load game data. If you opened index.html directly, serve the folder over HTTP instead (see README).";
    el.loading.classList.add("error");
  });
})();
