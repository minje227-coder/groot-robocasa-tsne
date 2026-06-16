const state = {
  catalog: null,
  family: "baseline",
  run: null,
  runManifest: null,
  sequences: null,
  activeRunId: null,
  runManifestsById: new Map(),
  sequencesByRunId: new Map(),
  pointsByChart: new Map(),
  selectedCharts: [],
  preferredFeatures: [],
  cam: "robot0_agentview_left",
  selected: null,
  visibleSeqs: new Set(),
  openTasks: new Set(),
  lastHash: "",
  syncingVideos: false,
  panelWidth: 360,
  panMode: false,
  chartStates: new Map(),
  pendingPanelScrollTop: null,
  pendingTaskPanelScrollTop: null,
};

function chartKey(runId, feature) {
  return `${runId}::${feature}`;
}

function getRunById(runId) {
  return state.catalog?.runs?.find((run) => run.id === runId) || null;
}

const familyLabels = {
  baseline: "baseline",
  MGD: "MGD",
  RKD: "RKD",
};

const colors = [
  "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2",
  "#be123c", "#4f46e5", "#65a30d", "#c026d3", "#0f766e", "#b45309",
  "#1d4ed8", "#b91c1c", "#15803d", "#7c3aed", "#d97706", "#0e7490",
  "#9f1239", "#4338ca", "#4d7c0f", "#a21caf", "#115e59", "#92400e",
  "#0369a1", "#a16207"
];

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) node.appendChild(child);
  return node;
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

async function init() {
  renderShell();
  attachPanelResize();
  try {
    state.catalog = await fetchJson("./data/catalog.json");
    await applyHash();
    window.addEventListener("hashchange", applyHash);
    window.setInterval(() => {
      if (location.hash !== state.lastHash) applyHash();
    }, 150);
  } catch (err) {
    document.querySelector(".stage").innerHTML = `<p class="status error">${err.message}</p>`;
  }
}

async function applyHash() {
  if (!state.catalog) return;
  state.lastHash = location.hash;
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const family = hash.get("family") || "baseline";
  const runId = hash.get("run");
  state.family = family;
  renderSidebar();
  if (runId) {
    const run = state.catalog.runs.find((r) => r.id === runId);
    if (run && (!state.run || state.run.id !== run.id)) {
      state.family = run.family;
      await loadRun(run, { updateHash: false });
      return;
    }
  }
  if (!runId) {
    state.run = null;
    state.runManifest = null;
    state.sequences = null;
    state.activeRunId = null;
    state.pointsByChart.clear();
    state.selectedCharts = [];
    state.chartStates.clear();
    state.selected = null;
    state.visibleSeqs = new Set();
    state.openTasks = new Set();
    renderSidebar();
    renderEmpty();
  }
}

function renderShell() {
  document.getElementById("app").innerHTML = "";
  const shell = el("div", { class: "shell" }, [
    el("header", { class: "topbar" }, [
      el("div", { class: "title" }, [
        el("h1", { text: "RoboCasa temporal t-SNE" }),
        el("p", { text: "Shared viewer for baseline, MGD, and RKD trajectory embeddings." }),
      ]),
      el("a", { href: "https://github.com/minje227-coder/groot-robocasa-tsne", text: "GitHub" }),
    ]),
    el("main", { class: "layout" }, [
      el("aside", { class: "sidebar" }),
      el("section", { class: "stage" }, [
        el("div", { class: "chart-wrap" }, [
          el("div", { class: "status", text: "Select a run." }),
        ]),
      ]),
      el("div", {
        class: "panel-resizer",
        role: "separator",
        "aria-orientation": "vertical",
        "aria-label": "Resize details panel",
        tabindex: "0",
      }),
      el("aside", { class: "panel" }),
    ]),
  ]);
  document.getElementById("app").appendChild(shell);
  applyPanelWidth();
}

function applyPanelWidth() {
  const layout = document.querySelector(".layout");
  if (!layout) return;
  layout.style.setProperty("--panel-width", `${state.panelWidth}px`);
}

