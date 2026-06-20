const state = {
  catalog: null,
  catalogVersion: "v2",
  catalogsByVersion: new Map(),
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
  colorMode: "task",
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

function getRunById(runId) {
  return state.catalog?.runs?.find((run) => run.id === runId) || null;
}

const familyOrder = ["baseline", "RKD", "MGD"];
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
  baseline: "baseline",
  MGD: "MGD",
  RKD: "RKD",
};

const versionLabels = {
  v1: "v1 episode",
  v2: "v2 frame",
};

function catalogPath(version) {
  return version === "v1" ? "./data/catalog_v1.json" : "./data/catalog.json";
}

function versionHashParams(extra = {}) {
  return new URLSearchParams({
    version: state.catalogVersion,
    ...extra,
  }).toString();
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
  state.selected = null;
  state.visibleSeqs = new Set();
  state.openTasks = new Set();
  state.hoveredEpisodeKey = null;
  state.chartStates.clear();
}

async function loadCatalogVersion(version) {
  const nextVersion = versionLabels[version] ? version : "v2";
  if (!state.catalogsByVersion.has(nextVersion)) {
    state.catalogsByVersion.set(nextVersion, await fetchJson(catalogPath(nextVersion)));
  }
  if (state.catalogVersion !== nextVersion) {
    resetRunState();
  }
  state.catalogVersion = nextVersion;
  state.catalog = state.catalogsByVersion.get(nextVersion);
}

const colors = [
  "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2",
  "#be123c", "#4f46e5", "#65a30d", "#c026d3", "#0f766e", "#b45309",
  "#1d4ed8", "#b91c1c", "#15803d", "#7c3aed", "#d97706", "#0e7490",
  "#9f1239", "#4338ca", "#4d7c0f", "#a21caf", "#115e59", "#92400e",
  "#0369a1", "#a16207"
];

const timestepPalette = ["#173b66", "#2f6f8f", "#82a782", "#f3df58"];
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
  return colors[seq.task_id % colors.length];
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
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    await loadCatalogVersion(hash.get("version") || "v2");
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
  await loadCatalogVersion(hash.get("version") || "v2");
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
  const families = [...(state.catalog.families || familyOrder)]
    .sort((a, b) => orderIndex(familyOrder, a) - orderIndex(familyOrder, b));
  const familyButtons = families.map((family) =>
    el("button", {
      class: `family-btn${family === state.family ? " active" : ""}`,
      text: familyLabels[family] || family,
      onclick: () => {
        state.family = family;
        location.hash = versionHashParams({ family });
        renderSidebar();
        if (state.selectedCharts.length) renderViewer();
        else renderEmpty();
      },
    })
  );
  const runs = (state.catalog.runs || []).filter((run) => run.family === state.family);
  const runButtons = runs.map((run) => {
    const isShown = state.selectedCharts.some((chart) => chart.runId === run.id);
    return el("button", {
      class: `run-btn${state.activeRunId === run.id ? " active" : ""}${isShown ? " selected" : ""}`,
      onclick: () => loadRun(run),
    }, [
      el("strong", { text: run.label || run.id }),
      el("span", { text: (run.features || []).join(" / ") }),
    ]);
  });

  sidebar.innerHTML = "";
  sidebar.appendChild(el("h2", { text: "Version" }));
  sidebar.appendChild(el("div", { class: "version-grid" }, Object.keys(versionLabels).map((version) =>
    el("button", {
      class: `version-btn${state.catalogVersion === version ? " active" : ""}`,
      text: versionLabels[version],
      onclick: () => {
        location.hash = new URLSearchParams({ version }).toString();
      },
    })
  )));
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
  stage.appendChild(el("div", { class: "version-home" }, [
    el("h2", { text: state.catalogVersion === "v1" ? "v1 episode t-SNE" : "v2 frame t-SNE" }),
    el("p", {
      text: state.catalogVersion === "v1"
        ? "Episode-anchor runs are preserved here."
        : "Description-balanced frame-sampled runs appear here.",
    }),
    el("div", { class: "version-actions" }, [
      el("button", {
        class: `version-btn${state.catalogVersion === "v2" ? " active" : ""}`,
        text: "v2 frame",
        onclick: () => { location.hash = "version=v2"; },
      }),
      el("button", {
        class: `version-btn${state.catalogVersion === "v1" ? " active" : ""}`,
        text: "v1 episode",
        onclick: () => { location.hash = "version=v1"; },
      }),
    ]),
    el("p", { class: "status", text: "Select a run from the sidebar." }),
  ]));
  document.querySelector(".panel").innerHTML = "";
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
  const preferred = state.preferredFeatures.filter((feature) =>
    state.runManifest.features.includes(feature)
  );
  if (isFirstChart && !state.selectedCharts.some((chart) => chart.runId === run.id)) {
    const feature = preferred[0] || state.runManifest.features[0];
    state.selectedCharts.push({ runId: run.id, feature });
  }
  state.preferredFeatures = getSelectedFeaturesForRun(run.id);
  if (options.updateHash !== false) {
    location.hash = versionHashParams({ family: run.family, run: run.id });
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
  if (state.selected?.runId === runId) {
    state.selected = null;
  }
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
    location.hash = versionHashParams({ family: state.family });
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
  location.hash = versionHashParams({ family: state.family, run: state.activeRunId });
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
  if (state.selected?.runId === runId) {
    state.selected = null;
  }
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
  if (
    state.selected
    && selectedRunIsShown
    && isSequenceVisibleForRun(state.selected.runId, state.selected.seq)
  ) return;
  if (state.selected && !allowReplace) return;
  const chart = state.selectedCharts[0];
  if (!chart) return;
  const pointPayload = state.pointsByChart.get(chartKey(chart.runId, chart.feature));
  if (!pointPayload || !pointPayload.points?.length) return;
  const visibleKeys = getVisibleSequenceKeys();
  const first = pointPayload.points.find((row) => isSequenceVisibleForRun(chart.runId, row[2], visibleKeys));
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
  const colorControls = renderColorControls();
  const spacingControls = renderSpacingControls();
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
  const toolbar = el("div", { class: "stage-toolbar" }, [
    tabs,
    el("div", { class: "chart-controls" }, [colorControls, spacingControls, zoomControls]),
  ]);
  document.querySelector(".stage").innerHTML = "";
  renderVideoStrip(document.querySelector(".stage"));
  document.querySelector(".stage").appendChild(toolbar);
  document.querySelector(".stage").appendChild(el("div", { class: "chart-grid" }));
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
  if (state.colorMode === "timestep") {
    controls.appendChild(renderTimestepLegend());
  }
  return controls;
}

