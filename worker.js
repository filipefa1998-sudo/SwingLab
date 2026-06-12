/**
 * SwingLab AI Coaching — Cloudflare Worker
 * --------------------------------------------------------------
 * Proxies tracked swing metrics to the Anthropic API and returns
 * written coaching, so your ANTHROPIC_API_KEY never touches the browser.
 *
 * DEPLOY
 *   1) npm i -g wrangler   (if needed)
 *   2) wrangler deploy worker.js --name swinglab-ai
 *   3) wrangler secret put ANTHROPIC_API_KEY   (paste your key)
 *   4) Copy the deployed URL (e.g. https://swinglab-ai.<you>.workers.dev)
 *      and paste it into SwingLab → "AI setup".
 *
 * SECURITY (optional, recommended)
 *   Lock CORS to your GitHub Pages origin by editing ALLOWED_ORIGIN below.
 */

const ALLOWED_ORIGIN = "*"; // e.g. "https://yourname.github.io"
const MODEL = "claude-sonnet-4-6"; // current Sonnet; pin to "claude-sonnet-4-6-20260218" if you prefer

const SYSTEM = `You are a veteran baseball hitting instructor reviewing markerless motion-capture metrics from a single swing.
The numbers come from in-browser pose estimation, so treat them as directional, not lab-grade. Be specific, encouraging, and concrete.
Never invent metrics you weren't given. Keep it tight: no preamble, no restating the numbers back.`;

function buildPrompt(m) {
  return `Swing metrics (markerless pose estimation):
${JSON.stringify(m, null, 2)}

Write coaching in exactly this shape:
1) One-line read on the swing overall.
2) The single biggest leak and WHY it costs the hitter (1–2 sentences).
3) Two prioritized cues or feels the hitter can take into their next round (short, coachable, not drill names).
Plain English. Under 130 words total.`;
}

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST")
      return json({ error: "POST only" }, 405, cors);

    try {
      const body = await request.json();
      const metrics = body && body.metrics ? body.metrics : body;
      if (!metrics) return json({ error: "No metrics provided." }, 400, cors);
      if (!env.ANTHROPIC_API_KEY)
        return json({ error: "Server missing ANTHROPIC_API_KEY. Run: wrangler secret put ANTHROPIC_API_KEY" }, 500, cors);

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 700,
          system: SYSTEM,
          messages: [{ role: "user", content: buildPrompt(metrics) }],
        }),
      });

      const data = await r.json();
      if (!r.ok) return json({ error: data.error ? data.error.message : "Anthropic API error", status: r.status }, 502, cors);

      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      return json({ text: text || "(no response)" }, 200, cors);
    } catch (e) {
      return json({ error: String(e) }, 500, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
