const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { chromium } = require("@playwright/browser-chromium");


const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "20mb" }));

// Health check
app.get("/", (req, res) => {
  res.json({ ok: true, message: "Playwright Store Analyzer backend is running" });
});

// ANALYZE ENDPOINT
app.post("/analyze", async (req, res) => {
  const url = req.body?.url;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ ok: false, error: "Field 'url' is required" });
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    // JS Errors
    const jsErrors = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    // Console Errors
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Network Requests
    const networkRequests = [];
    const failedRequests = [];

    page.on("request", (req) => {
      networkRequests.push({
        url: req.url(),
        method: req.method(),
        resourceType: req.resourceType()
      });
    });

    page.on("requestfailed", (req) => {
      failedRequests.push({
        url: req.url(),
        failure: req.failure() ? req.failure().errorText : "unknown"
      });
    });

    await page.setViewportSize({ width: 1280, height: 1800 });
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const html = await page.content();
    const title = await page.title();

    // Performance Metrics
    const perf = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const paints = performance.getEntriesByType("paint") || [];

      const fcp = paints.find((x) => x.name === "first-contentful-paint");

      return {
        ttfb: nav ? nav.responseStart : null,
        domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
        loadEvent: nav ? nav.loadEventEnd : null,
        fcp: fcp ? fcp.startTime : null
      };
    });

    await browser.close();
    browser = null;

    return res.json({
      ok: true,
      meta: { url, title },

      screenshot_base64: screenshotBuffer.toString("base64"),
      html,

      performance: perf,
      errors: {
        jsErrors,
        consoleErrors,
        failedRequests
      },
      network: {
        totalRequests: networkRequests.length,
        failed: failedRequests.length
      }
    });
  } catch (err) {
    console.error("ANALYZER ERROR:", err);
    if (browser) try { await browser.close(); } catch {}
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Playwright Store Analyzer running on port ${PORT}`));
