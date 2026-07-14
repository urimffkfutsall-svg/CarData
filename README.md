# CarData — Sistem menaxhimi për Rent a Car

Aplikacion për menaxhimin e firmave Rent a Car: firma, vetura, klientë, rezervime, kalendar, kontrata, fatura me TVSH, raporte, kuponë dhe shpenzime.

Të dhënat ruhen në dy nivele:
- **Lokalisht** (localStorage) — punon edhe pa internet (PWA).
- **Në server** (Vercel KV) — sinkronizim qendror mes pajisjeve, kur është i konfiguruar.

## 1) Zhvillim (dev)
```bash
npm install
npm run dev
```
Hapet te `http://localhost:5173`.

### Kredencialet demo
- **Superadmin:** `urimi1806` / `1806`
- **Admin firme:** `admin.autorent` / `admin123`
- **Punëtor:** `punetor1` / `puna123`

## 2) Ruajtja në Git (git-i yt)
Projekti vjen tashmë me një repo Git të inicializuar dhe një commit fillestar. Vetëm shto remote-in tënd dhe bëj push:
```bash
git remote add origin https://github.com/USERNAME/REPO.git
git branch -M main
git push -u origin main
```
(Ose nëse repo ekziston: `git remote set-url origin ...` pastaj `git push`.)

## 3) Deploy në Vercel
**Varianti A — nga GitHub (rekomandohet):**
1. Shko te [vercel.com](https://vercel.com) → **Add New → Project** → importo repo-n nga GitHub.
2. Vercel e njeh vetë si **Vite** (build: `vite build`, output: `dist`).
3. Kliko **Deploy**.

**Varianti B — nga terminali:**
```bash
npm i -g vercel
vercel        # preview
vercel --prod # produksion
```

## 4) Ruajtja e të dhënave në Vercel (KV)
Për sinkronizim qendror të të dhënave (jo vetëm në një shfletues):
1. Në Vercel → projekti → **Storage** → **Create** → **KV** (ose Upstash Redis nga Marketplace).
2. **Connect** store-in te projekti — Vercel injekton vetë `KV_REST_API_URL` dhe `KV_REST_API_TOKEN`.
3. Bej një **Redeploy**.

Pas kësaj:
- `GET /api/db` → lexon bazën nga KV.
- `POST /api/db` → ruan bazën në KV (thirret automatikisht sa herë ndryshon diçka).

> Ndërsa KV nuk është i konfiguruar, aplikacioni punon plotësisht me localStorage (API kthen `ok:false` dhe frontend-i bie te ruajtja lokale). Asgjë nuk prishet.

## 5) Punon OFFLINE + Instalim në Windows (PWA)
Pasi hapet një herë online, punon edhe pa internet. Në Chrome/Edge → kliko ikonën **Instalo** në shiritin e adresës; hapet në dritare të vetën me ikonën e CarData dhe shkurtore në Desktop.

## 6) Instalues i vërtetë Windows (.exe) — opsional
```bash
npm install --save-dev electron@^31 electron-builder@^24 cross-env@^7
npm run dist:win   # krijon dist_installer/CarData Setup 0.1.0.exe
```

## 7) Subdomaini i secilës firmë (multi-tenant)
Gjatë krijimit të një firme, superadmini vendos një **Identifikues (subdomain)** — p.sh. `rentacarspahija`. Ky gjenerohet automatikisht nga emri, por mund të ndryshohet dhe duhet të jetë unik.

Kur hapet `rentacarspahija.datapos.pro`:
- Emri i firmës shfaqet automatikisht në login dhe në tab-in e shfletë.
- **Vetëm kredencialet e asaj firme** (dhe superadmini) mund të kyqen. Nëse dikush provon me kredencialet e një firme tjetër, bllokohet.

| Domaini | çfarë ndodh |
|---|---|
| `rentacarspahija.datapos.pro` | Login vetëm për firmën **Rent a Car Spahija** |
| `autorent.datapos.pro` | Login vetëm për firmën **AutoRent** |
| `localhost` (dev) | Login i përgjithshëm (të gjitha firmat) |

### Konfigurimi i domainit (një herë)
Që çdo subdomain (`*.datapos.pro`) të hapet automatikisht pa e shtuar një nga një:
1. **Namecheap → Advanced DNS** te `datapos.pro`, shto një rekord:
   - **Type:** `CNAME` · **Host:** `*` · **Value:** `cname.vercel-dns.com`
2. **Vercel → Project → Settings → Domains**, shto domainin **`*.datapos.pro`** (wildcard).
3. Prit propagimin e DNS (zakonisht disa minuta).

Pas kësaj, sapo të krijosh një firmë me subdomain `rentacarspahija`, adresa `rentacarspahija.datapos.pro` funksionon menjëherë — pa ndryshime të tjera në kod.

## Teknologjitë
React 18 · Vite 5 · Tailwind CSS 3 · lucide-react · PWA · Vercel Serverless + KV · Electron (opsional)

---
Powered by Datapos.pro
