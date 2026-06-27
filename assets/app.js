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
  selectionMode: "single",
  selectedPoints: [],
  selected: null,
  visibleSeqs: new Set(),
  openTasks: new Set(),
  lastHash: "",
  syncingVideos: false,
  panelWidth: 360,
  panMode: false,
  lassoMode: false,
  lassoRegions: [],
  colorMode: "task",
  timestepRange: [0, 1],
  spacingMode: "original",
  hoveredEpisodeKey: null,
  chartStates: new Map(),
  pendingPanelScrollTop: null,
  pendingTaskPanelScrollTop: null,
};

function chartKey(runId, feature) {
  return `${runId}::${feature}`;
}

function episodeKey(runId, seqId) {
  return `${runId}::${seqId}`;
}

function getSequencesForRun(runId) {
  return state.sequencesByRunId.get(runId) || state.sequences;
}

function getSequenceById(runId, seqId) {
  return getSequencesForRun(runId)?.sequences?.[seqId] || null;
}

function getEpisodeSelectionKey(runId, seqId) {
  const seq = getSequenceById(runId, seqId);
  if (!seq) return null;
  const dataset = seq.dataset_rel_path || seq.task_name || "";
  return `${dataset}::${seq.episode_index}`;
}

function getPointSelectionKey(runId, point) {
  const episodeSelectionKey = getEpisodeSelectionKey(runId, point.seq);
  const frame = numericValue(point.frame);
  if (!episodeSelectionKey || frame === null) return null;
  return `${episodeSelectionKey}::${frame}`;
}

function getPointGlobalKey(runId, point) {
  const frame = numericValue(point.frame);
  if (frame === null) return null;
  return `${point.seq}::${frame}`;
}

function buildSelection(runId, point) {
  return {
    runId,
    seq: point.seq,
    anchor: point.anchor,
    frame: point.frame,
    progress: point.progress,
    episodeSelectionKey: getEpisodeSelectionKey(runId, point.seq),
    selectionKey: getPointSelectionKey(runId, point),
  };
}

function selectionKey(selection) {
  return selection?.selectionKey
    || `${selection?.runId}::${selection?.seq}::${selection?.anchor}::${selection?.frame}`;
}

function setSelectedPoints(points) {
  state.selectedPoints = points;
  state.selected = points[points.length - 1] || null;
}

function clearSelectedPoints() {
  setSelectedPoints([]);
}

function removeSelectedPointsForRun(runId) {
  setSelectedPoints(state.selectedPoints.filter((point) => point.runId !== runId));
}

function isSelectionVisible(selection) {
  const seq = getSequenceById(selection.runId, selection.seq);
  return isSequenceVisibleForRun(selection.runId, selection.seq)
    && isPointInTimestepRange(selection, seq);
}

function getSelectionIndex(selection) {
  const key = selectionKey(selection);
  return state.selectedPoints.findIndex((point) => selectionKey(point) === key);
}

function getSelectionAccent(selection) {
  const index = getSelectionIndex(selection);
  if (state.selectionMode !== "multi" || index < 0) return "#facc15";
  return selectionPalette[index % selectionPalette.length];
}

function getRunById(runId) {
  return state.catalog?.runs?.find((run) => run.id === runId) || null;
}

const familyOrder = ["baseline", "KL", "MGRKD", "RKD", "MGD"];
const featureOrder = ["raw", "processed", "action"];

function orderIndex(list, value) {
  const index = list.indexOf(value);
  return index === -1 ? list.length : index;
}

function getCatalogRunIndex(runId) {
  const index = state.catalog?.runs?.findIndex((run) => run.id === runId) ?? -1;
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function chartSortKey(chart) {
  const run = getRunById(chart.runId);
  return {
    family: orderIndex(familyOrder, run?.family),
    runIndex: getCatalogRunIndex(chart.runId),
    runLabel: run?.label || chart.runId,
    feature: orderIndex(featureOrder, chart.feature),
    featureName: chart.feature,
  };
}

function sortSelectedCharts() {
  state.selectedCharts.sort((a, b) => {
    const ka = chartSortKey(a);
    const kb = chartSortKey(b);
    return ka.family - kb.family
      || ka.feature - kb.feature
      || ka.featureName.localeCompare(kb.featureName)
      || ka.runIndex - kb.runIndex
      || ka.runLabel.localeCompare(kb.runLabel);
  });
}

const familyLabels = {
  baseline: "Baseline",
  KL: "KL",
  MGD: "MGD",
  RKD: "RKD",
  MGRKD: "MGRKD",
};

function hashParams(extra = {}) {
  return new URLSearchParams(extra).toString();
}

function resetRunState() {
  state.run = null;
  state.runManifest = null;
  state.sequences = null;
  state.activeRunId = null;
  state.runManifestsById.clear();
  state.sequencesByRunId.clear();
  state.pointsByChart.clear();
  state.selectedCharts = [];
  state.preferredFeatures = [];
  clearSelectedPoints();
  state.visibleSeqs = new Set();
  state.openTasks = new Set();
  state.hoveredEpisodeKey = null;
  state.lassoRegions = [];
  state.chartStates.clear();
}

async function loadCatalog() {
  if (!state.catalog) {
    state.catalog = await fetchJson("./data/catalog.json");
  }
}

const colors = [
  "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2",
  "#be123c", "#4f46e5", "#65a30d", "#c026d3", "#0f766e", "#b45309",
  "#1d4ed8", "#b91c1c", "#15803d", "#7c3aed", "#d97706", "#0e7490",
  "#9f1239", "#4338ca", "#4d7c0f", "#a21caf", "#115e59", "#92400e",
  "#0369a1", "#a16207"
];

const timestepPalette = ["#173b66", "#2f6f8f", "#82a782", "#f3df58"];
const selectionPalette = ["#f9a8d4", "#93c5fd", "#86efac"];
const lassoPalette = [
  { fill: "rgba(147, 197, 253, 0.34)", stroke: "rgba(59, 130, 246, 0.68)" },
  { fill: "rgba(249, 168, 212, 0.34)", stroke: "rgba(219, 39, 119, 0.64)" },
  { fill: "rgba(134, 239, 172, 0.34)", stroke: "rgba(22, 163, 74, 0.62)" },
  { fill: "rgba(253, 230, 138, 0.38)", stroke: "rgba(217, 119, 6, 0.66)" },
  { fill: "rgba(196, 181, 253, 0.34)", stroke: "rgba(124, 58, 237, 0.62)" },
  { fill: "rgba(125, 211, 252, 0.34)", stroke: "rgba(2, 132, 199, 0.64)" },
  { fill: "rgba(252, 165, 165, 0.34)", stroke: "rgba(220, 38, 38, 0.62)" },
  { fill: "rgba(167, 243, 208, 0.34)", stroke: "rgba(5, 150, 105, 0.62)" },
  { fill: "rgba(253, 186, 116, 0.34)", stroke: "rgba(234, 88, 12, 0.62)" },
  { fill: "rgba(216, 180, 254, 0.34)", stroke: "rgba(147, 51, 234, 0.62)" },
];
const softSpacingGamma = 0.55;
const spacingEpsilon = 1e-9;

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHex(rgb) {
  return `#${rgb.map((value) =>
    Math.round(value).toString(16).padStart(2, "0")
  ).join("")}`;
}

function complementColor(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || "")) return "#22d3ee";
  return rgbToHex(hexToRgb(hex).map((value) => 255 - value));
}

