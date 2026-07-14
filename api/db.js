import { kv } from "@vercel/kv";

// Ruajtja qendrore e të dhënave në Vercel KV. E gjithë baza ruhet si një objekt JSON nën një çelës.
const KEY = "cardata-db";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const data = await kv.get(KEY);
      return res.status(200).json({ ok: true, data: data || null });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      await kv.set(KEY, body);
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    // Nëse KV nuk është konfiguruar ende, kthe ok:false që frontend-i të bjerë te localStorage.
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
