const express = require("express");
const path = require("path");
const { EventEmitter } = require("events");
const fs = require("fs");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
require("dotenv").config(); // Load environment variables

const { runScraper } = require("./scraper");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const logEmitter = new EventEmitter();
let cachedCategories = null;

// File paths
const ENV_PATH = path.join(__dirname, ".env");
const SCHEDULES_PATH = path.join(__dirname, "schedules.json");

// Helper: Read/Write schedules
function getSchedules() {
  if (!fs.existsSync(SCHEDULES_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(SCHEDULES_PATH, "utf8"));
  } catch (e) {
    return [];
  }
}

function saveSchedules(schedules) {
  fs.writeFileSync(SCHEDULES_PATH, JSON.stringify(schedules, null, 2));
}

// Helper: Read/Write .env variables securely
function updateEnv(updates) {
  let envContent = "";
  if (fs.existsSync(ENV_PATH)) {
    envContent = fs.readFileSync(ENV_PATH, "utf8");
  }

  const envLines = envContent.split("\n");
  const envMap = {};

  envLines.forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) envMap[match[1]] = match[2];
  });

  Object.assign(envMap, updates);

  const newContent = Object.entries(envMap)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  fs.writeFileSync(ENV_PATH, newContent);

  // Reload process.env
  require("dotenv").config({ path: ENV_PATH, override: true });
}

function formatCategoryName(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return "Strona Główna";
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, " ")).join(" > ");
  } catch (e) {
    return url;
  }
}

// --- EMAIL & CRON LOGIC ---
const activeJobs = {}; // Store cron tasks by ID

