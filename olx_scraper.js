const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const https = require("https");
require("dotenv").config();

const SELECTORS = {
  cookieBtn: "#onetrust-accept-btn-handler",
  paginationItem: '[data-testid="pagination-list-item"]',
  card: '[data-testid="l-card"]',
  deliveryBadge: '[data-testid="card-delivery-badge"]',
  titleContainer: '[data-testid="ad-card-title"]',
  price: '[data-testid="ad-price"]',
};

const CATEGORIES = [
  {
    name: "procesory",
    url: "https://www.olx.pl/elektronika/komputery/podzespoly-i-czesci/procesory/",
  },
  {
    name: "karty_graficzne",
    url: "https://www.olx.pl/elektronika/komputery/podzespoly-i-czesci/karty-graficzne/",
  },
];

const WEBHOOK_URL = process.env.WEBHOOK_URL;

const delay = (time) => new Promise((resolve) => setTimeout(resolve, time));

async function sendToN8N(data) {
  return new Promise((resolve, reject) => {
    const url = new URL(WEBHOOK_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => (responseBody += chunk));
      res.on("end", () => resolve(responseBody));
    });

    req.on("error", (err) => reject(err));
    req.write(JSON.stringify(data));
    req.end();
  });
}

function getLatestFile(dir, pattern) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.includes(pattern) && f.endsWith(".json"))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(dir, files[0]) : null;
}

function parsePrice(priceString) {
  if (!priceString) return null;
  // Extract all digits from the string
  const digits = priceString.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : null;
}

async function runScraper() {
  if (!WEBHOOK_URL) {
    console.error("BŁĄD: Zmienna środowiskowa WEBHOOK_URL nie jest ustawiona.");
    console.error("Skopiuj plik .env.example do .env i ustaw swój URL webhooka.");
    process.exit(1);
  }

  console.log("Startuję przeglądarkę...");
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      protocolTimeout: 240000,
      defaultViewport: { width: 1920, height: 1080 },
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const resourceType = req.resourceType();
      if (["image", "media", "font", "other"].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    const dir = "./wyniki";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    for (const category of CATEGORIES) {
      console.log(`\n=== KATEGORIA: ${category.name} ===`);
      let allItems = [];

      const date = new Date();
      const fileName = `${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, "0")}_${String(date.getDate()).padStart(2, "0")}_${category.name}.json`;
      const filePath = path.join(dir, fileName);

      if (fs.existsSync(filePath)) {
        try {
          const existingData = fs.readFileSync(filePath, "utf8");
          allItems = JSON.parse(existingData);
          console.log(`Wczytano istniejące ${allItems.length} rekordów z pliku.`);
        } catch {
          console.log("Plik uszkodzony. Zaczynamy od nowa.");
        }
      }

      await page.goto(category.url, { waitUntil: "domcontentloaded", timeout: 60000 });

      try {
        const cookieBtn = await page.waitForSelector(SELECTORS.cookieBtn, { timeout: 4000 });
        if (cookieBtn) await cookieBtn.click();
      } catch {
        // Ignored
      }

      let maxPages = 1;
      try {
        await page.waitForSelector(SELECTORS.paginationItem, { timeout: 5000 });
        maxPages = await page.evaluate((selector) => {
          const items = document.querySelectorAll(selector);
          if (items.length === 0) return 1;
          const lastItem = items[items.length - 1];
          return parseInt(lastItem.innerText, 10) || 1;
        }, SELECTORS.paginationItem);
      } catch {
        // Ignored
      }

      console.log(`Planowana liczba stron: ${maxPages}`);

      for (let i = 1; i <= maxPages; i++) {
        const pageUrl = i === 1 ? category.url : `${category.url}?page=${i}`;
        console.log(`Scrapuję stronę ${i}/${maxPages}...`);

        try {
          if (i > 1) await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
          await page.waitForSelector(SELECTORS.card, { timeout: 15000 });
        } catch (err) {
          console.error(`Błąd strony ${i}: ${err.message}`);
          continue;
        }

        const itemsOnPage = await page.evaluate((selectors) => {
          const cards = Array.from(document.querySelectorAll(selectors.card));
          const results = [];

          function parsePriceInternal(priceString) {
            if (!priceString) return null;
            const digits = priceString.replace(/\D/g, "");
            return digits ? parseInt(digits, 10) : null;
          }

          cards.forEach((card) => {
            const hasDelivery = card.querySelector(selectors.deliveryBadge);
            if (hasDelivery) {
              const titleContainer = card.querySelector(selectors.titleContainer);
              const priceEl = card.querySelector(selectors.price);
              if (titleContainer && priceEl) {
                const anchor = titleContainer.querySelector("a");
                const titleEl = titleContainer.querySelector("h4");
                if (anchor && titleEl) {
                  const fullUrl = anchor.href.startsWith("http")
                    ? anchor.href
                    : `https://www.olx.pl${anchor.getAttribute("href")}`;

                  const rawPrice = priceEl.innerText.trim();

                  results.push({
                    title: titleEl.innerText.trim(),
                    price: rawPrice,
                    priceParsed: parsePriceInternal(rawPrice),
                    url: fullUrl,
                  });
                }
              }
            }
          });
          return results;
        }, SELECTORS);

        const newUniqueItems = itemsOnPage.filter(
          (newItem) => !allItems.some((existingItem) => existingItem.url === newItem.url)
        );

        allItems = allItems.concat(newUniqueItems);
        fs.writeFileSync(filePath, JSON.stringify(allItems, null, 2));
        console.log(`   -> Nowych: ${newUniqueItems.length}. Razem: ${allItems.length}.`);

        await delay(500 + Math.random() * 1500);
      }
    }

    await browser.close();

    console.log("\nPrzygotowywanie danych do n8n...");

    const payload = {
      timestamp: new Date().toISOString(),
    };

    for (const category of CATEGORIES) {
      const latestFile = getLatestFile(dir, category.name);
      payload[category.name] = latestFile ? JSON.parse(fs.readFileSync(latestFile, "utf8")) : [];
    }

    console.log("Wysyłam dane do n8n...");
    try {
      const response = await sendToN8N(payload);
      console.log("Sukces! n8n odpowiedziało:", response);
    } catch (sendError) {
      console.error("Błąd podczas wysyłki do n8n:", sendError.message);
    }

    console.log("Koniec pracy.");
  } catch (criticalError) {
    console.error("\n!!! KRYTYCZNY BŁĄD PROGRAMU !!!");
    console.error(criticalError);
  } finally {
    if (browser) {
      console.log("Zamykam przeglądarkę...");
      await browser.close();
    }
  }
}

if (require.main === module) {
  runScraper();
}

module.exports = {
  parsePrice,
  getLatestFile,
};