function attachPanelResize() {
  const layout = document.querySelector(".layout");
  const handle = document.querySelector(".panel-resizer");
  if (!layout || !handle) return;

  const minWidth = 300;
  const maxWidth = 720;

  const updateWidthFromClientX = (clientX) => {
    const bounds = layout.getBoundingClientRect();
    const next = Math.min(maxWidth, Math.max(minWidth, bounds.right - clientX));
    state.panelWidth = next;
    applyPanelWidth();
  };

  handle.addEventListener("pointerdown", (event) => {
    if (window.innerWidth <= 1100) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-panel");

    const onMove = (moveEvent) => updateWidthFromClientX(moveEvent.clientX);
    const onUp = () => {
      document.body.classList.remove("resizing-panel");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  });

  handle.addEventListener("keydown", (event) => {
    if (window.innerWidth <= 1100) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? 24 : -24;
    state.panelWidth = Math.min(maxWidth, Math.max(minWidth, state.panelWidth + delta));
    applyPanelWidth();
  });
}

function renderSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const families = state.catalog.families || ["baseline", "MGD", "RKD"];
  const familyButtons = families.map((family) =>
    el("button", {
      class: `family-btn${family === state.family ? " active" : ""}`,
      text: familyLabels[family] || family,
      onclick: () => {
        state.family = family;
        state.run = null;
        state.activeRunId = null;
        state.selectedCharts = [];
        state.selected = null;
        state.chartStates.clear();
        location.hash = `family=${encodeURIComponent(family)}`;
        renderSidebar();
        renderEmpty();
      },
    })
  );
  const runs = (state.catalog.runs || []).filter((run) => run.family === state.family);
  const runButtons = runs.map((run) =>
    el("button", {
      class: `run-btn${state.activeRunId === run.id ? " active" : ""}${state.selectedCharts.some((chart) => chart.runId === run.id) ? " selected" : ""}`,
      onclick: () => loadRun(run),
    }, [
      el("strong", { text: run.label || run.id }),
      el("span", { text: (run.features || []).join(" / ") }),
    ])
  );

  sidebar.innerHTML = "";
  sidebar.appendChild(el("h2", { text: "Family" }));
  sidebar.appendChild(el("div", { class: "family-grid" }, familyButtons));
  sidebar.appendChild(el("h2", { text: "Runs" }));
  sidebar.appendChild(el("div", { class: "run-list" }, runButtons.length ? runButtons : [
    el("p", { class: "status", text: "No runs published yet." }),
  ]));
  sidebar.appendChild(el("div", { class: "sidebar-help" }, [
    el("p", { text: "Wheel: zoom" }),
    el("p", { text: "Wheel click + drag: pan" }),
  ]));
}

function renderEmpty() {
  document.querySelector(".stage").innerHTML = `<div class="chart-wrap"><p class="status">Select a run.</p></div>`;
  document.querySelector(".panel").innerHTML = "";
}

async function loadRun(run, options = {}) {
  const isFirstChart = !state.selectedCharts.length;
  state.run = run;
  state.activeRunId = run.id;
  renderSidebar();
  if (!state.selectedCharts.length) {
    document.querySelector(".stage").innerHTML = `<div class="chart-wrap"><p class="status">Loading ${run.label || run.id}...</p></div>`;
    document.querySelector(".panel").innerHTML = "";
  }
  await loadRunAssets(run);
  if (isFirstChart) {
    state.visibleSeqs = new Set(state.sequences.sequences.map((seq) => seq.seq_id));
    state.openTasks = new Set();
  }
  const preferred = state.preferredFeatures.filter((feature) =>
    state.runManifest.features.includes(feature)
  );
  if (!state.selectedCharts.some((chart) => chart.runId === run.id)) {
    const feature = preferred[0] || state.runManifest.features[0];
    state.selectedCharts.push({ runId: run.id, feature });
  }
  state.preferredFeatures = getSelectedFeaturesForRun(run.id);
  if (options.updateHash !== false) {
    location.hash = `family=${encodeURIComponent(run.family)}&run=${encodeURIComponent(run.id)}`;
  }
  await Promise.all(state.selectedCharts.map((chart) => loadChartData(chart.runId, chart.feature)));
  ensureSelectedPoint(true);
  renderViewer();
}

