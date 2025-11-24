const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Render Puppeteer is running" });
});

// الوظيفة الرئيسية
app.post("/screenshot", async (req, res) => {
  try {
    const url = req.body?.url;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ ok: false, error: "Missing URL" });
    }

    console.log("Capturing screenshot for:", url);

    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1500 });

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    const screenshot = await page.screenshot({
      fullPage: true,
      type: "png"
    });

    await browser.close();

    return res.status(200).json({
      ok: true,
      screenshot_base64: screenshot.toString("base64")
    });

  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Running on port " + PORT);
});
