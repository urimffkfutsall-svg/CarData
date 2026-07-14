import { createClient } from "@vercel/kv";

// Ruajtja qendrore e të dhënave. Punon me Vercel KV native OSE me Upstash Redis (Marketplace),
// duke lexuar cilëndo grup variablash që ekziston.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const kv = url && token ? createClient({ url, token }) : null;

const KEY = "cardata-db";

export default async function handler(req, res) {
  try {
    if (!kv) {
      // KV nuk është konfiguruar ende — frontend-i bie te localStorage.
      return res.status(200).json({ ok: false, error: "KV not configured" });
    }
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
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