async function loadRunAssets(run) {
  if (!state.runManifestsById.has(run.id)) {
    const base = `./${run.path}/`;
    const manifest = await fetchJson(`${base}manifest.json`);
    const sequences = await fetchJson(`${base}${manifest.sequences_file}`);
    state.runManifestsById.set(run.id, manifest);
    state.sequencesByRunId.set(run.id, sequences);
  }
  state.runManifest = state.runManifestsById.get(run.id);
  state.sequences = state.sequencesByRunId.get(run.id);
}

async function loadChartData(runId, feature) {
  const run = getRunById(runId);
  if (!run) return;
  await loadRunAssets(run);
  const key = chartKey(runId, feature);
  if (!state.pointsByChart.has(key)) {
    const base = `./${run.path}/`;
    const file = state.runManifestsById.get(runId).points_files[feature];
    state.pointsByChart.set(key, await fetchJson(`${base}${file}`));
  }
}

function getSelectedFeaturesForRun(runId) {
  return state.selectedCharts
    .filter((chart) => chart.runId === runId)
    .map((chart) => chart.feature);
}

function renderViewer() {
  ensureSelectedPoint(true);
  renderTabs();
  renderCharts();
  renderPanel();
}

function ensureSelectedPoint(allowReplace = false) {
  if (state.selected && state.visibleSeqs.has(state.selected.seq)) return;
  if (state.selected && !allowReplace) return;
  const chart = state.selectedCharts[0];
  if (!chart) return;
  const pointPayload = state.pointsByChart.get(chartKey(chart.runId, chart.feature));
  if (!pointPayload || !pointPayload.points?.length) return;
  const first = pointPayload.points.find((row) => state.visibleSeqs.has(row[2]));
  if (!first) {
    state.selected = null;
    return;
  }
  state.selected = {
    runId: chart.runId,
    seq: first[2],
    anchor: first[3],
    frame: first[4],
    progress: first[5],
  };
}

function renderTabs() {
  const activeRun = getRunById(state.activeRunId);
  const activeManifest = state.activeRunId ? state.runManifestsById.get(state.activeRunId) : null;
  const features = activeManifest?.features || state.runManifest?.features || [];
  const zoomControls = el("div", { class: "zoom-controls" }, [
    el("button", {
      class: `mini-btn zoom-btn pan-toggle${state.panMode ? " active" : ""}`,
      text: "Pan",
      onclick: () => {
        state.panMode = !state.panMode;
        renderTabs();
        renderCharts();
      },
      title: "Toggle drag pan",
    }),
    el("button", {
      class: "mini-btn zoom-btn",
      text: "-",
      onclick: () => {
        scaleSelectedCharts(1 / 1.25);
      },
      title: "Zoom out",
    }),
    el("span", { class: "zoom-readout", text: getZoomReadout() }),
    el("button", {
      class: "mini-btn zoom-btn",
      text: "+",
      onclick: () => {
        scaleSelectedCharts(1.25);
      },
      title: "Zoom in",
    }),
  ]);
  const tabs = el("div", { class: "tabs" },
    features.map((feature) =>
      el("button", {
        class: `tab-btn${hasChart(state.activeRunId, feature) ? " active" : ""}`,
        text: feature,
        onclick: async () => {
          await toggleFeature(feature);
          renderViewer();
        },
      })
    )
  );
  const toolbar = el("div", { class: "stage-toolbar" }, [tabs, zoomControls]);
  document.querySelector(".stage").innerHTML = "";
  renderVideoStrip(document.querySelector(".stage"));
  document.querySelector(".stage").appendChild(toolbar);
  document.querySelector(".stage").appendChild(el("div", { class: "chart-grid" }));
}

async function toggleFeature(feature) {
  const runId = state.activeRunId;
  if (!runId) return;
  const isSelected = hasChart(runId, feature);
  if (isSelected && state.selectedCharts.length === 1) return;
  if (isSelected) {
    state.selectedCharts = state.selectedCharts.filter((chart) =>
      !(chart.runId === runId && chart.feature === feature)
    );
    if (state.selected?.runId === runId) state.selected = null;
  } else {
    await loadChartData(runId, feature);
    state.selectedCharts.push({ runId, feature });
  }
  state.preferredFeatures = getSelectedFeaturesForRun(runId);
  ensureSelectedPoint(true);
}

