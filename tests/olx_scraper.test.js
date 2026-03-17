const fs = require("fs");
const path = require("path");
const { parsePrice, getLatestFile } = require("../olx_scraper");

describe("parsePrice", () => {
  it("should parse standard price correctly", () => {
    expect(parsePrice("800 zł")).toBe(800);
  });

  it("should handle spaces in large numbers", () => {
    expect(parsePrice("1 200 zł")).toBe(1200);
    expect(parsePrice("12 500 zł")).toBe(12500);
  });

  it("should handle price with decimal points by extracting all digits (assuming whole numbers for simplicity)", () => {
    // Note: OLX usually displays whole numbers for components, but if it has decimals "800,50 zł" -> 80050.
    // The current implementation strips all non-digits. This test ensures we know its behavior.
    expect(parsePrice("800,50 zł")).toBe(80050);
  });

  it("should return null for empty string or null", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice(null)).toBeNull();
  });

  it("should return null if no digits are present", () => {
    expect(parsePrice("Za darmo")).toBeNull();
  });
});

describe("getLatestFile", () => {
  const testDir = path.join(__dirname, "temp_wyniki");

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.readdirSync(testDir).forEach((file) => fs.unlinkSync(path.join(testDir, file)));
      fs.rmdirSync(testDir);
    }
  });

  beforeEach(() => {
    // Clean up directory before each test
    fs.readdirSync(testDir).forEach((file) => fs.unlinkSync(path.join(testDir, file)));
  });

  it("should return null if directory does not exist", () => {
    expect(getLatestFile(path.join(__dirname, "nonexistent"), "procesory")).toBeNull();
  });

  it("should return null if no files match the pattern", () => {
    fs.writeFileSync(path.join(testDir, "2023_01_01_other.json"), "[]");
    expect(getLatestFile(testDir, "procesory")).toBeNull();
  });

  it("should return the latest file based on alphabetical sorting (date format YYYY_MM_DD)", () => {
    fs.writeFileSync(path.join(testDir, "2023_01_01_procesory.json"), "[]");
    fs.writeFileSync(path.join(testDir, "2023_01_03_procesory.json"), "[]");
    fs.writeFileSync(path.join(testDir, "2023_01_02_procesory.json"), "[]");

    const latest = getLatestFile(testDir, "procesory");
    expect(latest).toBe(path.join(testDir, "2023_01_03_procesory.json"));
  });

  it("should only match files ending with .json", () => {
    fs.writeFileSync(path.join(testDir, "2023_01_03_procesory.txt"), "");
    fs.writeFileSync(path.join(testDir, "2023_01_01_procesory.json"), "[]");

    const latest = getLatestFile(testDir, "procesory");
    expect(latest).toBe(path.join(testDir, "2023_01_01_procesory.json"));
  });
});
