export default async function handler(req, res) {
  try {
    const GAS = process.env.GAS_WEBAPP_URL;
    if (!GAS) return res.status(500).json({ error: "Missing env: GAS_WEBAPP_URL" });

    const r = await fetch(`${GAS}?action=sheets`);
    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: "Upstream error", detail: text });

    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