function hasChart(runId, feature) {
  return state.selectedCharts.some((chart) => chart.runId === runId && chart.feature === feature);
}

function getChartState(key) {
  if (!state.chartStates.has(key)) {
    state.chartStates.set(key, {
      zoom: 1,
      center: null,
      baseView: null,
    });
  }
  return state.chartStates.get(key);
}

function getZoomReadout() {
  if (!state.selectedCharts.length) return "1.00x";
  const values = state.selectedCharts.map((chart) => getChartState(chartKey(chart.runId, chart.feature)).zoom);
  const first = values[0];
  return values.every((value) => Math.abs(value - first) < 1e-9)
    ? `${first.toFixed(2)}x`
    : "multi";
}

function scaleSelectedCharts(factor) {
  for (const chart of state.selectedCharts) {
    const key = chartKey(chart.runId, chart.feature);
    const chartState = getChartState(key);
    chartState.zoom = Math.min(8, Math.max(0.25, chartState.zoom * factor));
    updateChartViewBox(chart.runId, chart.feature);
  }
  const readout = document.querySelector(".zoom-readout");
  if (readout) readout.textContent = getZoomReadout();
}

function renderVideoStrip(stage) {
  if (!state.selected || !state.sequences) return;
  const sequences = state.sequencesByRunId.get(state.selected.runId) || state.sequences;
  const manifest = state.runManifestsById.get(state.selected.runId) || state.runManifest;
  const seq = sequences.sequences[state.selected.seq];
  if (!seq || !seq.videos) return;
  const cams = Object.keys(seq.videos);
  if (!cams.length) return;
  const currentTime = Math.max(0, state.selected.frame / (manifest.fps || 20));
  const cards = cams.map((cam) => {
    const video = el("video", {
      controls: "controls",
      muted: "muted",
      playsinline: "playsinline",
      src: `./${seq.videos[cam]}`,
    });
    video.dataset.syncVideo = "1";
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = currentTime;
    });
    video.addEventListener("play", () => syncVideosFrom(video, { syncPlayback: true }));
    video.addEventListener("pause", () => syncVideosFrom(video, { syncPlayback: true }));
    video.addEventListener("ratechange", () => syncVideosFrom(video, { syncPlayback: false }));
    video.addEventListener("seeking", () => syncVideosFrom(video, { syncPlayback: false, forceTime: true }));
    video.addEventListener("timeupdate", () => syncVideosFrom(video, { syncPlayback: false }));
    video.addEventListener("seeked", () => syncSelectionToVideo(video));
    return el("div", { class: "video-card" }, [
      el("div", { class: "video-label", text: cam.replace("robot0_", "") }),
      video,
    ]);
  });
  stage.appendChild(el("div", { class: "video-strip" }, cards));
}

function getSyncVideos() {
  return [...document.querySelectorAll("video[data-sync-video='1']")];
}

function syncVideosFrom(source, options = {}) {
  if (state.syncingVideos) return;
  const { syncPlayback = false, forceTime = false } = options;
  const threshold = forceTime ? 0.001 : 0.05;
  state.syncingVideos = true;
  try {
    for (const video of getSyncVideos()) {
      if (video === source) continue;
      if (Math.abs(video.currentTime - source.currentTime) > threshold) {
        video.currentTime = source.currentTime;
      }
      if (video.playbackRate !== source.playbackRate) {
        video.playbackRate = source.playbackRate;
      }
      if (syncPlayback) {
        if (source.paused && !video.paused) video.pause();
        if (!source.paused && video.paused) {
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => {});
        }
      }
    }
  } finally {
    state.syncingVideos = false;
  }
  syncSelectionToVideo(source);
}