function renderTimestepLegend() {
  return el("div", { class: "timestep-legend", title: "Timestep color scale" }, [
    el("div", { class: "timestep-legend-title", text: "Episode timestep" }),
    el("div", { class: "timestep-ramp" }),
    el("div", { class: "timestep-ticks" }, [
      el("span", { text: "start" }),
      el("span", { text: "mid" }),
      el("span", { text: "end" }),
    ]),
  ]);
}

function setColorMode(mode) {
  if (state.colorMode === mode) return;
  state.colorMode = mode;
  renderTabs();
  renderCharts();
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
  const sequences = getSequencesForRun(state.selected.runId);
  const manifest = state.runManifestsById.get(state.selected.runId) || state.runManifest;
  const seq = sequences.sequences[state.selected.seq];
  if (!seq || !seq.videos) return;
  const cams = Object.keys(seq.videos);
  if (!cams.length) return;
  const fps = manifest.fps || 20;
  const videoStartFrame = numericValue(seq.video_start_frame) ?? 0;
  const currentTime = Math.max(0, (state.selected.frame - videoStartFrame) / fps);
  const cards = cams.map((cam) => {
    const video = el("video", {
      autoplay: "autoplay",
      controls: "controls",
      loop: "loop",
      muted: "muted",
      playsinline: "playsinline",
      src: `./${seq.videos[cam]}`,
    });
    video.dataset.syncVideo = "1";
    video.addEventListener("loadedmetadata", () => {
      const maxTime = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : currentTime;
      video.currentTime = Math.min(currentTime, maxTime);
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => {});
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
  state.selected = buildSelection(runId, point);
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
  const visiblePoints = allPoints.filter((point) => isSequenceVisibleForRun(runId, point.seq, visibleKeys));
  if (state.selected && !isSequenceVisibleForRun(state.selected.runId, state.selected.seq, visibleKeys)) {
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
      path.setAttribute("stroke", colors[seq.task_id % colors.length]);
      path.dataset.episodeKey = seqKey;
      if (seqSelectionKey) path.dataset.episodeSelectionKey = seqSelectionKey;
      path.addEventListener("mouseenter", () => setHoveredEpisode(runId, seqId));
      path.addEventListener("mouseleave", () => setHoveredEpisode(null, null));
      svg.appendChild(path);
    }
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
    const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("cx", point.x);
    ring.setAttribute("cy", point.y);
    ring.setAttribute("r", "1.95");
    ring.setAttribute("class", "selected-ring");
    ring.setAttribute("fill", pointColor);
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
    center.setAttribute("r", "0.86");
    center.setAttribute("class", "dot selected");
    center.setAttribute("fill", "#ffffff");
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
  const selectionKey = getPointSelectionKey(point.runId, point);
  if (state.selected?.selectionKey && selectionKey) {
    return state.selected.selectionKey === selectionKey;
  }
  return state.selected
    && state.selected.runId === point.runId
    && state.selected.seq === point.seq
    && state.selected.anchor === point.anchor
    && state.selected.frame === point.frame;
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
  const focusedKey = state.hoveredEpisodeKey || selectedKey;
  document.querySelectorAll("[data-episode-key]").forEach((node) => {
    const key = node.dataset.episodeKey;
    const episodeSelectionKey = node.dataset.episodeSelectionKey;
    const selectedByManifest = Boolean(
      selectedEpisodeSelectionKey && episodeSelectionKey === selectedEpisodeSelectionKey
    );
    node.classList.toggle("episode-hovered", Boolean(state.hoveredEpisodeKey && key === state.hoveredEpisodeKey));
    node.classList.toggle("episode-active", Boolean((selectedKey && key === selectedKey) || selectedByManifest));
    node.classList.toggle("episode-dimmed", Boolean(
      state.hoveredEpisodeKey
        ? key !== focusedKey
        : selectedEpisodeSelectionKey && !selectedByManifest
    ));
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
  state.selected = buildSelection(point.runId || state.selected.runId, point);
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
  const isFrameVersion = state.catalogVersion === "v2";
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
