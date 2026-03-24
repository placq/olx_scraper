document.addEventListener("DOMContentLoaded", async () => {
  const categoryInput = document.getElementById("categoryInput");
  const categoriesList = document.getElementById("categoriesList");
  const phraseInput = document.getElementById("phraseInput");
  const searchQueryInput = document.getElementById("searchQuery");
  const mainMinPriceInput = document.getElementById("mainMinPrice");
  const mainMaxPriceInput = document.getElementById("mainMaxPrice");
  const requireDeliveryCheckbox = document.getElementById("requireDelivery");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const logsTerminal = document.getElementById("logsTerminal");
  const resultsSection = document.getElementById("resultsSection");
  const resultsTableBody = document.querySelector("#resultsTable tbody");
  const downloadBtn = document.getElementById("downloadBtn");
  const itemsCountSpan = document.getElementById("itemsCount");

  const themeToggleBtn = document.getElementById("themeToggle");
  const configToggleBtn = document.getElementById("configToggle");
  const settingsModal = document.getElementById("settingsModal");
  const closeSettingsBtn = document.getElementById("closeSettings");

  // Radio button logic for main form
  const searchModeRadios = document.querySelectorAll('input[name="searchMode"]');

  function updateMainFormState() {
    const mode = document.querySelector('input[name="searchMode"]:checked').value;
    if (mode === "category") {
      categoryInput.disabled = false;
      categoryInput.required = true;
      phraseInput.disabled = true;
      phraseInput.required = false;
      phraseInput.value = "";
    } else {
      categoryInput.disabled = true;
      categoryInput.required = false;
      categoryInput.value = "";
      phraseInput.disabled = false;
      phraseInput.required = true;
    }
  }

  searchModeRadios.forEach((radio) => {
    radio.addEventListener("change", updateMainFormState);
  });
  updateMainFormState();

  // Radio button logic for schedule form
  const schedSearchModeRadios = document.querySelectorAll('input[name="schedSearchMode"]');
  const scheduleCategory = document.getElementById("scheduleCategory");
  const scheduleQuery = document.getElementById("scheduleQuery");

  function updateScheduleFormState() {
    const mode = document.querySelector('input[name="schedSearchMode"]:checked').value;
    if (mode === "category") {
      scheduleCategory.disabled = false;
      scheduleCategory.required = true;
      scheduleQuery.disabled = true;
      scheduleQuery.required = false;
      scheduleQuery.value = "";
    } else {
      scheduleCategory.disabled = true;
      scheduleCategory.required = false;
      scheduleCategory.value = "";
      scheduleQuery.disabled = false;
      scheduleQuery.required = true;
    }
  }

  schedSearchModeRadios.forEach((radio) => {
    radio.addEventListener("change", updateScheduleFormState);
  });
  updateScheduleFormState();

  let allCategories = [];
  let eventSource = null;
  let scrapedData = [];
  let currentFileName = "wyniki.json";

  // Theme
  const savedTheme =
    localStorage.getItem("theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  if (savedTheme === "dark") document.documentElement.setAttribute("data-theme", "dark");

  themeToggleBtn.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  });

  // Modal
  configToggleBtn.addEventListener("click", () => {
    settingsModal.classList.remove("hidden");
    loadSmtpConfig();
    loadSchedules();
  });

  closeSettingsBtn.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.add("hidden"));
      e.target.classList.add("active");
      document.getElementById(e.target.dataset.tab).classList.remove("hidden");
    });
  });

  // SMTP
  async function loadSmtpConfig() {
    try {
      const res = await fetch("/api/config/smtp");
      const data = await res.json();
      document.getElementById("smtpHost").value = data.SMTP_HOST || "";
      document.getElementById("smtpPort").value = data.SMTP_PORT || "";
      document.getElementById("smtpUser").value = data.SMTP_USER || "";
      document.getElementById("smtpPass").value = data.SMTP_PASS || "";
      document.getElementById("smtpFrom").value = data.SMTP_FROM || "";
      document.getElementById("smtpTo").value = data.SMTP_TO || "";
    } catch (e) {
      console.error("Failed to load SMTP config", e);
    }
  }

  document.getElementById("smtpForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      SMTP_HOST: document.getElementById("smtpHost").value,
      SMTP_PORT: document.getElementById("smtpPort").value,
      SMTP_USER: document.getElementById("smtpUser").value,
      SMTP_PASS: document.getElementById("smtpPass").value,
      SMTP_FROM: document.getElementById("smtpFrom").value,
      SMTP_TO: document.getElementById("smtpTo").value,
    };
    try {
      const res = await fetch("/api/config/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) alert("Zapisano ustawienia SMTP");
    } catch (e) {
      alert("Błąd zapisu SMTP: " + e.message);
    }
  });

  // Schedules
  const scheduleListContainer = document.getElementById("scheduleList");

  function populateScheduleCategories() {
    scheduleCategory.innerHTML = '<option value="">-- Wybierz kategorię --</option>';
    const fragment = document.createDocumentFragment();
    allCategories.forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat.url;
      option.textContent = cat.name;
      fragment.appendChild(option);
    });
    scheduleCategory.appendChild(fragment);
  }

  async function loadSchedules() {
    scheduleListContainer.innerHTML = "Wczytywanie...";
    try {
      const res = await fetch("/api/schedules");
      const schedules = await res.json();
      renderSchedules(schedules);
    } catch (e) {
      scheduleListContainer.innerHTML = "Błąd wczytywania harmonogramów.";
    }
  }

  function renderSchedules(schedules) {
    if (schedules.length === 0) {
      scheduleListContainer.innerHTML = "<p>Brak zaplanowanych zadań.</p>";
      return;
    }
    const mapDays = { 1: "Pn", 2: "Wt", 3: "Śr", 4: "Cz", 5: "Pt", 6: "Sb", 0: "Nd" };
    scheduleListContainer.innerHTML = "";
    schedules.forEach((sch) => {
      const div = document.createElement("div");
      div.className = "schedule-item";
      const daysStr = (sch.days || []).map((d) => mapDays[d]).join(", ");
      const targetName = sch.query
        ? `Wyszukiwanie: ${sch.query}`
        : `Kategoria: ${sch.categoryName}`;
      div.innerHTML = `<div class="schedule-info"><strong>${sch.time}</strong> (${daysStr})<br>${targetName}${!sch.enabled ? '<span style="color:#ef4444; font-size:0.8rem;"> (Wyłączone)</span>' : ""}</div><div class="schedule-actions"><button class="btn-toggle" data-id="${sch.id}">${sch.enabled ? "Wyłącz" : "Włącz"}</button><button class="btn-delete" data-id="${sch.id}">Usuń</button></div>`;
      scheduleListContainer.appendChild(div);
    });
    document.querySelectorAll(".btn-toggle").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        await fetch(`/api/schedules/${e.target.dataset.id}/toggle`, { method: "POST" });
        loadSchedules();
      });
    });
    document.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        if (confirm("Usunąć harmonogram?")) {
          await fetch(`/api/schedules/${e.target.dataset.id}`, { method: "DELETE" });
          loadSchedules();
        }
      });
    });
  }

  document.getElementById("scheduleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const mode = document.querySelector('input[name="schedSearchMode"]:checked').value;
    let url = "",
      query = "";
    if (mode === "category") {
      url = scheduleCategory.value;
      if (!url) return alert("Wybierz kategorię z listy!");
    } else {
      query = scheduleQuery.value.trim();
      if (!query) return alert("Wpisz frazę wyszukiwania!");
    }
    const requireDelivery = document.getElementById("schedRequireDelivery").checked;
    const filterName = document.getElementById("schedFilterName").value.trim();
    const minPrice = document.getElementById("schedFilterMinPrice").value;
    const maxPrice = document.getElementById("schedFilterMaxPrice").value;
    const time = document.getElementById("scheduleTime").value;
    const days = Array.from(document.querySelectorAll("input[name='schedDays']:checked")).map(
      (cb) => parseInt(cb.value, 10)
    );
    if (days.length === 0) return alert("Wybierz przynajmniej jeden dzień tygodnia!");
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          query,
          requireDelivery,
          filterName,
          filterMinPrice: minPrice,
          filterMaxPrice: maxPrice,
          time,
          days,
        }),
      });
      if (res.ok) {
        document.getElementById("scheduleForm").reset();
        document.querySelector('input[name="schedSearchMode"][value="category"]').checked = true;
        updateScheduleFormState();
        loadSchedules();
      }
    } catch (err) {
      alert("Błąd: " + err.message);
    }
  });

  // Fetch categories
  try {
    logToTerminal("Pobieranie listy kategorii...", "sys");
    const response = await fetch("/api/categories");
    if (!response.ok) throw new Error("Nie udało się pobrać kategorii");
    allCategories = await response.json();
    const fragment = document.createDocumentFragment();
    allCategories.forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat.name;
      option.dataset.url = cat.url;
      fragment.appendChild(option);
    });
    categoriesList.appendChild(fragment);
    categoryInput.disabled = false;
    startBtn.disabled = false;
    categoryInput.placeholder = `${allCategories.length} kategorii.`;
    logToTerminal(`Załadowano ${allCategories.length} kategorii.`, "sys");
    populateScheduleCategories();
  } catch (err) {
    logToTerminal(`Błąd: ${err.message}`, "error");
  }

  // Sync status
  try {
    const statusRes = await fetch("/api/status");
    if (statusRes.ok) {
      const status = await statusRes.json();
      if (status.isRunning) {
        startBtn.disabled = true;
        startBtn.style.display = "none";
        stopBtn.style.display = "block";
        stopBtn.disabled = false;
        logToTerminal("Uwaga: Zadanie trwa w tle...", "sys");
      }
    }
  } catch (e) {}

  function renderTable(data) {
    resultsTableBody.innerHTML = "";
    itemsCountSpan.textContent = data.length;
    if (data.length === 0) {
      resultsTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center">Brak wyników.</td></tr>`;
      return;
    }
    const sortedData = [...data].sort((a, b) =>
      a.priceParsed && b.priceParsed ? a.priceParsed - b.priceParsed : 0
    );
    sortedData.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><strong>${escapeHtml(item.title)}</strong></td><td style="white-space:nowrap;font-weight:bold;color:var(--primary-color)">${escapeHtml(item.price)}</td><td><a href="${escapeHtml(item.url)}" target="_blank">Zobacz ↗</a></td>`;
      resultsTableBody.appendChild(tr);
    });
  }

  function connectLogs() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource("/api/logs");
    eventSource.addEventListener("log", (e) => logToTerminal(e.data));
    eventSource.addEventListener("items", (e) => {
      const newItems = JSON.parse(e.data);
      if (newItems && newItems.length > 0) {
        scrapedData.push(...newItems);
        if (resultsSection.classList.contains("hidden")) resultsSection.classList.remove("hidden");
        renderTable(scrapedData);
      }
    });
    eventSource.addEventListener("done", (e) => {
      const resultData = JSON.parse(e.data);
      startBtn.disabled = false;
      startBtn.style.display = "block";
      stopBtn.style.display = "none";
      if (resultData.error) logToTerminal(`Błąd: ${resultData.error}`, "error");
      else {
        logToTerminal(resultData.message, "sys");
        if (resultData.fileName) currentFileName = resultData.fileName;
      }
    });
    eventSource.onerror = (err) => {
      console.error("SSE Error:", err);
    };
  }
  connectLogs();

  document.getElementById("scrapeForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const mode = document.querySelector('input[name="searchMode"]:checked').value;
    let targetUrl = "",
      query = "";
    if (mode === "category") {
      const selectedName = categoryInput.value.trim();
      if (!selectedName) return alert("Wybierz kategorię!");
      const matchedCategory = allCategories.find((c) => c.name === selectedName);
      if (!matchedCategory) return alert("Nieprawidłowa kategoria.");
      targetUrl = matchedCategory.url;
    } else {
      query = phraseInput.value.trim();
      if (!query) return alert("Wpisz frazę wyszukiwania!");
    }
    startBtn.disabled = true;
    startBtn.style.display = "none";
    stopBtn.style.display = "block";
    logsTerminal.innerHTML = "";
    scrapedData = [];
    renderTable([]);
    resultsSection.classList.add("hidden");
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          query: query,
          requireDelivery: requireDeliveryCheckbox.checked,
          filterName: searchQueryInput.value.trim(),
          filterMinPrice: mainMinPriceInput.value,
          filterMaxPrice: mainMaxPriceInput.value,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Błąd");
      }
      logToTerminal("Wysłano żądanie. Trwa przetwarzanie...", "sys");
    } catch (err) {
      logToTerminal(`Błąd: ${err.message}`, "error");
      startBtn.disabled = false;
      startBtn.style.display = "block";
      stopBtn.style.display = "none";
    }
  });

  stopBtn.addEventListener("click", async () => {
    stopBtn.disabled = true;
    logToTerminal("Wysyłanie żądania przerwania...", "sys");
    try {
      await fetch("/api/abort", { method: "POST" });
    } catch (err) {
      logToTerminal(`Błąd: ${err.message}`, "error");
      stopBtn.disabled = false;
    }
  });

  downloadBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (scrapedData.length === 0) return alert("Brak danych!");
    const blob = new Blob([JSON.stringify(scrapedData, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = currentFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  function logToTerminal(msg, type = "normal") {
    const p = document.createElement("p");
    p.textContent = msg;
    if (type === "sys") p.className = "sys-msg";
    if (type === "error") p.className = "error-msg";
    logsTerminal.appendChild(p);
    logsTerminal.scrollTop = logsTerminal.scrollHeight;
  }

  function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