function renderCharts() {
  const grid = document.querySelector(".chart-grid");
  if (!grid) return;
  grid.innerHTML = "";
  grid.className = `chart-grid chart-count-${Math.min(state.selectedCharts.length, 6)}`;
  for (const chart of state.selectedCharts) {
    const run = getRunById(chart.runId);
    const label = `${run?.label || chart.runId} / ${chart.feature}`;
    const card = el("section", {
      class: "chart-card",
      "data-chart": chartKey(chart.runId, chart.feature),
    }, [
      el("div", { class: "chart-card-head" }, [
        el("span", { class: "chart-card-title", text: label }),
      ]),
      el("div", {
        class: "chart-wrap",
        "data-run": chart.runId,
        "data-feature": chart.feature,
        "data-chart": chartKey(chart.runId, chart.feature),
      }),
    ]);
    grid.appendChild(card);
    renderChart(chart.runId, chart.feature);
  }
}

function renderChart(runId, feature) {
  const key = chartKey(runId, feature);
  const wrap = document.querySelector(`.chart-wrap[data-chart="${key}"]`);
  const chartState = getChartState(key);
  const pointPayload = state.pointsByChart.get(key);
  if (!wrap || !pointPayload) return;
  const sequences = state.sequencesByRunId.get(runId);
  const allPoints = pointPayload.points.map((row) => ({
    x: row[0], y: row[1], seq: row[2], anchor: row[3], frame: row[4], progress: row[5],
  }));
  const visiblePoints = allPoints.filter((point) => state.visibleSeqs.has(point.seq));
  if (state.selected && !state.visibleSeqs.has(state.selected.seq)) {
    state.selected = null;
    ensureSelectedPoint(true);
  }
  if (!visiblePoints.length) {
    wrap.innerHTML = `<p class="status">No task descriptions selected.</p>`;
    return;
  }
  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const padX = (maxX - minX || 1) * 0.08;
  const padY = (maxY - minY || 1) * 0.08;
  const baseX = minX - padX;
  const baseY = minY - padY;
  const baseWidth = (maxX - minX) + 2 * padX;
  const baseHeight = (maxY - minY) + 2 * padY;
  chartState.baseView = { baseX, baseY, baseWidth, baseHeight };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.dataset.run = runId;
  svg.dataset.feature = feature;
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("class", "chart-pan-surface");
  bg.setAttribute("x", String(baseX));
  bg.setAttribute("y", String(baseY));
  bg.setAttribute("width", String(baseWidth));
  bg.setAttribute("height", String(baseHeight));
  bg.setAttribute("fill", "transparent");
  svg.appendChild(bg);

  const bySeq = new Map();
  for (const point of visiblePoints) {
    if (!bySeq.has(point.seq)) bySeq.set(point.seq, []);
    bySeq.get(point.seq).push(point);
  }
  for (const [seqId, seqPoints] of bySeq) {
    seqPoints.sort((a, b) => a.anchor - b.anchor);
    const seq = sequences.sequences[seqId];
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const d = seqPoints.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
    path.setAttribute("d", d);
    path.setAttribute("class", "path-line");
    path.setAttribute("stroke", colors[seq.task_id % colors.length]);
    svg.appendChild(path);
  }
  for (const point of visiblePoints) {
    const chartPoint = { ...point, runId };
    const seq = sequences.sequences[point.seq];
    const taskColor = colors[seq.task_id % colors.length];
    if (isSelected(chartPoint)) {
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("cx", point.x);
      ring.setAttribute("cy", point.y);
      ring.setAttribute("r", "1.75");
      ring.setAttribute("class", "dot selected-ring");
      ring.setAttribute("fill", taskColor);
      svg.appendChild(ring);
    }
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", point.x);
    c.setAttribute("cy", point.y);
    c.setAttribute("r", isSelected(chartPoint) ? "0.76" : "0.55");
    c.setAttribute("class", `dot${isSelected(chartPoint) ? " selected" : ""}`);
    c.setAttribute("fill", isSelected(chartPoint) ? "#ffffff" : taskColor);
    c.dataset.seq = String(point.seq);
    c.dataset.anchor = String(point.anchor);
    c.dataset.frame = String(point.frame);
    c.addEventListener("click", () => {
      state.selected = {
        runId,
        seq: point.seq,
        anchor: point.anchor,
        frame: point.frame,
        progress: point.progress,
      };
      renderCharts();
      renderPanel();
    });
    c.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "title"))
      .textContent = `${seq.task_name}\n${seq.description}\nframe ${point.frame}`;
    svg.appendChild(c);
  }
  wrap.innerHTML = "";
  wrap.classList.toggle("pan-enabled", state.panMode);
  wrap.appendChild(svg);
  attachChartPan(svg, runId, feature);
  updateChartViewBox(runId, feature);
}

