const puppeteer = require("puppeteer");

const SELECTORS = {
  cookieBtn: "#onetrust-accept-btn-handler",
  paginationItem: '[data-testid="pagination-list-item"]',
  card: '[data-testid="l-card"]',
  deliveryBadge: '[data-testid="card-delivery-badge"]',
  titleContainer: '[data-testid="ad-card-title"]',
  price: '[data-testid="ad-price"]',
};

const delay = (time) => new Promise((resolve) => setTimeout(resolve, time));

function parsePrice(priceString) {
  if (!priceString) return null;
  const digits = priceString.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : null;
}

/**
 * Runs the scraper for a specific category URL.
 * @param {string} url - The URL to scrape
 * @param {string} categoryName - A safe name for the category
 * @param {Object} filters - Search filters { filterName, minPrice, maxPrice }
 * @param {Function} onProgress - Callback function to emit logs
 * @param {Function} onItemFound - Callback function to emit new items as they are scraped
 * @param {Object} abortSignal - Object containing { isAborted: boolean }
 * @returns {Promise<{ data: any[] }>}
 */
async function runScraper(
  url,
  categoryName,
  filters = {},
  onProgress = console.log,
  onItemFound = () => {},
  abortSignal = { isAborted: false }
) {
  onProgress("Startuję przeglądarkę...");
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

    let activeUrl = url;

    onProgress(`\n=== KATEGORIA: ${categoryName} ===`);
    let allItems = [];

    onProgress(`Otwieram: ${activeUrl}`);
    await page.goto(activeUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

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

    onProgress(`Planowana liczba stron: ${maxPages}`);

    for (let i = 1; i <= maxPages; i++) {
      if (abortSignal.isAborted) {
        onProgress("Zatrzymano scrapowanie na żądanie użytkownika.");
        break;
      }

      const pageUrl = i === 1 ? activeUrl : `${activeUrl}?page=${i}`;
      onProgress(`Scrapuję stronę ${i}/${maxPages}...`);

      try {
        if (i > 1) await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForSelector(SELECTORS.card, { timeout: 15000 });
      } catch (err) {
        onProgress(`Błąd strony ${i}: ${err.message}`);
        continue;
      }

      const itemsOnPage = await page.evaluate(
        (selectors, minPrice, maxPrice, filterName) => {
          const cards = Array.from(document.querySelectorAll(selectors.card));
          const results = [];

          function parsePriceInternal(priceString) {
            if (!priceString) return null;
            const withoutCents = priceString.split(/[,.]/)[0];
            const digits = withoutCents.replace(/\D/g, "");
            return digits ? parseInt(digits, 10) : null;
          }

          cards.forEach((card) => {
            const titleContainer = card.querySelector(selectors.titleContainer);
            const priceEl = card.querySelector(selectors.price);

            if (titleContainer && priceEl) {
              const anchor = titleContainer.querySelector("a");
              const titleEl = titleContainer.querySelector("h4");

              if (anchor && titleEl) {
                const fullUrl = anchor.href.startsWith("http")
                  ? anchor.href
                  : `https://www.olx.pl${anchor.getAttribute("href")}`;

                const titleText = titleEl.innerText.trim();
                const rawPrice = priceEl.innerText.trim();
                const parsedPrice = parsePriceInternal(rawPrice);

                let isMatch = true;

                // Price filter
                if (parsedPrice !== null) {
                  if (minPrice !== null && parsedPrice < minPrice) isMatch = false;
                  if (maxPrice !== null && parsedPrice > maxPrice) isMatch = false;
                } else if (minPrice !== null || maxPrice !== null) {
                  isMatch = false;
                }

                // Name filter
                if (filterName && !titleText.toLowerCase().includes(filterName)) {
                  isMatch = false;
                }

                if (isMatch) {
                  results.push({
                    title: titleText,
                    price: rawPrice,
                    priceParsed: parsedPrice,
                    url: fullUrl,
                  });
                }
              }
            }
          });
          return results;
        },
        SELECTORS,
        filters.minPrice !== undefined ? filters.minPrice : null,
        filters.maxPrice !== undefined ? filters.maxPrice : null,
        filters.filterName || null
      );

      const newUniqueItems = itemsOnPage.filter(
        (newItem) => !allItems.some((existingItem) => existingItem.url === newItem.url)
      );

      if (newUniqueItems.length > 0) {
        allItems = allItems.concat(newUniqueItems);
        onItemFound(newUniqueItems);
      }

      onProgress(
        `   -> Pasujących na tej stronie: ${newUniqueItems.length}. Zebrano razem: ${allItems.length}.`
      );

      await delay(500 + Math.random() * 1500);
    }

    onProgress("Scrapowanie zakończone pomyślnie.");
    return { data: allItems };
  } catch (criticalError) {
    onProgress(`\n!!! KRYTYCZNY BŁĄD PROGRAMU !!!\n${criticalError.message}`);
    throw criticalError;
  } finally {
    if (browser) {
      onProgress("Zamykam przeglądarkę...");
      await browser.close();
    }
  }
}

module.exports = {
  runScraper,
  parsePrice,
};
