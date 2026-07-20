(function initializeResearchPage() {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const elements = {
    numPeople: $("numPeople"),
    totalSquids: $("totalSquids"),
    squidValueBb: $("squidValueBb"),
    baseDeadMoneyBb: $("baseDeadMoneyBb"),
    stopCount: $("stopCount"),
    multiplierGrid: $("multiplierGrid"),
    calculateButton: $("calculateButton"),
    progressCopy: $("progressCopy"),
    resultStatus: $("resultStatus"),
    quickQuery: $("quickQuery"),
    heroFilter: $("heroFilter"),
    opponentFilter: $("opponentFilter"),
    remainingFilter: $("remainingFilter"),
    matchCount: $("matchCount"),
    querySummary: $("querySummary"),
    tableHead: $("tableHead"),
    tableBody: $("tableBody"),
    tableScope: $("tableScope"),
    pageSize: $("pageSize"),
    prevPage: $("prevPage"),
    nextPage: $("nextPage"),
    pageStatus: $("pageStatus"),
  };

  const defaults = {
    numPeople: 9,
    totalSquids: 12,
    squidValueBb: 4,
    baseDeadMoneyBb: 10.5,
    stopCount: 7,
  };
  const state = {
    result: null,
    filteredRows: [],
    currentPage: 1,
    sortKey: "remaining",
    sortDirection: "desc",
    worker: null,
  };

  const numberFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
  const bbFormatter = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function multiplierForPreset(count, preset) {
    if (preset === "double") return 2 ** Math.floor((count - 1) / 2);
    return 1;
  }

  function renderMultiplierInputs(preset = "linear", previousValues = []) {
    const total = Math.max(3, Math.min(14, Number.parseInt(elements.totalSquids.value, 10) || defaults.totalSquids));
    elements.multiplierGrid.replaceChildren();
    for (let count = 1; count <= total; count += 1) {
      const label = document.createElement("label");
      label.className = "multiplier-item";
      const value = previousValues[count - 1] ?? multiplierForPreset(count, preset);
      label.innerHTML = `<span>${count}鱼 ×</span><input type="number" min="0" step="0.25" value="${value}" aria-label="${count}鱼倍率">`;
      elements.multiplierGrid.append(label);
    }
  }

  function collectMultiplierValues() {
    return [...elements.multiplierGrid.querySelectorAll("input")].map((input) => Number(input.value));
  }

  function setPreset(preset) {
    document.querySelectorAll("[data-preset]").forEach((button) => button.classList.toggle("active", button.dataset.preset === preset));
    renderMultiplierInputs(preset);
  }

  function collectSettings() {
    return {
      numPeople: Number.parseInt(elements.numPeople.value, 10),
      totalSquids: Number.parseInt(elements.totalSquids.value, 10),
      squidValueBb: Number(elements.squidValueBb.value),
      baseDeadMoneyBb: Number(elements.baseDeadMoneyBb.value),
      stopCount: Number.parseInt(elements.stopCount.value, 10),
      multipliers: collectMultiplierValues(),
    };
  }

  function showError(message) {
    document.querySelector(".error-banner")?.remove();
    const banner = $("errorTemplate").content.firstElementChild.cloneNode(true);
    banner.textContent = message;
    document.querySelector(".results").prepend(banner);
  }

  function clearError() { document.querySelector(".error-banner")?.remove(); }

  function setCalculating(active, progress = 0) {
    elements.calculateButton.disabled = active;
    elements.calculateButton.style.setProperty("--progress", `${Math.max(0, Math.min(100, progress))}%`);
    elements.resultStatus.classList.toggle("ready", !active && Boolean(state.result));
  }

  function startCalculation() {
    clearError();
    state.worker?.terminate();
    state.worker = new Worker("./research-worker.js");
    setCalculating(true, 0);
    elements.resultStatus.textContent = "正在生成数据库";
    elements.progressCopy.textContent = "正在准备计算…";
    state.worker.onmessage = (event) => {
      if (event.data.type === "progress") {
        const { completed, total } = event.data.progress;
        const percent = Math.round((completed / total) * 100);
        setCalculating(true, percent);
        elements.progressCopy.textContent = `正在计算剩余鱼数状态 · ${percent}%`;
      } else if (event.data.type === "result") {
        state.result = event.data.result;
        state.worker.terminate();
        state.worker = null;
        setCalculating(false, 100);
        elements.progressCopy.textContent = `已生成 ${numberFormatter.format(state.result.rows.length)} 条不同分布`;
        elements.resultStatus.textContent = "已完成";
        elements.resultStatus.classList.add("ready");
        populateFilters();
        updateMetrics();
        applyFilters();
      } else if (event.data.type === "error") {
        state.worker.terminate();
        state.worker = null;
        setCalculating(false, 0);
        elements.progressCopy.textContent = "计算未完成";
        elements.resultStatus.textContent = "参数有误";
        showError(event.data.message);
      }
    };
    state.worker.onerror = () => {
      setCalculating(false, 0);
      showError("计算线程启动失败，请刷新页面后重试。");
    };
    state.worker.postMessage({ type: "calculate", settings: collectSettings() });
  }

  function updateMetrics() {
    const { summary } = state.result;
    $("metricRows").textContent = numberFormatter.format(summary.distinctDistributions);
    $("metricGroups").textContent = numberFormatter.format(summary.groupCount);
    $("metricRange").textContent = `${bbFormatter.format(summary.maximumRangeBb)} BB`;
    $("metricRangeContext").textContent = summary.maximumRangeContext;
    $("metricTime").textContent = summary.calculationMs < 1000
      ? `${Math.round(summary.calculationMs)} ms`
      : `${(summary.calculationMs / 1000).toFixed(2)} s`;
  }

  function refillSelect(select, values, suffix) {
    const current = select.value;
    select.innerHTML = `<option value="">全部</option>${values.map((value) => `<option value="${value}">${value} ${suffix}</option>`).join("")}`;
    if (values.map(String).includes(current)) select.value = current;
  }

  function populateFilters() {
    const total = state.result.settings.totalSquids;
    refillSelect(elements.heroFilter, Array.from({ length: total }, (_, index) => index), "鱼");
    refillSelect(elements.opponentFilter, Array.from({ length: total }, (_, index) => index), "鱼");
    refillSelect(elements.remainingFilter, Array.from({ length: total }, (_, index) => total - index), "鱼");
  }

  function parseQuickQuery(text) {
    const compact = text.trim().replace(/\s+/g, "");
    if (!compact) return null;
    const vs = compact.match(/^(\d+)(?:vs|VS|对|比)(\d+)$/);
    const phrase = compact.match(/我(?:有)?(\d+)鱼?.*?对手(?:有)?(\d+)鱼?/);
    const match = vs || phrase;
    return match ? { hero: Number(match[1]), opponent: Number(match[2]) } : null;
  }

  function applyQuickQuery() {
    const parsed = parseQuickQuery(elements.quickQuery.value);
    if (!parsed) return;
    elements.heroFilter.value = String(parsed.hero);
    elements.opponentFilter.value = String(parsed.opponent);
    applyFilters();
  }

  function applyFilters() {
    if (!state.result) return;
    const hero = elements.heroFilter.value === "" ? null : Number(elements.heroFilter.value);
    const opponent = elements.opponentFilter.value === "" ? null : Number(elements.opponentFilter.value);
    const remaining = elements.remainingFilter.value === "" ? null : Number(elements.remainingFilter.value);
    state.filteredRows = state.result.rows.filter((row) => (
      (hero === null || row.heroSquids === hero)
      && (opponent === null || row.opponentSquids === opponent)
      && (remaining === null || row.remaining === remaining)
    ));
    state.currentPage = 1;
    sortRows();
    renderTable();

    const filters = [];
    if (hero !== null) filters.push(`我 ${hero} 鱼`);
    if (opponent !== null) filters.push(`对手 ${opponent} 鱼`);
    if (remaining !== null) filters.push(`剩余 ${remaining} 鱼`);
    elements.matchCount.textContent = `${numberFormatter.format(state.filteredRows.length)} 条匹配`;
    elements.querySummary.innerHTML = filters.length
      ? `当前查询：<strong>${filters.join(" · ")}</strong>。表中“分布出现概率”是从开局恰好出现该完整状态的概率。`
      : "当前显示全部不同分布；请选择我的鱼数和对手鱼数进行快速查询。";
  }

  function sortRows() {
    const direction = state.sortDirection === "asc" ? 1 : -1;
    state.filteredRows.sort((a, b) => {
      const aValue = a[state.sortKey];
      const bValue = b[state.sortKey];
      if (aValue === bValue) return b.remaining - a.remaining || a.heroSquids - b.heroSquids || a.opponentSquids - b.opponentSquids;
      return (aValue > bValue ? 1 : -1) * direction;
    });
  }

  function formatProbability(value) {
    const percent = value * 100;
    if (percent === 0) return "0%";
    if (percent < 0.0001) return `${percent.toExponential(2)}%`;
    if (percent < 0.01) return `${percent.toFixed(6)}%`;
    return `${percent.toFixed(4)}%`;
  }

  function sortableHeader(key, label) {
    const active = state.sortKey === key;
    const direction = state.sortDirection === "asc" ? "↑" : "↓";
    return `<th><button type="button" data-sort="${key}" class="${active ? "active" : ""}" data-direction="${active ? direction : ""}">${label}</button></th>`;
  }

  function renderTableHead() {
    const playerHeaders = Array.from({ length: state.result.settings.numPeople - 2 }, (_, index) => `<th class="identity">P${index + 3}</th>`).join("");
    elements.tableHead.innerHTML = `<tr>
      ${sortableHeader("remaining", "剩余鱼数")}
      <th>已发鱼数</th>
      ${sortableHeader("heroSquids", "我的鱼数 P1")}
      ${sortableHeader("opponentSquids", "对手鱼数 P2")}
      ${playerHeaders}
      ${sortableHeader("totalEffectiveBb", "总有效死钱底池 [BB]")}
      ${sortableHeader("occurrenceProbability", "分布出现概率")}
      ${sortableHeader("squidDeadMoneyUnit", "有效死钱（1BB/鱼）")}
      ${sortableHeader("squidDeadMoneyBb", "鱿鱼有效死钱 [BB]")}
    </tr>`;
    elements.tableHead.querySelectorAll("[data-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.sortKey === button.dataset.sort) state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
        else {
          state.sortKey = button.dataset.sort;
          state.sortDirection = button.dataset.sort === "remaining" ? "desc" : "asc";
        }
        sortRows();
        state.currentPage = 1;
        renderTable();
      });
    });
  }

  function pageSizeValue() {
    return elements.pageSize.value === "all" ? Math.max(1, state.filteredRows.length) : Number(elements.pageSize.value);
  }

  function renderTable() {
    renderTableHead();
    const pageSize = pageSizeValue();
    const pageCount = Math.max(1, Math.ceil(state.filteredRows.length / pageSize));
    state.currentPage = Math.min(state.currentPage, pageCount);
    const start = (state.currentPage - 1) * pageSize;
    const rows = state.filteredRows.slice(start, start + pageSize);
    if (!rows.length) {
      const columnCount = state.result.settings.numPeople + 6;
      elements.tableBody.innerHTML = `<tr class="empty-row"><td colspan="${columnCount}">没有符合当前条件的分布</td></tr>`;
    } else {
      elements.tableBody.innerHTML = rows.map((row) => `<tr>
        <td>${row.remaining}</td>
        <td>${row.distributed}</td>
        <td>${row.heroSquids}</td>
        <td>${row.opponentSquids}</td>
        ${row.others.map((value) => `<td class="identity">${value}</td>`).join("")}
        <td class="total-pot">${bbFormatter.format(row.totalEffectiveBb)}</td>
        <td class="probability">${formatProbability(row.occurrenceProbability)}</td>
        <td class="unit">${bbFormatter.format(row.squidDeadMoneyUnit)}</td>
        <td>${bbFormatter.format(row.squidDeadMoneyBb)}</td>
      </tr>`).join("");
    }
    const shownEnd = Math.min(start + rows.length, state.filteredRows.length);
    elements.tableScope.textContent = state.filteredRows.length
      ? `显示 ${numberFormatter.format(start + 1)}–${numberFormatter.format(shownEnd)} / ${numberFormatter.format(state.filteredRows.length)}`
      : "0 条";
    elements.pageStatus.textContent = `第 ${state.currentPage} / ${pageCount} 页`;
    elements.prevPage.disabled = state.currentPage <= 1;
    elements.nextPage.disabled = state.currentPage >= pageCount;
  }

  document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => setPreset(button.dataset.preset)));
  elements.totalSquids.addEventListener("change", () => renderMultiplierInputs("linear", collectMultiplierValues()));
  elements.numPeople.addEventListener("change", () => {
    elements.stopCount.max = elements.numPeople.value;
    if (Number(elements.stopCount.value) > Number(elements.numPeople.value)) elements.stopCount.value = elements.numPeople.value;
  });
  elements.calculateButton.addEventListener("click", startCalculation);
  $("resetButton").addEventListener("click", () => {
    Object.entries(defaults).forEach(([key, value]) => { elements[key].value = value; });
    setPreset("linear");
  });
  elements.quickQuery.addEventListener("input", applyQuickQuery);
  elements.quickQuery.addEventListener("keydown", (event) => { if (event.key === "Enter") applyQuickQuery(); });
  [elements.heroFilter, elements.opponentFilter, elements.remainingFilter].forEach((select) => select.addEventListener("change", applyFilters));
  $("clearFilters").addEventListener("click", () => {
    elements.quickQuery.value = "";
    elements.heroFilter.value = "";
    elements.opponentFilter.value = "";
    elements.remainingFilter.value = "";
    applyFilters();
  });
  elements.pageSize.addEventListener("change", () => { state.currentPage = 1; renderTable(); });
  elements.prevPage.addEventListener("click", () => { state.currentPage -= 1; renderTable(); $("tableScroll").scrollTop = 0; });
  elements.nextPage.addEventListener("click", () => { state.currentPage += 1; renderTable(); $("tableScroll").scrollTop = 0; });

  renderMultiplierInputs();
  startCalculation();
})();