function sendEmailReport(schedule, filteredResults) {
  if (filteredResults.length === 0) return;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_TO } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_TO) {
    console.error("Brak konfiguracji SMTP! Nie można wysłać emaila.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10) || 587,
    secure: parseInt(SMTP_PORT, 10) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  const tableRows = filteredResults
    .map(
      (item) => `
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;"><strong>${item.title}</strong></td>
      <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; color: #002f34;">${item.price}</td>
      <td style="border: 1px solid #ddd; padding: 8px;"><a href="${item.url}">Zobacz</a></td>
    </tr>
  `
    )
    .join("");

  const htmlContent = `
    <h2>Raport OLX Scraper: ${schedule.query || schedule.categoryName}</h2>
    <p>Znaleziono nowych przedmiotów spełniających kryteria: <strong>${filteredResults.length}</strong></p>
    <table style="border-collapse: collapse; width: 100%;">
      <tr style="background-color: #f2f2f2;">
        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Nazwa</th>
        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Cena</th>
        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Link</th>
      </tr>
      ${tableRows}
    </table>
  `;

  transporter.sendMail(
    {
      from: SMTP_FROM || SMTP_USER,
      to: SMTP_TO,
      subject: `OLX Raport: ${schedule.query || schedule.categoryName} (${filteredResults.length} ofert)`,
      html: htmlContent,
    },
    (err, info) => {
      if (err) console.error("Błąd wysyłania emaila:", err);
      else console.log("Email wysłany:", info.messageId);
    }
  );
}

async function runScheduledTask(schedule) {
  console.log(`[Harmonogram] Uruchamiam zadanie: ${schedule.id}`);
  try {
    let targetUrl = schedule.url;
    let categoryName = schedule.categoryName;

    const minPrice = parseInt(schedule.filterMinPrice, 10);
    const maxPrice = parseInt(schedule.filterMaxPrice, 10);

    const params = new URLSearchParams();
    if (schedule.requireDelivery) params.append("courier", "1");
    if (!isNaN(minPrice)) params.append("search[filter_float_price:from]", minPrice);
    if (!isNaN(maxPrice)) params.append("search[filter_float_price:to]", maxPrice);

    const paramsStr = params.toString();
    if (paramsStr) {
      targetUrl += (targetUrl.includes("?") ? "&" : "?") + paramsStr;
    }

    const filters = {
      filterName: schedule.filterName ? schedule.filterName.trim().toLowerCase() : null,
      minPrice: isNaN(minPrice) ? undefined : minPrice,
      maxPrice: isNaN(maxPrice) ? undefined : maxPrice,
    };

    const result = await runScraper(
      targetUrl,
      categoryName,
      filters,
      () => {},
      () => {}
    );

    console.log(`[Harmonogram] Znaleziono po filtrach: ${result.data.length}. Wysyłam maila...`);
    sendEmailReport(schedule, result.data);
  } catch (error) {
    console.error(`[Harmonogram] Błąd zadania ${schedule.id}:`, error);
  }
}

function registerCronJobs() {
  // Stop existing
  Object.values(activeJobs).forEach((job) => job.stop());

  const schedules = getSchedules();
  schedules.forEach((schedule) => {
    if (!schedule.enabled) return;

    // Parse time "HH:MM" -> cron "MM HH * * DAYS"
    const [hh, mm] = schedule.time.split(":");
    const daysStr = (schedule.days || []).join(",");
    const cronStr = `${mm} ${hh} * * ${daysStr || "*"}`;

    activeJobs[schedule.id] = cron.schedule(cronStr, () => {
      runScheduledTask(schedule);
    });
    console.log(`Zarejestrowano harmonogram [${schedule.id}] na: ${cronStr}`);
  });
}

// Initial cron setup
registerCronJobs();

// --- API ENDPOINTS ---

app.get("/api/categories", async (req, res) => {
  if (cachedCategories) return res.json(cachedCategories);

  try {
    const response = await fetch("https://www.olx.pl/sitemap-categories.xml", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/xml, text/xml, */*",
      },
    });

    if (!response.ok) throw new Error(`Błąd HTTP: ${response.status}`);
    const xmlText = await response.text();
    const locRegex = /<loc>(https:\/\/www\.olx\.pl\/.*?)<\/loc>/g;

    const urls = [...xmlText.matchAll(locRegex)].map((match) => match[1]);
    const categories = urls
      .filter((u) => u !== "https://www.olx.pl/")
      .map((u) => ({ url: u, name: formatCategoryName(u) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    cachedCategories = categories;
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: "Nie udało się pobrać kategorii z OLX" });
  }
});

// Store abort signal globally for the active manual scrape job
let activeManualScrape = { isAborted: false };

app.post("/api/scrape", async (req, res) => {
  const { url, query, requireDelivery, filterName, filterMinPrice, filterMaxPrice } = req.body;
  if (!url && !query)
    return res.status(400).json({ error: "Wymagany jest url lub fraza (query)." });

  let targetUrl = "";
  let categoryName = "";

  if (query) {
    const encodedQuery = encodeURIComponent(query.trim().replace(/\s+/g, "-"));
    targetUrl = `https://www.olx.pl/oferty/q-${encodedQuery}/`;
    categoryName = `wyszukiwanie_${query.trim().replace(/\s+/g, "_")}`;
  } else {
    targetUrl = url;
    categoryName = formatCategoryName(url)
      .replace(/\s*>\s*/g, "_")
      .replace(/\s+/g, "_")
      .toLowerCase();
  }

  const minPrice = parseInt(filterMinPrice, 10);
  const maxPrice = parseInt(filterMaxPrice, 10);

  // Add courier parameter and price filters to targetUrl
  const params = new URLSearchParams();
  if (requireDelivery) params.append("courier", "1");
  if (!isNaN(minPrice)) params.append("search[filter_float_price:from]", minPrice);
  if (!isNaN(maxPrice)) params.append("search[filter_float_price:to]", maxPrice);

  const paramsStr = params.toString();
  if (paramsStr) {
    targetUrl += (targetUrl.includes("?") ? "&" : "?") + paramsStr;
  }

  // Reset abort signal and set running flag
  activeManualScrape.isAborted = false;
  activeManualScrape.isRunning = true;

  const filters = {
    filterName: filterName ? filterName.trim().toLowerCase() : null,
    // minPrice and maxPrice are now handled by OLX URL directly,
    // but we can pass them down just in case or remove them from internal filtering.
    // Keeping them to be safe against OLX sponsored items.
    minPrice: isNaN(minPrice) ? undefined : minPrice,
    maxPrice: isNaN(maxPrice) ? undefined : maxPrice,
  };

  res.json({ message: "Scrapowanie rozpoczęte!", targetUrl, categoryName });
  logEmitter.emit("log", `\n=== ROZPOCZĘTO NOWE ZADANIE ===\nCel: ${targetUrl}`);

  try {
    await runScraper(
      targetUrl,
      categoryName,
      filters,
      (msg) => logEmitter.emit("log", msg),
      (newItems) => logEmitter.emit("items", newItems),
      activeManualScrape
    );

    if (activeManualScrape.isAborted) {
      logEmitter.emit("done", {
        message: "Scrapowanie zatrzymane przez użytkownika.",
        fileName: `${categoryName}_wyniki.json`,
      });
    } else {
      logEmitter.emit("done", {
        message: "Scrapowanie zakończone pomyślnie.",
        fileName: `${categoryName}_wyniki.json`,
      });
    }
  } catch (err) {
    logEmitter.emit("log", `Błąd: ${err.message}`);
    logEmitter.emit("done", { error: err.message });
  } finally {
    activeManualScrape.isRunning = false;
  }
});

app.get("/api/status", (req, res) => {
  res.json({ isRunning: !!activeManualScrape.isRunning });
});

app.post("/api/abort", (req, res) => {
  activeManualScrape.isAborted = true;
  res.json({ message: "Wysłano sygnał zatrzymania." });
});

app.get("/api/logs", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write("data: Połączono z logami serwera.\n\n");

  const logListener = (msg) => res.write(`event: log\ndata: ${msg}\n\n`);
  const itemsListener = (items) => res.write(`event: items\ndata: ${JSON.stringify(items)}\n\n`);
  const doneListener = (data) => res.write(`event: done\ndata: ${JSON.stringify(data)}\n\n`);

  logEmitter.on("log", logListener);
  logEmitter.on("items", itemsListener);
  logEmitter.on("done", doneListener);

  req.on("close", () => {
    logEmitter.off("log", logListener);
    logEmitter.off("items", itemsListener);
    logEmitter.off("done", doneListener);
  });
});