function getChartCenter(runId, feature) {
  const chartState = getChartState(chartKey(runId, feature));
  if (!chartState.baseView) return { x: 0, y: 0 };
  if (chartState.center) return chartState.center;
  return {
    x: chartState.baseView.baseX + (chartState.baseView.baseWidth / 2),
    y: chartState.baseView.baseY + (chartState.baseView.baseHeight / 2),
  };
}

function updateChartViewBox(runId, feature) {
  const key = chartKey(runId, feature);
  const svg = document.querySelector(`.chart-wrap[data-chart="${key}"] svg`);
  const chartState = getChartState(key);
  if (!svg || !chartState.baseView) return;
  const { baseWidth, baseHeight } = chartState.baseView;
  const center = getChartCenter(runId, feature);
  const zoomWidth = baseWidth / chartState.zoom;
  const zoomHeight = baseHeight / chartState.zoom;
  svg.setAttribute(
    "viewBox",
    `${center.x - (zoomWidth / 2)} ${center.y - (zoomHeight / 2)} ${zoomWidth} ${zoomHeight}`
  );
  const readout = document.querySelector(".zoom-readout");
  if (readout) readout.textContent = getZoomReadout();
}

function zoomChartAt(runId, feature, clientX, clientY, direction) {
  const key = chartKey(runId, feature);
  const svg = document.querySelector(`.chart-wrap[data-chart="${key}"] svg`);
  const chartState = getChartState(key);
  if (!svg || !chartState.baseView) return;
  const bounds = svg.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;

  const factor = direction < 0 ? 1.2 : (1 / 1.2);
  const nextZoom = Math.min(8, Math.max(0.25, chartState.zoom * factor));
  if (nextZoom === chartState.zoom) return;

  const currentCenter = getChartCenter(runId, feature);
  const currentWidth = chartState.baseView.baseWidth / chartState.zoom;
  const currentHeight = chartState.baseView.baseHeight / chartState.zoom;
  const currentLeft = currentCenter.x - (currentWidth / 2);
  const currentTop = currentCenter.y - (currentHeight / 2);
  const fracX = (clientX - bounds.left) / bounds.width;
  const fracY = (clientY - bounds.top) / bounds.height;
  const worldX = currentLeft + (fracX * currentWidth);
  const worldY = currentTop + (fracY * currentHeight);

  chartState.zoom = nextZoom;
  const nextWidth = chartState.baseView.baseWidth / chartState.zoom;
  const nextHeight = chartState.baseView.baseHeight / chartState.zoom;
  chartState.center = {
    x: worldX - (fracX * nextWidth) + (nextWidth / 2),
    y: worldY - (fracY * nextHeight) + (nextHeight / 2),
  };
  updateChartViewBox(runId, feature);
}

function attachChartPan(svg, runId, feature) {
  const surface = svg.querySelector(".chart-pan-surface");
  if (!surface) return;
  svg.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomChartAt(runId, feature, event.clientX, event.clientY, event.deltaY);
  }, { passive: false });
  svg.addEventListener("pointerdown", (event) => {
    const allowLeftPan = event.button === 0 && state.panMode;
    const allowMiddlePan = event.button === 1;
    const chartState = getChartState(chartKey(runId, feature));
    if (!chartState.baseView || (!allowLeftPan && !allowMiddlePan)) return;
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    svg.classList.add("panning");
    const bounds = svg.getBoundingClientRect();
    const startCenter = getChartCenter(runId, feature);
    const zoomWidth = chartState.baseView.baseWidth / chartState.zoom;
    const zoomHeight = chartState.baseView.baseHeight / chartState.zoom;

    const onMove = (moveEvent) => {
      const dx = ((moveEvent.clientX - event.clientX) / bounds.width) * zoomWidth;
      const dy = ((moveEvent.clientY - event.clientY) / bounds.height) * zoomHeight;
      chartState.center = { x: startCenter.x - dx, y: startCenter.y - dy };
      updateChartViewBox(runId, feature);
    };
    const onUp = () => {
      svg.classList.remove("panning");
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
    };

    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
  });
}

