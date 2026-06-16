const state = {
  catalog: null,
  family: "baseline",
  run: null,
  runManifest: null,
  sequences: null,
  pointsByFeature: new Map(),
  feature: null,
  cam: "robot0_agentview_left",
  selected: null,
  visibleSeqs: new Set(),
  openTasks: new Set(),
  lastHash: "",
  syncingVideos: false,
  panelWidth: 360,
  chartZoom: 1,
};

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
    state.pointsByFeature.clear();
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
        location.hash = `family=${encodeURIComponent(family)}`;
        renderSidebar();
        renderEmpty();
      },
    })
  );
  const runs = (state.catalog.runs || []).filter((run) => run.family === state.family);
  const runButtons = runs.map((run) =>
    el("button", {
      class: `run-btn${state.run && state.run.id === run.id ? " active" : ""}`,
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
}

function renderEmpty() {
  document.querySelector(".stage").innerHTML = `<div class="chart-wrap"><p class="status">Select a run.</p></div>`;
  document.querySelector(".panel").innerHTML = "";
}

async function loadRun(run, options = {}) {
  state.run = run;
  state.pointsByFeature.clear();
  state.selected = null;
  state.chartZoom = 1;
  renderSidebar();
  document.querySelector(".stage").innerHTML = `<div class="chart-wrap"><p class="status">Loading ${run.label || run.id}...</p></div>`;
  document.querySelector(".panel").innerHTML = "";
  const base = `./${run.path}/`;
  state.runManifest = await fetchJson(`${base}manifest.json`);
  state.sequences = await fetchJson(`${base}${state.runManifest.sequences_file}`);
  state.visibleSeqs = new Set(state.sequences.sequences.map((seq) => seq.seq_id));
  state.openTasks = new Set();
  state.feature = state.runManifest.features[0];
  if (options.updateHash !== false) {
    location.hash = `family=${encodeURIComponent(run.family)}&run=${encodeURIComponent(run.id)}`;
  }
  await loadFeature(state.feature);
  renderViewer();
}

async function loadFeature(feature) {
  if (!state.pointsByFeature.has(feature)) {
    const base = `./${state.run.path}/`;
    const file = state.runManifest.points_files[feature];
    state.pointsByFeature.set(feature, await fetchJson(`${base}${file}`));
  }
  state.feature = feature;
}

function renderViewer() {
  renderTabs();
  renderChart();
  renderPanel();
}

function renderTabs() {
  const zoomControls = el("div", { class: "zoom-controls" }, [
    el("button", {
      class: "mini-btn zoom-btn",
      text: "-",
      onclick: () => {
        state.chartZoom = Math.max(1, state.chartZoom / 1.25);
        renderChart();
      },
      title: "Zoom out",
    }),
    el("span", { class: "zoom-readout", text: `${state.chartZoom.toFixed(2)}x` }),
    el("button", {
      class: "mini-btn zoom-btn",
      text: "+",
      onclick: () => {
        state.chartZoom = Math.min(8, state.chartZoom * 1.25);
        renderChart();
      },
      title: "Zoom in",
    }),
  ]);
  const tabs = el("div", { class: "tabs" },
    state.runManifest.features.map((feature) =>
      el("button", {
        class: `tab-btn${feature === state.feature ? " active" : ""}`,
        text: feature,
        onclick: async () => {
          await loadFeature(feature);
          renderViewer();
        },
      })
    )
  );
  const toolbar = el("div", { class: "stage-toolbar" }, [tabs, zoomControls]);
  document.querySelector(".stage").innerHTML = "";
  renderVideoStrip(document.querySelector(".stage"));
  document.querySelector(".stage").appendChild(toolbar);
  document.querySelector(".stage").appendChild(el("div", { class: "chart-wrap" }));
}

function renderVideoStrip(stage) {
  if (!state.selected || !state.sequences) return;
  const seq = state.sequences.sequences[state.selected.seq];
  if (!seq || !seq.videos) return;
  const cams = Object.keys(seq.videos);
  if (!cams.length) return;
  const currentTime = Math.max(0, state.selected.frame / (state.runManifest.fps || 20));
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

function renderChart() {
  const wrap = document.querySelector(".chart-wrap");
  const pointPayload = state.pointsByFeature.get(state.feature);
  const points = pointPayload.points.map((row) => ({
    x: row[0], y: row[1], seq: row[2], anchor: row[3], frame: row[4], progress: row[5],
  }));
  const visiblePoints = points.filter((point) => state.visibleSeqs.has(point.seq));
  if (state.selected && !state.visibleSeqs.has(state.selected.seq)) {
    state.selected = null;
  }
  if (!visiblePoints.length) {
    wrap.innerHTML = `<p class="status">No task descriptions selected.</p>`;
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
  const centerX = state.selected ? state.selected.x : baseX + (baseWidth / 2);
  const centerY = state.selected ? state.selected.y : baseY + (baseHeight / 2);
  const zoomWidth = baseWidth / state.chartZoom;
  const zoomHeight = baseHeight / state.chartZoom;
  const viewBox = `${centerX - (zoomWidth / 2)} ${centerY - (zoomHeight / 2)} ${zoomWidth} ${zoomHeight}`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const bySeq = new Map();
  for (const point of visiblePoints) {
    if (!bySeq.has(point.seq)) bySeq.set(point.seq, []);
    bySeq.get(point.seq).push(point);
  }
  for (const [seqId, seqPoints] of bySeq) {
    seqPoints.sort((a, b) => a.anchor - b.anchor);
    const seq = state.sequences.sequences[seqId];
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const d = seqPoints.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
    path.setAttribute("d", d);
    path.setAttribute("class", "path-line");
    path.setAttribute("stroke", colors[seq.task_id % colors.length]);
    svg.appendChild(path);
  }
  for (const point of visiblePoints) {
    const seq = state.sequences.sequences[point.seq];
    const taskColor = colors[seq.task_id % colors.length];
    if (isSelected(point)) {
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("cx", point.x);
      ring.setAttribute("cy", point.y);
      ring.setAttribute("r", "1.12");
      ring.setAttribute("class", "dot selected-ring");
      ring.setAttribute("fill", taskColor);
      svg.appendChild(ring);
    }
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", point.x);
    c.setAttribute("cy", point.y);
    c.setAttribute("r", isSelected(point) ? "0.54" : "0.55");
    c.setAttribute("class", `dot${isSelected(point) ? " selected" : ""}`);
    c.setAttribute("fill", isSelected(point) ? "#ffffff" : taskColor);
    c.dataset.seq = String(point.seq);
    c.dataset.anchor = String(point.anchor);
    c.dataset.frame = String(point.frame);
    c.addEventListener("click", () => {
      state.selected = point;
      renderViewer();
    });
    c.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "title"))
      .textContent = `${seq.task_name}\n${seq.description}\nframe ${point.frame}`;
    svg.appendChild(c);
  }
  wrap.innerHTML = "";
  wrap.appendChild(svg);
  const readout = document.querySelector(".zoom-readout");
  if (readout) readout.textContent = `${state.chartZoom.toFixed(2)}x`;
}

function isSelected(point) {
  return state.selected
    && state.selected.seq === point.seq
    && state.selected.anchor === point.anchor
    && state.selected.frame === point.frame;
}

function getCurrentFeaturePoints() {
  const pointPayload = state.pointsByFeature.get(state.feature);
  if (!pointPayload) return [];
  return pointPayload.points.map((row) => ({
    x: row[0], y: row[1], seq: row[2], anchor: row[3], frame: row[4], progress: row[5],
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
  const fps = state.runManifest.fps || 20;
  const frame = Math.round(video.currentTime * fps);
  const point = nearestPointForFrame(state.selected.seq, frame);
  if (!point || isSelected(point)) return;
  state.selected = point;
  updateSelectedMarker();
  updateSelectionFrame();
}

function updateSelectedMarker() {
  renderChart();
  for (const dot of document.querySelectorAll("circle.dot")) {
    const selected = state.selected
      && Number(dot.dataset.seq) === state.selected.seq
      && Number(dot.dataset.anchor) === state.selected.anchor
      && Number(dot.dataset.frame) === state.selected.frame;
    dot.classList.toggle("selected", Boolean(selected));
    if (dot.dataset.seq) {
      dot.setAttribute("r", selected ? "0.54" : "0.55");
    }
  }
}

function updateSelectionFrame() {
  const frameNode = document.getElementById("selection-frame");
  if (frameNode && state.selected) frameNode.textContent = String(state.selected.frame);
}

function renderPanel() {
  const panel = document.querySelector(".panel");
  const savedScrollTop = panel ? panel.scrollTop : 0;
  const savedTaskPanelScrollTop = panel?.querySelector(".task-panel")?.scrollTop || 0;
  const seq = state.selected ? state.sequences.sequences[state.selected.seq] : null;
  panel.innerHTML = "";
  renderTaskDescriptionPanel(panel);
  panel.appendChild(el("h2", { text: "Selection" }));
  if (!seq) {
    panel.appendChild(el("p", { class: "status", text: "Click a trajectory point." }));
    return;
  }
  panel.appendChild(el("div", { class: "info" }, [
    definitionList([
      ["Run", state.runManifest.label || state.runManifest.run_id],
      ["Feature", state.feature],
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
    onclick: () => {
      state.visibleSeqs = new Set(sequences.map((seq) => seq.seq_id));
      renderViewer();
    },
  });
  const allOff = el("button", {
    class: "mini-btn",
    text: "All OFF",
    onclick: () => {
      state.visibleSeqs = new Set();
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
      onclick: () => {
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
      onclick: (event) => {
        event.stopPropagation();
        const nextOn = visibleCount !== taskSeqs.length;
        for (const seq of taskSeqs) {
          if (nextOn) state.visibleSeqs.add(seq.seq_id);
          else state.visibleSeqs.delete(seq.seq_id);
        }
        renderViewer();
      },
    });
    const descList = el("div", { class: `desc-list${isOpen ? " open" : ""}` });
    for (const seq of taskSeqs) {
      const visible = state.visibleSeqs.has(seq.seq_id);
      descList.appendChild(el("button", {
        class: `desc-toggle${visible ? " active" : " inactive"}`,
        text: seq.description,
        onclick: () => {
          if (state.visibleSeqs.has(seq.seq_id)) state.visibleSeqs.delete(seq.seq_id);
          else state.visibleSeqs.add(seq.seq_id);
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
