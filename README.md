# OLX Scraper

A robust Node.js web scraper that collects listings for computer components (like CPUs and GPUs) from OLX.pl and automatically pushes the data to an n8n webhook. It uses [Puppeteer](https://pptr.dev/) for browser automation and is equipped with modern JavaScript tooling.

## Features

- **Automated Data Extraction**: Scrapes product titles, prices, and URLs from specified OLX categories.
- **Price Parsing**: Automatically parses raw price strings (e.g., `"800 zł"`) into numeric values (`800`) for easier filtering and sorting downstream.
- **Dynamic Payloads**: Automatically structures the scraped data based on your defined categories and sends it to your n8n webhook.
- **Resilience**: Features automatic retries, cookie consent handling, and graceful browser shutdowns.
- **Headless Chrome**: Optimized Puppeteer settings for minimal memory usage and stealthy scraping.
- **Code Quality Tools**: Configured with ESLint, Prettier, and Jest for testing.

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/placq/olx_scraper.git
   cd olx_scraper
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your environment variables:
   Create a `.env` file in the root of the project and add your n8n webhook URL:
   ```env
   WEBHOOK_URL=https://your-n8n-instance.com/webhook/your-uuid
   ```
   *(If not provided, it falls back to a hardcoded default).*

## Usage

Start the scraper manually:

```bash
node olx_scraper.js
```

### Adding New Categories
To scrape additional categories, simply add them to the `CATEGORIES` array in `olx_scraper.js`:

```javascript
const CATEGORIES = [
  { name: "procesory", url: "https://www.olx.pl/..." },
  { name: "karty_graficzne", url: "https://www.olx.pl/..." },
  { name: "nowa_kategoria", url: "https://www.olx.pl/..." } // <-- Add here
];
```
The scraper will automatically collect data for the new category and include it in the n8n payload under the key `nowa_kategoria`.

## Development & Tooling

This project includes several tools to maintain code quality:

- **Run Tests:**
  ```bash
  npm test
  ```

- **Lint Code (ESLint):**
  ```bash
  npm run lint
  ```

- **Format Code (Prettier):**
  ```bash
  npm run format
  ```

## License
ISC