function interpolateColor(startHex, endHex, t) {
  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);
  return rgbToHex(start.map((value, i) => value + (end[i] - value) * t));
}

function interpolatePalette(palette, t) {
  const scaled = clamp(t, 0, 1) * (palette.length - 1);
  const index = Math.min(palette.length - 2, Math.floor(scaled));
  return interpolateColor(palette[index], palette[index + 1], scaled - index);
}

function numericValue(value) {
  return Number.isFinite(value) ? value : null;
}

function getPointTimestep(point) {
  return numericValue(point.frame) ?? numericValue(point.anchor);
}

function getPointTimestepProgress(point, seq) {
  const frame = getPointTimestep(point);
  const episodeLength = numericValue(seq?.episode_length);
  if (frame !== null && episodeLength !== null && episodeLength > 1) {
    return clamp(frame / (episodeLength - 1), 0, 1);
  }
  const progress = numericValue(point.progress);
  if (progress !== null) return clamp(progress, 0, 1);
  return null;
}

function getTimestepColor(point, seq) {
  const t = getPointTimestepProgress(point, seq);
  if (t === null) return timestepPalette[0];
  return interpolatePalette(timestepPalette, t);
}

function getPointColor(point, seq) {
  if (state.colorMode === "timestep") return getTimestepColor(point, seq);
  return getTaskColor(seq);
}

function isPointInTimestepRange(point, seq) {
  const t = getPointTimestepProgress(point, seq);
  if (t === null) return true;
  return t >= state.timestepRange[0] && t <= state.timestepRange[1];
}

function getTaskColor(seq) {
  const taskId = Number.isFinite(seq?.task_id) ? seq.task_id : 0;
  return colors[taskId % colors.length] || colors[0];
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getTemporalStepDistances(points) {
  const distances = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const distance = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    if (distance > spacingEpsilon) distances.push(distance);
  }
  return distances;
}

function getPathLength(points) {
  return getTemporalStepDistances(points).reduce((sum, distance) => sum + distance, 0);
}

function preserveEpisodePathScale(originalPoints, adjustedPoints) {
  const originalLength = getPathLength(originalPoints);
  const adjustedLength = getPathLength(adjustedPoints);
  if (originalLength <= spacingEpsilon || adjustedLength <= spacingEpsilon) return adjustedPoints;
  const scale = originalLength / adjustedLength;
  const anchor = adjustedPoints[0];
  return adjustedPoints.map((point) => ({
    ...point,
    x: anchor.x + (point.x - anchor.x) * scale,
    y: anchor.y + (point.y - anchor.y) * scale,
  }));
}

function getAdjustedStepDistance(distance, referenceDistance) {
  if (distance <= spacingEpsilon || referenceDistance <= spacingEpsilon) return distance;
  if (state.spacingMode === "equal") return referenceDistance;
  if (state.spacingMode === "soft") {
    return referenceDistance * Math.pow(distance / referenceDistance, softSpacingGamma);
  }
  return distance;
}

function applyTemporalSpacing(points) {
  if (state.spacingMode === "original") return points;
  const bySeq = new Map();
  for (const point of points) {
    if (!bySeq.has(point.seq)) bySeq.set(point.seq, []);
    bySeq.get(point.seq).push(point);
  }

  const adjustedByPoint = new Map();
  for (const seqPoints of bySeq.values()) {
    seqPoints.sort((a, b) => a.anchor - b.anchor);
    const referenceDistance = median(getTemporalStepDistances(seqPoints));
    const adjustedSeqPoints = [];
    if (seqPoints.length) adjustedSeqPoints.push({ ...seqPoints[0] });

    for (let i = 1; i < seqPoints.length; i++) {
      const prevOriginal = seqPoints[i - 1];
      const currOriginal = seqPoints[i];
      const prevAdjusted = adjustedSeqPoints[i - 1];
      const dx = currOriginal.x - prevOriginal.x;
      const dy = currOriginal.y - prevOriginal.y;
      const distance = Math.hypot(dx, dy);
      if (!prevAdjusted || referenceDistance <= spacingEpsilon) {
        adjustedSeqPoints.push({ ...currOriginal });
        continue;
      }
      if (distance <= spacingEpsilon) {
        adjustedSeqPoints.push({
          ...currOriginal,
          x: prevAdjusted.x,
          y: prevAdjusted.y,
        });
        continue;
      }
      const adjustedDistance = getAdjustedStepDistance(distance, referenceDistance);
      adjustedSeqPoints.push({
        ...currOriginal,
        x: prevAdjusted.x + (dx / distance) * adjustedDistance,
        y: prevAdjusted.y + (dy / distance) * adjustedDistance,
      });
    }
    const scaledSeqPoints = preserveEpisodePathScale(seqPoints, adjustedSeqPoints);
    seqPoints.forEach((point, index) => {
      adjustedByPoint.set(point, scaledSeqPoints[index]);
    });
  }
  return points.map((point) => adjustedByPoint.get(point) || point);
}

