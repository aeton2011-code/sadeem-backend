// api/analyze-store.js

const fetch = require("node-fetch");

module.exports = async (req, res) => {
  // نسمح فقط بالـ POST
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ ok: false, error: "Invalid JSON" });
    }
  }

  const url = body?.url;
  if (!url) {
    return res.status(400).json({ ok: false, error: "Missing URL" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "Missing GEMINI_API_KEY" });
  }

  try {
    // 1️⃣ نطلب Screenshot من Browserless (رهيبين ومجاني)
    const screenshot = await fetch(
      "https://chrome.browserless.io/screenshot?token=demo", // free public demo token
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          options: {
            fullPage: true,
            waitFor: "networkidle2"
          }
        })
      }
    );

    const base64Image = await screenshot.text(); // Browserless يرجع Base64 مباشر

    // 2️⃣ نرسل الصورة لـ Gemini
    const prompt = `
      أنت خبير تحسين متاجر إلكترونية (CRO + UX + تسويق).
      حلّل صفحة المتجر من حيث وضوح العرض، الثقة، تجربة المستخدم،
      الـ CTA، سرعة الفهم، العناصر المشتتة.
      أرجع النتيجة بصيغة JSON نصّي يحتوي:
      summary, issues, recommendations, seo_score, ux_score, trust_score.
    `;

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" + apiKey,
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
                    data: base64Image.replace("data:image/png;base64,", "")
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
      geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || "No output.";

    return res.status(200).json({
      ok: true,
      analysis_text: text,
      raw: geminiJson
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};
