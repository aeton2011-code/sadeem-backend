// api/analyze-store.js

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON" });
    }
  }

  const url = body?.url;
  if (!url) {
    return res.status(400).json({ ok: false, error: "URL is required" });
  }

  const PSI_KEY = process.env.GEMINI_API_KEY;
  if (!PSI_KEY) {
    return res.status(500).json({ ok: false, error: "Missing GEMINI_API_KEY" });
  }

  try {
    // طلب PageSpeed Insights للحصول على screenshot + lighthouse + DOM
    const psiRes = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&screenshot=true&strategy=mobile&key=${PSI_KEY}`
    );

    const psiJson = await psiRes.json();

    const screenshot =
      psiJson?.lighthouseResult?.audits?.["final-screenshot"]?.details?.data || null;

    const lighthouse = psiJson?.lighthouseResult || {};

    // نرسل للـ Gemini تحليل مع screenshot
    const geminiPrompt = `
أنت خبير CRO و UX وتجربة مستخدم.
حلل هذا المتجر بناءً على البيانات التالية:
- أداء الموقع
- Screenshot
- Lighthouse Audits
- المشاكل التقنية
- وضوح العرض
- الثقة
- الـ CTA
- سهولة الشراء

أعطني النتيجة بصيغة JSON تحتوي فقط:
summary, issues, recommendations, ux_score, trust_score, performance_score
`;

    const geminiReq = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${PSI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: geminiPrompt },
                screenshot
                  ? { inline_data: { mime_type: "image/jpeg", data: screenshot.split(",")[1] } }
                  : { text: "No screenshot available" },
                { text: JSON.stringify(lighthouse).slice(0, 20000) }
              ]
            }
          ]
        })
      }
    );

    const geminiJson = await geminiReq.json();

    const analysis =
      geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || "No output";

    return res.status(200).json({
      ok: true,
      analysis,
      raw_lighthouse: lighthouse
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