function sequenceKey(seq) {
  return `${seq.task_name}\u0000${seq.description}`;
}

function getVisibleSequenceKeys() {
  const sequences = state.sequences?.sequences || [];
  const keys = new Set();
  for (const seq of sequences) {
    if (state.visibleSeqs.has(seq.seq_id)) keys.add(sequenceKey(seq));
  }
  return keys;
}

function isSequenceVisibleForRun(runId, seqId, visibleKeys = getVisibleSequenceKeys()) {
  if (runId === state.activeRunId) return state.visibleSeqs.has(seqId);
  const sequences = state.sequencesByRunId.get(runId);
  const seq = sequences?.sequences?.[seqId];
  if (!seq) return false;
  return visibleKeys.has(sequenceKey(seq));
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
    await loadCatalog();
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
  state.lastHash = location.hash;
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (hash.has("version")) {
    hash.delete("version");
    const cleanHash = hash.toString();
    history.replaceState(null, "", `${location.pathname}${location.search}${cleanHash ? `#${cleanHash}` : ""}`);
    state.lastHash = location.hash;
  }
  await loadCatalog();
  if (!state.catalog) return;
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
    if (state.selectedCharts.length) {
      if (!state.activeRunId && state.selectedCharts[0]) {
        state.activeRunId = state.selectedCharts[0].runId;
      }
      renderViewer();
      return;
    }
    state.run = null;
    state.runManifest = null;
    state.sequences = null;
    state.activeRunId = null;
    state.pointsByChart.clear();
    state.selectedCharts = [];
    state.chartStates.clear();
    clearSelectedPoints();
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
  const families = [...(state.catalog.families || familyOrder)]
    .sort((a, b) => orderIndex(familyOrder, a) - orderIndex(familyOrder, b));
  const familyButtons = families.map((family) =>
    el("button", {
      class: `family-btn${family === state.family ? " active" : ""}`,
      text: familyLabels[family] || family,
      onclick: () => {
        state.family = family;
        location.hash = hashParams({ family });
        renderSidebar();
        if (state.selectedCharts.length) renderViewer();
        else renderEmpty();
      },
    })
  );
  const runs = (state.catalog.runs || []).filter((run) => run.family === state.family);
  const runButtons = runs.map((run) => {
    const isShown = state.selectedCharts.some((chart) => chart.runId === run.id);
    return el("div", {
      class: `run-btn${isShown ? " selected" : ""}`,
    }, [
      el("strong", { text: run.label || run.id }),
      renderRunFeatureToggle(run),
    ]);
  });

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
  document.querySelector(".stage").innerHTML = "";
  const stage = document.querySelector(".stage");
  stage.appendChild(el("div", { class: "home-panel" }, [
    el("h2", { text: "Frame t-SNE" }),
    el("p", { text: "Description-balanced frame-sampled runs appear here." }),
    el("p", { class: "status", text: "Select a run from the sidebar." }),
  ]));
  document.querySelector(".panel").innerHTML = "";
}

function renderRunFeatureToggle(run) {
  return el("div", { class: "run-feature-toggle" }, (run.features || []).map((feature) =>
    el("button", {
      class: `mini-btn run-feature-btn${hasChart(run.id, feature) ? " active" : ""}`,
      text: feature,
      title: `${run.label || run.id} ${feature}`,
      onclick: (event) => toggleRunFeature(run, feature, event),
    })
  ));
}

async function toggleRunFeature(run, feature, event) {
  event.preventDefault();
  event.stopPropagation();
  if (state.activeRunId !== run.id) {
    await loadRun(run);
  }
  await toggleFeature(feature);
  renderSidebar();
  renderViewer();
}

async function loadRun(run, options = {}) {
  const isFirstChart = !state.selectedCharts.length;
  const previousVisibleKeys = getVisibleSequenceKeys();
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
  } else {
    state.visibleSeqs = new Set(
      state.sequences.sequences
        .filter((seq) => previousVisibleKeys.has(sequenceKey(seq)))
        .map((seq) => seq.seq_id)
    );
    if (!state.visibleSeqs.size) {
      state.visibleSeqs = new Set(state.sequences.sequences.map((seq) => seq.seq_id));
    }
  }
  state.preferredFeatures = getSelectedFeaturesForRun(run.id);
  if (options.updateHash !== false) {
    location.hash = hashParams({ family: run.family, run: run.id });
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

function removeRunCharts(runId) {
  const removedCharts = state.selectedCharts.filter((chart) => chart.runId === runId);
  if (!removedCharts.length) return;
  state.selectedCharts = state.selectedCharts.filter((chart) => chart.runId !== runId);
  for (const chart of removedCharts) {
    state.chartStates.delete(chartKey(chart.runId, chart.feature));
  }
  removeSelectedPointsForRun(runId);
  if (!state.selectedCharts.length) {
    state.run = null;
    state.runManifest = null;
    state.sequences = null;
    state.activeRunId = null;
    state.preferredFeatures = [];
    state.visibleSeqs = new Set();
    state.openTasks = new Set();
    renderSidebar();
    renderEmpty();
    location.hash = hashParams({ family: state.family });
    return;
  }
  if (state.activeRunId === runId) {
    state.activeRunId = state.selectedCharts[0].runId;
  }
  const activeRun = getRunById(state.activeRunId);
  state.run = activeRun;
  state.runManifest = activeRun ? state.runManifestsById.get(activeRun.id) || null : null;
  state.sequences = activeRun ? state.sequencesByRunId.get(activeRun.id) || null : null;
  state.preferredFeatures = state.activeRunId ? getSelectedFeaturesForRun(state.activeRunId) : [];
  ensureSelectedPoint(true);
  renderSidebar();
  renderViewer();
  location.hash = hashParams({ family: state.family, run: state.activeRunId });
}

function removeChartSelection(runId, feature) {
  const hasSelection = state.selectedCharts.some((chart) => chart.runId === runId && chart.feature === feature);
  if (!hasSelection) return;
  if (state.selectedCharts.length === 1) {
    removeRunCharts(runId);
    return;
  }
  state.selectedCharts = state.selectedCharts.filter((chart) => !(chart.runId === runId && chart.feature === feature));
  state.chartStates.delete(chartKey(runId, feature));
  removeSelectedPointsForRun(runId);
  state.preferredFeatures = state.activeRunId ? getSelectedFeaturesForRun(state.activeRunId) : [];
  ensureSelectedPoint(true);
  renderSidebar();
  renderViewer();
}

function renderViewer() {
  sortSelectedCharts();
  ensureSelectedPoint(true);
  renderTabs();
  renderCharts();
  renderPanel();
}

function ensureSelectedPoint(allowReplace = false) {
  const selectedRunIsShown = state.selectedCharts.some((chart) => chart.runId === state.selected?.runId);
  const selectedSeq = state.selected ? getSequenceById(state.selected.runId, state.selected.seq) : null;
  if (
    state.selected
    && selectedRunIsShown
    && isSequenceVisibleForRun(state.selected.runId, state.selected.seq)
    && isPointInTimestepRange(state.selected, selectedSeq)
  ) return;
  if (state.selected && !allowReplace) return;
  const chart = state.selectedCharts[0];
  if (!chart) return;
  const pointPayload = state.pointsByChart.get(chartKey(chart.runId, chart.feature));
  if (!pointPayload || !pointPayload.points?.length) return;
  const visibleKeys = getVisibleSequenceKeys();
  const first = pointPayload.points.find((row) => {
    const point = { x: row[0], y: row[1], seq: row[2], anchor: row[3], frame: row[4], progress: row[5] };
    const seq = getSequenceById(chart.runId, point.seq);
    return isSequenceVisibleForRun(chart.runId, point.seq, visibleKeys)
      && isPointInTimestepRange(point, seq);
  });
  if (!first) {
    clearSelectedPoints();
    return;
  }
  setSelectedPoints([buildSelection(chart.runId, {
    seq: first[2],
    anchor: first[3],
    frame: first[4],
    progress: first[5],
  })]);
}

function renderTabs() {
  const selectionControls = renderSelectionControls();
  const cameraControls = renderCameraControls();
  const colorControls = renderColorControls();
  const zoomControls = el("div", { class: "zoom-controls" }, [
    el("button", {
      class: `mini-btn zoom-btn pan-toggle${state.panMode ? " active" : ""}`,
      onclick: () => {
        state.panMode = !state.panMode;
        if (state.panMode) state.lassoMode = false;
        renderTabs();
        renderCharts();
      },
      title: "Toggle drag pan",
      "aria-label": "Toggle drag pan",
    }, [
      el("img", {
        class: "pan-icon",
        src: "./assets/move.png",
        alt: "",
        width: "44",
        height: "44",
        style: "width:44px;height:44px;",
      }),
    ]),
    renderLassoToolGroup(),
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
  const toolbar = el("div", { class: "stage-toolbar" }, [
    el("div", {
      class: "chart-controls-left",
    }, [
      selectionControls,
      ...(state.selectionMode === "multi" ? [cameraControls] : []),
    ]),
    el("div", {
      class: "chart-controls-right",
    }, [
      colorControls,
      zoomControls,
    ]),
  ]);
  document.querySelector(".stage").innerHTML = "";
  renderVideoStrip(document.querySelector(".stage"));
  document.querySelector(".stage").appendChild(toolbar);
  document.querySelector(".stage").appendChild(el("div", { class: "chart-grid" }));
}

function renderLassoToolGroup() {
  return el("div", { class: "lasso-tool-group" }, [
    el("button", {
      class: `mini-btn zoom-btn lasso-toggle${state.lassoMode ? " active" : ""}`,
      onclick: () => {
        state.lassoMode = !state.lassoMode;
        if (state.lassoMode) state.panMode = false;
        renderTabs();
        renderCharts();
      },
      title: "Draw freeform region",
      "aria-label": "Draw freeform region",
    }, [
      el("img", {
        class: "lasso-icon",
        src: "./assets/lasso-select.svg",
        alt: "",
        width: "44",
        height: "44",
        style: "width:44px;height:44px;",
      }),
    ]),
    renderLassoRegionActions(),
  ]);
}

function renderLassoRegionActions() {
  const hasRegions = state.lassoRegions.length > 0;
  const disabledAttrs = hasRegions ? {} : { disabled: "disabled", "aria-disabled": "true" };
  return el("div", { class: `lasso-region-actions${hasRegions ? " active" : ""}` }, [
    el("button", {
      class: "mini-btn lasso-region-btn",
      text: "Undo",
      title: "Undo last freedom region",
      onclick: undoLassoRegion,
      ...disabledAttrs,
    }),
    el("button", {
      class: "mini-btn lasso-region-btn",
      text: "Clear",
      title: "Clear all freedom regions",
      onclick: clearLassoRegions,
      ...disabledAttrs,
    }),
  ]);
}

function renderSelectionControls() {
  return el("div", { class: "selection-mode-toggle" }, [
    el("button", {
      class: `mini-btn selection-mode-btn${state.selectionMode === "single" ? " active" : ""}`,
      text: "Single point",
      title: "Keep one active point",
      onclick: () => setSelectionMode("single"),
    }),
    el("button", {
      class: `mini-btn selection-mode-btn${state.selectionMode === "multi" ? " active" : ""}`,
      text: "Multi point",
      title: "Keep up to three active points",
      onclick: () => setSelectionMode("multi"),
    }),
  ]);
}

function setSelectionMode(mode) {
  if (state.selectionMode === mode) return;
  state.selectionMode = mode;
  if (mode === "single" && state.selectedPoints.length > 1) {
    setSelectedPoints([state.selectedPoints[state.selectedPoints.length - 1]]);
  }
  renderTabs();
  renderCharts();
  renderPanel();
}

function renderCameraControls() {
  const cams = [
    ["robot0_agentview_left", "Left"],
    ["robot0_agentview_right", "Right"],
    ["robot0_eye_in_hand", "Eye"],
  ];
  return el("div", { class: "camera-mode-toggle" }, cams.map(([cam, label]) =>
    el("button", {
      class: `mini-btn camera-mode-btn${state.cam === cam ? " active" : ""}`,
      text: label,
      title: cam.replace("robot0_", ""),
      onclick: () => setCamera(cam),
    })
  ));
}

function setCamera(cam) {
  if (state.cam === cam) return;
  state.cam = cam;
  renderTabs();
  renderPanel();
}

function renderColorControls() {
  const controls = el("div", { class: "color-controls" }, [
    el("div", { class: "color-mode-toggle" }, [
      el("button", {
        class: `mini-btn color-mode-btn${state.colorMode === "task" ? " active" : ""}`,
        text: "Task",
        title: "Color points by task",
        onclick: () => setColorMode("task"),
      }),
      el("button", {
        class: `mini-btn color-mode-btn${state.colorMode === "timestep" ? " active" : ""}`,
        text: "Timestep",
        title: "Color points by timestep",
        onclick: () => setColorMode("timestep"),
      }),
    ]),
  ]);
  controls.appendChild(renderTimestepLegend());
  return controls;
}

function renderTimestepLegend() {
  return el("div", { class: "timestep-legend", title: "Timestep color scale" }, [
    el("div", { class: "timestep-legend-title", text: "Episode timestep" }),
    el("div", {
      class: "timestep-range-control",
      onpointerdown: (event) => startTimestepRangeDrag("nearest", event),
    }, [
      el("div", { class: "timestep-ramp" }),
      el("div", {
        class: "timestep-window",
        style: `left:${state.timestepRange[0] * 100}%;right:${(1 - state.timestepRange[1]) * 100}%;`,
      }),
      el("button", {
        class: "timestep-handle timestep-handle-start",
        style: `left:${state.timestepRange[0] * 100}%;`,
        title: "Start timestep",
        "aria-label": "Start timestep",
        onpointerdown: (event) => startTimestepRangeDrag("start", event),
      }),
      el("button", {
        class: "timestep-handle timestep-handle-end",
        style: `left:${state.timestepRange[1] * 100}%;`,
        title: "End timestep",
        "aria-label": "End timestep",
        onpointerdown: (event) => startTimestepRangeDrag("end", event),
      }),
    ]),
    el("div", { class: "timestep-ticks" }, [
      el("span", { text: "start" }),
      el("span", { text: "mid" }),
      el("span", { text: "end" }),
    ]),
    el("div", {
      class: "timestep-range-label",
      text: `${Math.round(state.timestepRange[0] * 100)}-${Math.round(state.timestepRange[1] * 100)}%`,
    }),
  ]);
}

function setColorMode(mode) {
  if (state.colorMode === mode) return;
  state.colorMode = mode;
  renderTabs();
  renderCharts();
}

function startTimestepRangeDrag(handle, event) {
  event.preventDefault();
  event.stopPropagation();
  const track = event.currentTarget.closest(".timestep-range-control") || event.currentTarget;
  const rect = track.getBoundingClientRect();
  const chooseHandle = (clientX) => {
    if (handle !== "nearest") return handle;
    const value = clamp((clientX - rect.left) / rect.width, 0, 1);
    return Math.abs(value - state.timestepRange[0]) <= Math.abs(value - state.timestepRange[1])
      ? "start"
      : "end";
  };
  const activeHandle = chooseHandle(event.clientX);
  const updateFromClientX = (clientX) => {
    const value = clamp((clientX - rect.left) / rect.width, 0, 1);
    if (activeHandle === "start") setTimestepRange(value, state.timestepRange[1]);
    else setTimestepRange(state.timestepRange[0], value);
  };
  const onMove = (moveEvent) => updateFromClientX(moveEvent.clientX);
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  updateFromClientX(event.clientX);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

function setTimestepRange(start, end) {
  const minGap = 0.01;
  let nextStart = clamp(start, 0, 1);
  let nextEnd = clamp(end, 0, 1);
  if (nextStart > nextEnd - minGap) {
    if (start !== state.timestepRange[0]) nextStart = Math.max(0, nextEnd - minGap);
    else nextEnd = Math.min(1, nextStart + minGap);
  }
  state.timestepRange = [nextStart, nextEnd];
  ensureSelectedPoint(true);
  renderTabs();
  renderCharts();
  renderPanel();
}

function renderSpacingControls() {
  return el("div", { class: "spacing-controls" }, [
    el("div", { class: "spacing-mode-toggle" }, [
      el("button", {
        class: `mini-btn spacing-mode-btn${state.spacingMode === "original" ? " active" : ""}`,
        text: "Original",
        title: "Use original t-SNE distances",
        onclick: () => setSpacingMode("original"),
      }),
      el("button", {
        class: `mini-btn spacing-mode-btn${state.spacingMode === "soft" ? " active" : ""}`,
        text: "Soft",
        title: "Soft-normalize consecutive episode step distances",
        onclick: () => setSpacingMode("soft"),
      }),
      el("button", {
        class: `mini-btn spacing-mode-btn${state.spacingMode === "equal" ? " active" : ""}`,
        text: "Equal",
        title: "Make consecutive episode step distances equal",
        onclick: () => setSpacingMode("equal"),
      }),
    ]),
  ]);
}

function setSpacingMode(mode) {
  if (state.spacingMode === mode) return;
  state.spacingMode = mode;
  resetSelectedChartViews();
  renderTabs();
  renderCharts();
}

function resetSelectedChartViews() {
  for (const chart of state.selectedCharts) {
    const chartState = getChartState(chartKey(chart.runId, chart.feature));
    chartState.zoom = 1;
    chartState.center = null;
  }
}

async function toggleFeature(feature) {
  const runId = state.activeRunId;
  if (!runId) return;
  const isSelected = hasChart(runId, feature);
  if (isSelected) {
    state.selectedCharts = state.selectedCharts.filter((chart) =>
      !(chart.runId === runId && chart.feature === feature)
    );
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

function undoLassoRegion() {
  if (!state.lassoRegions.length) return;
  state.lassoRegions.pop();
  renderTabs();
  renderCharts();
}

function clearLassoRegions() {
  if (!state.lassoRegions.length) return;
  state.lassoRegions = [];
  renderTabs();
  renderCharts();
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
  const selections = state.selectedPoints;
  if (!selections.length) return;
  const cards = selections.flatMap((selection, index) => {
    const sequences = getSequencesForRun(selection.runId);
    const manifest = state.runManifestsById.get(selection.runId) || state.runManifest;
    const seq = sequences?.sequences?.[selection.seq];
    if (!seq || !seq.videos) return null;
    const cams = Object.keys(seq.videos);
    if (!cams.length) return null;
    const shownCams = state.selectionMode === "single"
      ? ["robot0_agentview_left", "robot0_agentview_right", "robot0_eye_in_hand"].filter((cam) => seq.videos[cam])
      : [seq.videos[state.cam] ? state.cam : cams[0]];
    const fps = manifest.fps || 20;
    const videoStartFrame = numericValue(seq.video_start_frame) ?? 0;
    const currentTime = Math.max(0, (selection.frame - videoStartFrame) / fps);
    const selectedRun = getRunById(selection.runId);
    const selectionAccent = getSelectionAccent(selection);
    return shownCams.map((cam) => {
      const video = el("video", {
        autoplay: "autoplay",
        controls: "controls",
        loop: "loop",
        muted: "muted",
        playsinline: "playsinline",
        src: `./${seq.videos[cam]}`,
        ...(state.selectionMode === "multi"
          ? { style: `border-color:${selectionAccent};box-shadow:0 0 0 1px ${selectionAccent};` }
          : {}),
      });
      video.addEventListener("loadedmetadata", () => {
        const maxTime = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : currentTime;
        video.currentTime = Math.min(currentTime, maxTime);
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => {});
      });
      return el("div", { class: "video-card" }, [
        el("div", {
          class: "video-label",
          text: `${index + 1}. ${selectedRun?.label || selection.runId}`,
        }),
        video,
      ]);
    });
  }).filter(Boolean);
  if (cards.length) stage.appendChild(el("div", { class: "video-strip" }, cards));
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
  if (!state.selectedCharts.length) {
    grid.appendChild(el("div", { class: "status", text: "No feature selected." }));
    return;
  }
  for (const chart of state.selectedCharts) {
    const run = getRunById(chart.runId);
    const label = `${run?.label || chart.runId} / ${chart.feature}`;
    const card = el("section", {
      class: "chart-card",
      "data-chart": chartKey(chart.runId, chart.feature),
    }, [
      el("div", { class: "chart-card-head" }, [
        el("span", { class: "chart-card-title", text: label }),
        el("button", {
          class: "chart-off-btn",
          text: "Off",
          title: `Hide ${label}`,
          onclick: () => removeChartSelection(chart.runId, chart.feature),
        }),
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

function selectPoint(runId, point) {
  const nextSelection = buildSelection(runId, point);
  if (state.selectionMode === "single") {
    setSelectedPoints([nextSelection]);
  } else {
    const key = selectionKey(nextSelection);
    if (state.selectedPoints.some((selection) => selectionKey(selection) === key)) return;
    setSelectedPoints([...state.selectedPoints.slice(-2), nextSelection]);
  }
  renderTabs();
  renderCharts();
  renderPanel();
}

function renderChart(runId, feature) {
  const key = chartKey(runId, feature);
  const wrap = document.querySelector(`.chart-wrap[data-chart="${key}"]`);
  const chartState = getChartState(key);
  const pointPayload = state.pointsByChart.get(key);
  if (!wrap || !pointPayload) return;
  const sequences = state.sequencesByRunId.get(runId);
  const allPoints = applyTemporalSpacing(pointPayload.points.map((row) => ({
    x: row[0], y: row[1], seq: row[2], anchor: row[3], frame: row[4], progress: row[5],
  })));
  const visibleKeys = getVisibleSequenceKeys();
  const visiblePoints = allPoints.filter((point) => {
    const seq = sequences.sequences[point.seq];
    return isSequenceVisibleForRun(runId, point.seq, visibleKeys)
      && isPointInTimestepRange(point, seq);
  });
  if (state.selectedPoints.length) {
    setSelectedPoints(state.selectedPoints.filter(isSelectionVisible));
  }
  if (state.selected && !isSelectionVisible(state.selected)) {
    clearSelectedPoints();
    ensureSelectedPoint(true);
  }
  if (!visiblePoints.length) {
    wrap.innerHTML = `<p class="status">No points in the selected timestep range.</p>`;
    return;
  }
  const xs = visiblePoints.map((p) => p.x);
  const ys = visiblePoints.map((p) => p.y);
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
    const seqKey = episodeKey(runId, seqId);
    const seqSelectionKey = getEpisodeSelectionKey(runId, seqId);
    const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
    area.setAttribute("d", getSequencePathD(seqPoints));
    area.setAttribute("class", `episode-area${isFocusedEpisode(runId, seqId) ? " episode-active" : ""}`);
    area.dataset.episodeKey = seqKey;
    if (seqSelectionKey) area.dataset.episodeSelectionKey = seqSelectionKey;
    area.addEventListener("mouseenter", () => setHoveredEpisode(runId, seqId));
    area.addEventListener("mouseleave", () => setHoveredEpisode(null, null));
    area.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "title"))
      .textContent = `${seq.task_name}\n${seq.description}`;
    svg.appendChild(area);
  }
  for (const [seqId, seqPoints] of bySeq) {
    const seq = sequences.sequences[seqId];
    const seqKey = episodeKey(runId, seqId);
    const seqSelectionKey = getEpisodeSelectionKey(runId, seqId);
    if (state.colorMode === "timestep") {
      for (let i = 1; i < seqPoints.length; i++) {
        const prev = seqPoints[i - 1];
        const curr = seqPoints[i];
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M${prev.x},${prev.y} L${curr.x},${curr.y}`);
        path.setAttribute("class", "path-line timestep-path-line");
        path.setAttribute("stroke", getTimestepColor(curr, seq));
        path.dataset.episodeKey = seqKey;
        if (seqSelectionKey) path.dataset.episodeSelectionKey = seqSelectionKey;
        path.addEventListener("mouseenter", () => setHoveredEpisode(runId, seqId));
        path.addEventListener("mouseleave", () => setHoveredEpisode(null, null));
        svg.appendChild(path);
      }
    } else {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", getSequencePathD(seqPoints));
      path.setAttribute("class", "path-line");
      path.setAttribute("stroke", getTaskColor(seq));
      path.dataset.episodeKey = seqKey;
      if (seqSelectionKey) path.dataset.episodeSelectionKey = seqSelectionKey;
      path.addEventListener("mouseenter", () => setHoveredEpisode(runId, seqId));
      path.addEventListener("mouseleave", () => setHoveredEpisode(null, null));
      svg.appendChild(path);
    }
  }
  for (const point of visiblePoints) {
    const globalKey = getPointGlobalKey(runId, point);
    if (!globalKey) continue;
    state.lassoRegions.forEach((region, index) => {
      if (!region.keys.has(globalKey)) return;
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      marker.setAttribute("cx", point.x);
      marker.setAttribute("cy", point.y);
      marker.setAttribute("r", String(1.85 + Math.min(index, 4) * 0.16));
      marker.setAttribute("class", "lasso-point-highlight");
      marker.setAttribute("fill", region.fill);
      marker.setAttribute("stroke", region.stroke);
      svg.appendChild(marker);
    });
  }
  for (const point of visiblePoints) {
    const chartPoint = { ...point, runId };
    const seq = sequences.sequences[point.seq];
    const seqSelectionKey = getEpisodeSelectionKey(runId, point.seq);
    const pointColor = getPointColor(point, seq);
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", point.x);
    c.setAttribute("cy", point.y);
    c.setAttribute("r", "0.55");
    c.setAttribute("class", "dot");
    c.setAttribute("fill", pointColor);
    c.dataset.episodeKey = episodeKey(runId, point.seq);
    if (seqSelectionKey) c.dataset.episodeSelectionKey = seqSelectionKey;
    c.dataset.seq = String(point.seq);
    c.dataset.anchor = String(point.anchor);
    c.dataset.frame = String(point.frame);
    c.addEventListener("mouseenter", () => setHoveredEpisode(runId, point.seq));
    c.addEventListener("mouseleave", () => setHoveredEpisode(null, null));
    c.addEventListener("click", () => {
      selectPoint(runId, point);
    });
    c.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "title"))
      .textContent = `${seq.task_name}\n${seq.description}\nframe ${point.frame}`;
    svg.appendChild(c);
  }
  for (const point of visiblePoints) {
    const chartPoint = { ...point, runId };
    if (!isSelected(chartPoint)) continue;
    const seq = sequences.sequences[point.seq];
    const seqSelectionKey = getEpisodeSelectionKey(runId, point.seq);
    const pointColor = getPointColor(point, seq);
    const selectedCenterColor = complementColor(getTaskColor(seq));
    const selectedAccent = getSelectionAccent(buildSelection(runId, point));
    const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("cx", point.x);
    ring.setAttribute("cy", point.y);
    ring.setAttribute("r", "2.1");
    ring.setAttribute("class", "selected-ring");
    ring.setAttribute("fill", pointColor);
    ring.setAttribute("stroke", selectedAccent);
    ring.dataset.episodeKey = episodeKey(runId, point.seq);
    if (seqSelectionKey) ring.dataset.episodeSelectionKey = seqSelectionKey;
    ring.dataset.run = runId;
    ring.dataset.seq = String(point.seq);
    ring.dataset.anchor = String(point.anchor);
    ring.dataset.frame = String(point.frame);
    ring.addEventListener("mouseenter", () => setHoveredEpisode(runId, point.seq));
    ring.addEventListener("mouseleave", () => setHoveredEpisode(null, null));
    ring.addEventListener("click", () => {
      selectPoint(runId, point);
    });
    svg.appendChild(ring);

    const center = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    center.setAttribute("cx", point.x);
    center.setAttribute("cy", point.y);
    center.setAttribute("r", "0.72");
    center.setAttribute("class", "dot selected");
    center.setAttribute("fill", selectedCenterColor);
    center.dataset.episodeKey = episodeKey(runId, point.seq);
    if (seqSelectionKey) center.dataset.episodeSelectionKey = seqSelectionKey;
    center.dataset.run = runId;
    center.dataset.seq = String(point.seq);
    center.dataset.anchor = String(point.anchor);
    center.dataset.frame = String(point.frame);
    center.addEventListener("mouseenter", () => setHoveredEpisode(runId, point.seq));
    center.addEventListener("mouseleave", () => setHoveredEpisode(null, null));
    center.addEventListener("click", () => {
      selectPoint(runId, point);
    });
    svg.appendChild(center);
  }
  wrap.innerHTML = "";
  wrap.classList.toggle("pan-enabled", state.panMode);
  wrap.classList.toggle("lasso-enabled", state.lassoMode);
  wrap.appendChild(svg);
  updateChartViewBox(runId, feature);
  attachChartLasso(svg, runId, feature, visiblePoints);
  attachChartPan(svg, runId, feature);
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

function clientPointToSvg(svg, clientX, clientY) {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const transformed = point.matrixTransform(matrix.inverse());
  return { x: transformed.x, y: transformed.y };
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects = ((pi.y > point.y) !== (pj.y > point.y))
      && point.x < ((pj.x - pi.x) * (point.y - pi.y)) / ((pj.y - pi.y) || 1e-9) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function attachChartLasso(svg, runId, feature, visiblePoints) {
  svg.addEventListener("pointerdown", (event) => {
    if (!state.lassoMode || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    svg.setPointerCapture(event.pointerId);
    const regionColor = lassoPalette[state.lassoRegions.length % lassoPalette.length];
    const polygon = [];
    const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    path.setAttribute("class", "lasso-draft");
    path.setAttribute("fill", regionColor.fill);
    path.setAttribute("stroke", regionColor.stroke);
    svg.appendChild(path);

    const addPoint = (pointerEvent) => {
      const point = clientPointToSvg(svg, pointerEvent.clientX, pointerEvent.clientY);
      if (!point) return;
      const last = polygon[polygon.length - 1];
      if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.4) return;
      polygon.push(point);
      path.setAttribute("points", polygon.map((p) => `${p.x},${p.y}`).join(" "));
    };

    const onMove = (moveEvent) => addPoint(moveEvent);
    const onUp = () => {
      svg.releasePointerCapture(event.pointerId);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
      if (path.parentNode) path.parentNode.removeChild(path);
      if (polygon.length >= 3) {
        const nextKeys = new Set();
        for (const point of visiblePoints) {
          if (!pointInPolygon(point, polygon)) continue;
          const key = getPointGlobalKey(runId, point);
          if (key) nextKeys.add(key);
        }
        if (nextKeys.size) {
          state.lassoRegions.push({
            keys: nextKeys,
            fill: regionColor.fill,
            stroke: regionColor.stroke,
          });
          renderTabs();
          renderCharts();
        }
      }
    };

    addPoint(event);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
  });
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
  const selectionKey = getPointSelectionKey(point.runId, point);
  return state.selectedPoints.some((selection) => {
    if (selection.selectionKey && selectionKey) return selection.selectionKey === selectionKey;
    return selection.runId === point.runId
      && selection.seq === point.seq
      && selection.anchor === point.anchor
      && selection.frame === point.frame;
  });
}

function getSelectedEpisodeKey() {
  return state.selected ? episodeKey(state.selected.runId, state.selected.seq) : null;
}

function getSelectedEpisodeSelectionKey() {
  return state.selected?.episodeSelectionKey || null;
}

function isFocusedEpisode(runId, seqId) {
  const key = episodeKey(runId, seqId);
  const episodeSelectionKey = getEpisodeSelectionKey(runId, seqId);
  return key === state.hoveredEpisodeKey
    || key === getSelectedEpisodeKey()
    || Boolean(episodeSelectionKey && episodeSelectionKey === getSelectedEpisodeSelectionKey());
}

function updateEpisodeFocus() {
  const selectedKey = getSelectedEpisodeKey();
  const selectedEpisodeSelectionKey = getSelectedEpisodeSelectionKey();
  document.querySelectorAll("[data-episode-key]").forEach((node) => {
    const key = node.dataset.episodeKey;
    const episodeSelectionKey = node.dataset.episodeSelectionKey;
    const selectedByManifest = Boolean(
      selectedEpisodeSelectionKey && episodeSelectionKey === selectedEpisodeSelectionKey
    );
    node.classList.toggle("episode-hovered", Boolean(state.hoveredEpisodeKey && key === state.hoveredEpisodeKey));
    node.classList.toggle("episode-active", Boolean((selectedKey && key === selectedKey) || selectedByManifest));
    node.classList.remove("episode-dimmed");
  });
}

function setHoveredEpisode(runId, seqId) {
  state.hoveredEpisodeKey = runId === null ? null : episodeKey(runId, seqId);
  updateEpisodeFocus();
}

function getSequencePathD(seqPoints) {
  return seqPoints.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
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
  const seq = getSequenceById(state.selected.runId, state.selected.seq);
  const videoStartFrame = numericValue(seq?.video_start_frame) ?? 0;
  const frame = Math.round(video.currentTime * fps) + videoStartFrame;
  const point = nearestPointForFrame(state.selected.seq, frame);
  if (!point || isSelected(point)) return;
  const nextSelection = buildSelection(point.runId || state.selected.runId, point);
  setSelectedPoints([...state.selectedPoints.slice(0, -1), nextSelection]);
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
  if (!state.selectedPoints.length || !seq) {
    panel.appendChild(el("p", { class: "status", text: "Click a trajectory point." }));
    return;
  }
  if (state.selectedPoints.length > 1) {
    panel.appendChild(el("div", { class: "selection-list" }, state.selectedPoints.map((selection, index) => {
      const selectionSeqs = state.sequencesByRunId.get(selection.runId) || state.sequences;
      const selectionSeq = selectionSeqs?.sequences?.[selection.seq];
      const selectionRun = getRunById(selection.runId);
      return el("div", { class: `selection-chip${selection === state.selected ? " active" : ""}` }, [
        el("strong", { text: `${index + 1}. ${selectionRun?.label || selection.runId}` }),
        el("span", { text: `${selectionSeq?.task_name || ""} / frame ${selection.frame}` }),
      ]);
    })));
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
  const isFrameVersion = true;
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
    taskSeqs.sort((a, b) =>
      a.description.localeCompare(b.description)
      || a.episode_index - b.episode_index
      || a.seq_id - b.seq_id
    );
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
    const byDescription = new Map();
    for (const seq of taskSeqs) {
      if (!byDescription.has(seq.description)) byDescription.set(seq.description, []);
      byDescription.get(seq.description).push(seq);
    }
    for (const [description, descSeqs] of byDescription) {
      const descVisibleCount = descSeqs.filter((seq) => state.visibleSeqs.has(seq.seq_id)).length;
      const descButton = el("button", {
        class: `desc-toggle${descVisibleCount ? " active" : " inactive"}${descVisibleCount && descVisibleCount < descSeqs.length ? " partial" : ""}`,
        text: description,
        title: `${isFrameVersion && descVisibleCount === descSeqs.length ? "Hide" : "Show"} all ${descSeqs.length} matching description episode${descSeqs.length === 1 ? "" : "s"}`,
        onmousedown: (event) => event.preventDefault(),
        onclick: () => {
          preserveTaskPanelScroll();
          const nextOn = !isFrameVersion || descVisibleCount !== descSeqs.length;
          for (const seq of descSeqs) {
            if (nextOn) state.visibleSeqs.add(seq.seq_id);
            else state.visibleSeqs.delete(seq.seq_id);
          }
          ensureSelectedPoint(true);
          renderViewer();
        },
      });
      const episodeButtons = descSeqs.map((seq, index) => {
        const visible = state.visibleSeqs.has(seq.seq_id);
        return el("button", {
          class: `desc-episode-toggle${visible ? " active" : " inactive"}`,
          text: String(index + 1),
          title: `Episode ${seq.episode_index}`,
          onmousedown: (event) => event.preventDefault(),
          onclick: (event) => {
            event.stopPropagation();
            preserveTaskPanelScroll();
            if (state.visibleSeqs.has(seq.seq_id)) state.visibleSeqs.delete(seq.seq_id);
            else state.visibleSeqs.add(seq.seq_id);
            ensureSelectedPoint(true);
            renderViewer();
          },
        });
      });
      const descChildren = [descButton];
      if (!isFrameVersion) descChildren.push(el("div", { class: "desc-episodes" }, episodeButtons));
      descList.appendChild(el("div", { class: "desc-group" }, descChildren));
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