function isSelected(point) {
  return state.selected
    && state.selected.seq === point.seq
    && state.selected.anchor === point.anchor
    && state.selected.frame === point.frame;
}

function getCurrentFeaturePoints() {
  const chart = state.selectedCharts.find((item) => item.runId === state.selected?.runId)
    || state.selectedCharts[0];
  if (!chart) return [];
  const pointPayload = state.pointsByChart.get(chartKey(chart.runId, chart.feature));
  if (!pointPayload) return [];
  return pointPayload.points.map((row) => ({
    x: row[0], y: row[1], seq: row[2], anchor: row[3], frame: row[4], progress: row[5], runId: chart.runId,
  }));
}

function nearestPointForFrame(seqId, frame) {
  let best = null;
  let bestDist = Infinity;
  for (const point of getCurrentFeaturePoints()) {
    if (point.seq !== seqId) continue;
    const dist = Math.abs(point.frame - frame);
    if (dist < bestDist) {
      best = point;
      bestDist = dist;
    }
  }
  return best;
}

function syncSelectionToVideo(video) {
  if (!state.selected) return;
  const manifest = state.runManifestsById.get(state.selected.runId) || state.runManifest;
  const fps = manifest.fps || 20;
  const frame = Math.round(video.currentTime * fps);
  const point = nearestPointForFrame(state.selected.seq, frame);
  if (!point || isSelected(point)) return;
  state.selected = point;
  updateSelectedMarker();
  updateSelectionFrame();
}

function updateSelectedMarker() {
  renderCharts();
}

function updateSelectionFrame() {
  const frameNode = document.getElementById("selection-frame");
  if (frameNode && state.selected) frameNode.textContent = String(state.selected.frame);
}

function preserveTaskPanelScroll() {
  const panel = document.querySelector(".panel");
  state.pendingPanelScrollTop = panel ? panel.scrollTop : 0;
  state.pendingTaskPanelScrollTop = panel?.querySelector(".task-panel")?.scrollTop || 0;
}

function renderPanel() {
  const panel = document.querySelector(".panel");
  const savedScrollTop = state.pendingPanelScrollTop ?? (panel ? panel.scrollTop : 0);
  const savedTaskPanelScrollTop =
    state.pendingTaskPanelScrollTop ?? (panel?.querySelector(".task-panel")?.scrollTop || 0);
  state.pendingPanelScrollTop = null;
  state.pendingTaskPanelScrollTop = null;
  const selectedSequences = state.selected
    ? (state.sequencesByRunId.get(state.selected.runId) || state.sequences)
    : null;
  const seq = state.selected ? selectedSequences.sequences[state.selected.seq] : null;
  panel.innerHTML = "";
  renderTaskDescriptionPanel(panel);
  panel.appendChild(el("h2", { text: "Selection" }));
  if (!seq) {
    panel.appendChild(el("p", { class: "status", text: "Click a trajectory point." }));
    return;
  }
  const selectedRun = getRunById(state.selected.runId);
  panel.appendChild(el("div", { class: "info" }, [
    definitionList([
      ["Run", selectedRun?.label || state.selected.runId],
      ["Feature", state.selectedCharts
        .filter((chart) => chart.runId === state.selected.runId)
        .map((chart) => chart.feature)
        .join(", ")],
      ["Task", seq.task_name],
      ["Description", seq.description],
      ["Episode", String(seq.episode_index)],
      ["Frame", String(state.selected.frame), "selection-frame"],
    ]),
  ]));
  if (!Object.keys(seq.videos || {}).length) {
    panel.appendChild(el("p", { class: "status", text: "No video available for this sequence." }));
  }
  requestAnimationFrame(() => {
    panel.scrollTop = savedScrollTop;
    const taskPanel = panel.querySelector(".task-panel");
    if (taskPanel) taskPanel.scrollTop = savedTaskPanelScrollTop;
  });
}

