# AGENTS.md - OLX Scraper Project

## Project Overview

This is a Node.js web scraper that collects listings from OLX.pl (Polish marketplace) for computer components (CPUs, GPUs) and sends them to an n8n webhook. The scraper uses Puppeteer for browser automation.

## Build & Running Commands

### Installation

```bash
npm install
```

### Running the Scraper

```bash
node olx_scraper.js
```

### Testing

```bash
npm test
```

**Note:** Currently no tests are configured. The default test script echoes an error.

### Running a Single Test

To run a single test, add a test framework first:

```bash
npm install --save-dev jest
```

Then add to package.json:

```json
"test": "jest",
"test:watch": "jest --watch",
"test:coverage": "jest --coverage"
```

Run a single test file: `npx jest tests/filename.test.js`
Run a single test: `npx jest --testNamePattern="test name"`

### Linting

No linter is currently configured. Recommended setup:

```bash
npm install --save-dev eslint
npx eslint --init
```

Run linting: `npx eslint .`

### Formatting

No formatter is currently configured. Recommended setup:

```bash
npm install --save-dev prettier
```

Run formatting: `npx prettier --write .`

## Code Style Guidelines

### General Principles

- This is a CommonJS project (`"type": "commonjs"` in package.json)
- Use `require()` for imports, not ES modules (`import`/`export`)
- Keep code simple and readable - this is a utility script, not a large application
- Add comments for complex logic, especially in Polish (as the project uses Polish comments)

### Naming Conventions

- **Variables/Functions**: camelCase (e.g., `getLatestFile`, `sendToN8N`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `WEBHOOK_URL`, `CATEGORIES`)
- **Files**: snake_case (e.g., `olx_scraper.js`)
- **JSON output keys**: snake_case (e.g., `karty_graficzne`)

### Imports

```javascript
// Order: built-in Node modules first, then external packages
const fs = require("fs");
const path = require("path");
const https = require("https");
const puppeteer = require("puppeteer");
```

### Formatting

- Use 2 spaces for indentation
- Use double quotes for strings (consistent with existing code)
- Add space after comma: `const arr = [1, 2, 3]`
- Use semicolons at end of statements
- Max line length: 100 characters (soft guideline)

### Types

- No TypeScript - plain JavaScript only
- Use JSDoc comments for function documentation when helpful:

```javascript
/**
 * Gets the latest file matching a pattern in a directory
 * @param {string} dir - Directory path
 * @param {string} pattern - Pattern to match in filename
 * @returns {string|null} Path to latest file or null
 */
```

### Error Handling

- Use try/catch for async operations
- Log errors with descriptive messages in Polish (following project convention)
- Use meaningful error messages: `console.error("Błąd podczas wysyłki:", sendError.message)`
- Handle critical errors separately from recoverable ones

### File Structure

```
olx_scraper/
├── olx_scraper.js    # Main entry point
├── package.json      # Dependencies
├── wyniki/           # Output JSON files (auto-generated)
└── node_modules/
```

### Data Formats

- Output JSON files: `YYYY_MM_DD_category.json`
- Keys: `title`, `price`, `url`
- All strings should be trimmed

### Puppeteer Best Practices

- Always set User-Agent header
- Use request interception to block unnecessary resources (images, fonts, media)
- Add delays between requests (500-2000ms random delay)
- Use `protocolTimeout` for long-running operations
- Always close browser in finally block or at end of function
- Handle cookie consent modals gracefully

### Security

- Never commit secrets (webhook URLs, API keys) - they are hardcoded but this should be moved to environment variables
- Consider using `process.env.WEBHOOK_URL` instead of hardcoded URL
- Add `.env` to `.gitignore`

### Common Tasks

#### Adding a new category

Add to CATEGORIES array in `olx_scraper.js`:

```javascript
{
  name: "nazwa_kategorii",
  url: "https://www.olx.pl/...",
}
```

#### Running in headful mode (for debugging)

Change `headless: "new"` to `headless: false` in puppeteer.launch() options.

#### Modifying selectors

OLX may change their HTML structure. Update selectors in:

- `waitForSelector()` calls
- `page.evaluate()` queries (e.g., `[data-testid="l-card"]`)

## Dependencies

- **puppeteer**: ^24.33.0 - Browser automation

## Output

Results are saved to `wyniki/` directory as JSON files with format:

```json
[
  {
    "title": "Intel Core i7-12700KF",
    "price": "800 zł",
    "url": "https://www.olx.pl/d/oferta/..."
  }
]
```
