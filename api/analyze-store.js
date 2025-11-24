// api/analyze-store.js
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

/**
 * POST /api/analyze-store
 * body: { "url": "https://example.com" }
 */
module.exports = async (req, res) => {
  // نسمح فقط بالـ POST
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // نحاول نقرأ البودي (سواء جاه كـ object أو string)
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch (e) {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }
  }

  const url = body?.url;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ ok: false, error: "Field 'url' is required" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "Missing GEMINI_API_KEY" });
  }

  let browser;

  try {
    // تشغيل Puppeteer على Vercel (باستخدام @sparticuz/chromium)
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    const screenshotBuffer = await page.screenshot({
      type: "png",
      fullPage: true
    });

    await browser.close();
    browser = null;

    const base64Image = screenshotBuffer.toString("base64");

    // نرسل الصورة لـ Gemini
    const prompt =
      "أنت خبير تحسين متاجر إلكترونية (CRO + UX + تسويق). "\
      + "حلّل صفحة المتجر من حيث: وضوح العرض، الثقة، تجربة المستخدم، "\
      + "الـ CTA، سرعة الفهم، العناصر المشتتة، واقترح تحسينات عملية. "\
      + "أرسل النتيجة كـ JSON نصّي بالمفاتيح التالية فقط: "
      + "summary, issues, recommendations, seo_score, ux_score, trust_score.";

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        "gemini-1.5-flash-latest:generateContent?key=" +
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

    const geminiJson = await geminiResponse.json();

    const text =
      geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // نرجع النص الخام، وأنت في سديم بعدين تفسره أو تحوله JSON حقيقي
    return res.status(200).json({
      ok: true,
      analysis_text: text,
      raw: geminiJson
    });
  } catch (err) {
    console.error(err);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
    return res.status(500).json({
      ok: false,
      error: err.message || "Unexpected error"
    });
  }
};