// SMTP CONFIG
app.get("/api/config/smtp", (req, res) => {
  res.json({
    SMTP_HOST: process.env.SMTP_HOST || "",
    SMTP_PORT: process.env.SMTP_PORT || "",
    SMTP_USER: process.env.SMTP_USER || "",
    SMTP_PASS: process.env.SMTP_PASS ? "********" : "", // Mask password
    SMTP_FROM: process.env.SMTP_FROM || "",
    SMTP_TO: process.env.SMTP_TO || "",
  });
});

app.post("/api/config/smtp", (req, res) => {
  const updates = req.body;
  if (updates.SMTP_PASS === "********") {
    delete updates.SMTP_PASS; // Don't override with mask
  }
  updateEnv(updates);
  res.json({ message: "Zapisano konfigurację SMTP." });
});

// SCHEDULES
app.get("/api/schedules", (req, res) => {
  res.json(getSchedules());
});

app.post("/api/schedules", (req, res) => {
  const schedules = getSchedules();
  const newSchedule = req.body;

  if (newSchedule.query) {
    const encodedQuery = encodeURIComponent(newSchedule.query.trim().replace(/\s+/g, "-"));
    newSchedule.url = `https://www.olx.pl/oferty/q-${encodedQuery}/`;
    newSchedule.categoryName = `wyszukiwanie_${newSchedule.query.trim().replace(/\s+/g, "_")}`;
  } else if (newSchedule.url) {
    newSchedule.categoryName = formatCategoryName(newSchedule.url)
      .replace(/\s*>\s*/g, "_")
      .replace(/\s+/g, "_")
      .toLowerCase();
  }

  if (newSchedule.id) {
    const idx = schedules.findIndex((s) => s.id === newSchedule.id);
    if (idx !== -1) schedules[idx] = newSchedule;
    else schedules.push(newSchedule);
  } else {
    newSchedule.id = Date.now().toString();
    newSchedule.enabled = true;
    schedules.push(newSchedule);
  }

  saveSchedules(schedules);
  registerCronJobs(); // Reload cron
  res.json(newSchedule);
});

app.delete("/api/schedules/:id", (req, res) => {
  const schedules = getSchedules().filter((s) => s.id !== req.params.id);
  saveSchedules(schedules);
  registerCronJobs();
  res.json({ message: "Usunięto zadanie." });
});

app.post("/api/schedules/:id/toggle", (req, res) => {
  const schedules = getSchedules();
  const schedule = schedules.find((s) => s.id === req.params.id);
  if (schedule) {
    schedule.enabled = !schedule.enabled;
    saveSchedules(schedules);
    registerCronJobs();
  }
  res.json({ message: "Zmieniono status." });
});

app.listen(PORT, () => {
  console.log(`Serwer Web UI uruchomiony! Otwórz w przeglądarce: http://localhost:${PORT}`);
});