function renderTaskDescriptionPanel(panel) {
  const sequences = state.sequences ? state.sequences.sequences : [];
  const byTask = new Map();
  for (const seq of sequences) {
    if (!byTask.has(seq.task_name)) byTask.set(seq.task_name, []);
    byTask.get(seq.task_name).push(seq);
  }

  const allOn = el("button", {
    class: "mini-btn",
    text: "All ON",
    onmousedown: (event) => event.preventDefault(),
    onclick: () => {
      preserveTaskPanelScroll();
      state.visibleSeqs = new Set(sequences.map((seq) => seq.seq_id));
      ensureSelectedPoint(true);
      renderViewer();
    },
  });
  const allOff = el("button", {
    class: "mini-btn",
    text: "All OFF",
    onmousedown: (event) => event.preventDefault(),
    onclick: () => {
      preserveTaskPanelScroll();
      state.visibleSeqs = new Set();
      ensureSelectedPoint(true);
      renderViewer();
    },
  });

  panel.appendChild(el("h2", { text: "Task / Description" }));
  panel.appendChild(el("div", { class: "task-toolbar" }, [allOn, allOff]));

  const taskPanel = el("div", { class: "task-panel" });
  for (const [taskName, taskSeqs] of [...byTask.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    taskSeqs.sort((a, b) => a.description.localeCompare(b.description));
    const visibleCount = taskSeqs.filter((seq) => state.visibleSeqs.has(seq.seq_id)).length;
    const isOpen = state.openTasks.has(taskName);
    const taskButton = el("button", {
      class: `task-name${visibleCount ? " active" : " inactive"}`,
      onmousedown: (event) => event.preventDefault(),
      onclick: () => {
        preserveTaskPanelScroll();
        if (state.openTasks.has(taskName)) state.openTasks.delete(taskName);
        else state.openTasks.add(taskName);
        renderPanel();
      },
    }, [
      el("span", { class: "task-caret", text: isOpen ? "-" : "+" }),
      el("span", { text: taskName }),
      el("span", { class: "task-count", text: `${visibleCount}/${taskSeqs.length}` }),
    ]);
    const toggleButton = el("button", {
      class: "task-eye",
      text: "toggle",
      onmousedown: (event) => event.preventDefault(),
      onclick: (event) => {
        event.stopPropagation();
        preserveTaskPanelScroll();
        const nextOn = visibleCount !== taskSeqs.length;
        for (const seq of taskSeqs) {
          if (nextOn) state.visibleSeqs.add(seq.seq_id);
          else state.visibleSeqs.delete(seq.seq_id);
        }
        ensureSelectedPoint(true);
        renderViewer();
      },
    });
    const descList = el("div", { class: `desc-list${isOpen ? " open" : ""}` });
    for (const seq of taskSeqs) {
      const visible = state.visibleSeqs.has(seq.seq_id);
      descList.appendChild(el("button", {
        class: `desc-toggle${visible ? " active" : " inactive"}`,
        text: seq.description,
        onmousedown: (event) => event.preventDefault(),
        onclick: () => {
          preserveTaskPanelScroll();
          if (state.visibleSeqs.has(seq.seq_id)) state.visibleSeqs.delete(seq.seq_id);
          else state.visibleSeqs.add(seq.seq_id);
          ensureSelectedPoint(true);
          renderViewer();
        },
      }));
    }
    taskPanel.appendChild(el("div", { class: "task-accordion" }, [
      el("div", { class: "task-row" }, [taskButton, toggleButton]),
      descList,
    ]));
  }
  panel.appendChild(taskPanel);
}

function definitionList(rows) {
  const dl = el("dl");
  for (const [k, v, id] of rows) {
    const ddAttrs = id ? { text: v, id } : { text: v };
    dl.appendChild(el("div", {}, [
      el("dt", { text: k }),
      el("dd", ddAttrs),
    ]));
  }
  return dl;
}

init();
