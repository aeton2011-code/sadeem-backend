const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "20mb" }));

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Store Analyzer Backend Running!" });
});

// ------------------------------
//  POST /analyze
// ------------------------------
app.post("/analyze", async (req, res) => {
  const url = req.body?.url;
  if (!url) {
    return res.status(400).json({ ok: false, error: "Missing 'url' field" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "Missing GEMINI_API_KEY" });
  }

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--single-process"
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    const screenshot = await page.screenshot({ type: "png", fullPage: true });
    await browser.close();
    browser = null;

    const base64Image = screenshot.toString("base64");

    const prompt =
      "أنت خبير CRO + UX + تسويق. حلّل هذه الصفحة من حيث الثقة، العرض، تجربة المستخدم، عناصر التشتت، والـ CTA. قدم الحلول بشكل JSON يحتوي: summary, issues, recommendations, seo_score, ux_score, trust_score.";

    const geminiResp = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
        apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: "image/png",
                    data: base64Image
                  }
                }
              ]
            }
          ]
        })
      }
    );

    const geminiJson = await geminiResp.json();
    const text =
      geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return res.json({
      ok: true,
      analysis_text: text,
      raw: geminiJson
    });
  } catch (err) {
    if (browser) await browser.close();
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ------------------------------

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log("Store Analyzer Backend running on port " + PORT)
);
