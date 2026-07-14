# 🌐 Panduan Lengkap Cloudflare DNS & Custom Domain

**Dari beli domain, pindahin nameserver ke Cloudflare, sampai pasang ke Pages/Workers — lengkap & runnable.**

---

## 📑 Daftar Isi

1. [Apa itu DNS?](#-1-apa-itu-dns)
2. [Record DNS di Cloudflare](#-2-record-dns-di-cloudflare)
3. [Masukin Domain ke Cloudflare (Nameserver)](#-3-masukin-domain-ke-cloudflare-nameserver)
4. [Proxy: Orange Cloud vs Grey Cloud](#-4-proxy-orange-cloud-vs-grey-cloud)
5. [SSL/TLS: Mode & Sertifikat](#-5-ssltls-mode--sertifikat)
6. [Custom Domain untuk Pages](#-6-custom-domain-untuk-pages)
7. [Custom Domain untuk Workers](#-7-custom-domain-untuk-workers)
8. [Subdomain & Apex (Root) Domain](#-8-subdomain--apex-root-domain)
9. [Email & MX Record](#-9-email--mx-record)
10. [Troubleshooting DNS](#-10-troubleshooting-dns)
11. [Pitfalls & Best Practices](#-11-pitfalls--best-practices)

---

## 🧠 1. Apa itu DNS?

**DNS (Domain Name System)** = buku telepon internet. Menerjemahkan nama domain (`example.com`) jadi IP address (`104.18.x.x`) yang dipahami server.

```
Browser ketik example.com
   ↓
Resolver DNS (1.1.1.1 milik Cloudflare)
   ↓
Cari record A/AAAA → dapat IP
   ↓
Request ke server di IP tersebut
```

### Komponen Domain
| Bagian | Contoh | Keterangan |
|--------|--------|-----------|
| TLD | `.com` / `.dev` | Top-level domain |
| Domain | `example` | Nama utama |
| Subdomain | `www` / `api` | Prefix opsional |
| Apex/Root | `example.com` (tanpa www) | Root domain |

---

## 📋 2. Record DNS di Cloudflare

| Tipe | Fungsi | Contoh |
|------|--------|--------|
| **A** | Map domain → IPv4 | `example.com → 192.0.2.1` |
| **AAAA** | Map domain → IPv6 | `example.com → 2606:...` |
| **CNAME** | Alias domain → domain lain | `www → example.com` |
| **MX** | Mail server (email) | `→ mail.example.com` |
| **TXT** | Teks bebas (verifikasi/SPF) | `v=spf1 include:...` |
| **NS** | Nameserver otoritatif | `→ nsa.cloudflare.com` |
| **SRV** | Layanan (XMPP, Minecraft) | `_service._tcp` |
| **CAA** | Izinkan CA tertentu issuer sertifikat | `0 issue "letsencrypt.org"` |
| **CERT** | Sertifikat kripto | jarang dipakai |

### Contoh lewat Dashboard
Cloudflare → situs → **DNS** → **Records** → Add record:
- Type: `A`, Name: `@`, IPv4: `192.0.2.1`, Proxy: 🟠 (on)
- Type: `CNAME`, Name: `www`, Target: `example.com`, Proxy: 🟠

### Contoh lewat API (REST)
```bash
CF_ACCT="YOUR_ACCOUNT_ID"
CF_ZONE="YOUR_ZONE_ID"   # dapat dari dash /zones
TOKEN="$CLOUDFLARE_API_TOKEN"   # Bearer token (BUKAN Global Key)

# A record (apex)
curl -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/dns_records" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "A",
    "name": "example.com",
    "content": "192.0.2.1",
    "proxied": true,
    "ttl": 1
  }'

# CNAME (www → example.com)
curl -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/dns_records" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CNAME",
    "name": "www.example.com",
    "content": "example.com",
    "proxied": true,
    "ttl": 1
  }'
```
> `ttl: 1` = "Automatic" di Cloudflare. `proxied: true` = 🟠 orange cloud (lalu lintas lewat CF).

### List / Update / Delete
```bash
# List semua record
curl -s "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/dns_records" \
  -H "Authorization: Bearer ${TOKEN}" | jq '.result[] | {id, type, name, content}'

# Ambil ID dulu, lalu update
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/dns_records/RECORD_ID" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"content":"203.0.113.5"}'

# Delete
curl -X DELETE "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/dns_records/RECORD_ID" \
  -H "Authorization: Bearer ${TOKEN}"
```

---

## 🔧 3. Masukin Domain ke Cloudflare (Nameserver)

1. **Daftar** di https://dash.cloudflare.com → **Add a site** → ketik `example.com`.
2. Cloudflare **scan** existing record (biar tidak hilang). Review & continue.
3. Pilih plan **Free**.
4. Cloudflare kasih **2 nameserver**, mis:
   ```
   nsa.cloudflare.com
   nsb.cloudflare.com
   ```
5. **Di registrar domain lo** (Namecheap, Niagahoster, GoDaddy, dll) — ganti nameserver ke punya Cloudflare. Hapus nameserver lama.
6. **Tunggu propagasi** (menit sampai 24 jam, rata-rata < 1 jam).
7. Status di dash berubah **Active** 🟢.

> ⚠️ Selama belum Active, DNS belum dikontrol Cloudflare. Cek: `dig NS example.com +short`

```bash
# Cek nameserver sudah ke Cloudflare?
dig NS example.com +short
# → nsa.cloudflare.com. nsb.cloudflare.com.  (berarti sudah)

# Cek status zona lewat API
curl -s "https://api.cloudflare.com/client/v4/zones?name=example.com" \
  -H "Authorization: Bearer ${TOKEN}" | jq '.result[0].status'
# → "active"
```

---

## ☁️ 4. Proxy: Orange Cloud vs Grey Cloud

| Mode | Ikon | Arti | Kegunaan |
|------|------|------|----------|
| **Proxied** 🟠 | Orange | Trafik lewat edge CF (IP disembunyikan) | Web, API, DDoS protection, cache |
| **DNS only** ⚪ | Grey | CF cuma resolve DNS, trafik langsung ke origin | Game server, email (MX), SSH, custom port |

**Aturan penting:**
- 🟠 hanya untuk **HTTP/HTTPS (port 80/443)**.
- **MX, NS, TXT** harus ⚪ (grey) — tidak bisa di-proxy.
- Buat service non-web (mis. `game.example.com:25565`), set ⚪ dan arahkan A ke IP VPS lo.
- Proxy menyembunyikan IP asli → bot/attacker cuma lihat IP Cloudflare.

```bash
# Set proxy on/off lewat API (proxied: true/false)
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/dns_records/RECORD_ID" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"proxied": true}'
```

---

## 🔒 5. SSL/TLS: Mode & Sertifikat

Cloudflare → **SSL/TLS** → **Overview**:

| Mode | CF ↔ Browser | CF ↔ Origin | Kapan |
|------|-------------|-----------|------|
| **Off** | HTTP | HTTP | ❌ jangan |
| **Flexible** | HTTPS | HTTP | Origin belum ada SSL |
| **Full** | HTTPS | HTTPS (self-signed ok) | Origin punya sertifikat sendiri |
| **Full (Strict)** | HTTPS | HTTPS (valid CA) | ✅ Recommended |

> ✅ **Full (Strict)** paling aman. Kalau origin = Cloudflare Pages/Workers, otomatis Strict & gratis (sertifikat Google Trust Services, keluar ~2 menit).

**Sertifikat:**
- **Universal SSL** — otomatis untuk `example.com` + `*.example.com` (wildcard), gratis.
- **Advanced Certificate** — bisa set hostname spesifik, harga berbayar.
- **Custom SSL** — upload sertifikat sendiri (Enterprise).

```bash
# Cek sertifikat universal sudah terbit?
curl -s "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/ssl/verification" \
  -H "Authorization: Bearer ${TOKEN}" | jq '.result[] | {host: .certificates[0].hosts, status: .status}'
# status "active" = siap HTTPS
```

**HSTS (opsional tapi bagus):** SSL/TLS → Edge Certificates → **HSTS** on (force HTTPS).

---

## 📄 6. Custom Domain untuk Pages

### Cara A — Dashboard (paling gampang)
1. Pages project → **Custom domains** → **Set up a domain**.
2. Ketik `example.com` (atau `www.example.com`).
3. CF otomatis **buat CNAME record** + verifikasi SSL.
4. Tunggu status **Active** 🟢.

### Cara B — API (CI/CD / headless)
```bash
# Tambah custom domain ke Pages project
curl -X POST "https://api.cloudflare.com/client/v4/accounts/${CF_ACCT}/pages/projects/${PROJECT_NAME}/domains" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name": "example.com"}'
# CF otomatis:
#  - buat CNAME example.com → project.pages.dev (proxied)
#  - issue sertifikat SSL
```

### Apex (root) domain `example.com`
Cloudflare otomatis pakai **CNAME flattening** — jadi kamu tidak perlu A record manual. Cukup add domain `example.com` di Pages, CF urus sisanya.

> 💡 Kalau add domain apex manual lewat DNS tab: buat **CNAME name `@` → `project.pages.dev`**, proxied: true. Cloudflare flatten otomatis ke IP.

---

## ⚡ 7. Custom Domain untuk Workers

### Cara A — Custom Domains (Recommended, terbaru)
Worker → **Settings** → **Domains & Routes** → **Add** → **Custom Domain** → ketik `api.example.com`.
- CF buat CNAME + SSL otomatis.
- Tidak perlu `wrangler.toml` route.

### Cara B — Routes (legacy, per-path)
```toml
# wrangler.toml
routes = [
  { pattern = "api.example.com/*", custom_domain = true },
  { pattern = "example.com/worker/*", zone_name = "example.com" }
]
```
Atau lewat API:
```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/workers/routes" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"pattern":"api.example.com/*","script_name":"my-worker"}'
```

### Perbedaan
| Fitur | Custom Domain | Route |
|-------|-------------|-------|
| SSL otomatis | ✅ | ✅ (kalau zone proxied) |
| Path-based (`/api/*`) | ❌ | ✅ |
| Subdomain penuh | ✅ | ✅ |
| Rekomendasi | ✅ baru | legacy |

---

## 🌿 8. Subdomain & Apex (Root) Domain

### Subdomain (`api.example.com`, `blog.example.com`)
- A record (ke IP) **ATAU** CNAME (ke Pages/Worker) — keduanya bisa di-proxy 🟠.
- Praktik: `www` → CNAME ke apex; `api` → Worker; `blog` → Pages.

### Apex (`example.com` tanpa www)
- **Tidak bisa A record kalau origin = Pages/Worker** (karena IP dinamis). Gunakan **CNAME `@` → project.pages.dev** (CF flatten).
- Kalau origin = VPS (IP statis): A record `@` → IP VPS, proxied 🟠.

### www → non-www (redirect)
Pages/Worker bisa redirect di kode:
```javascript
// di Worker fetch handler
const url = new URL(request.url);
if (url.hostname.startsWith("www.")) {
  url.hostname = url.hostname.replace("www.", "");
  return Response.redirect(url.toString(), 301);
}
```

---

## ✉️ 9. Email & MX Record

Cloudflare **bukan mail server** — dia cuma pegang DNS. Untuk terima email:

1. **MX record** (harus ⚪ grey, tidak di-proxy):
```
Type: MX, Name: @, Mail server: mail.example.com, Priority: 10
```
2. Pastikan ada **A record** `mail.example.com` → IP mail server lo (bisa grey).
3. **TXT SPF** (anti spoofing):
```
Type: TXT, Name: @, Content: "v=spf1 include:_spf.google.com ~all"
```
4. **DKIM / DMARC** (kalau pakai Google Workspace / Zoho).

> 📨 **Cloudflare Email Routing** (gratis): teruskan email `hi@example.com` → Gmail lo.
> Dash → **Email** → **Email Routing** → Add → destination address. CF otomatis tambah MX + TXT.

---

## 🐛 10. Troubleshooting DNS

| Gejala | Penyebab | Fix |
|--------|----------|-----|
| Domain **Pending** terus | Nameserver registrar belum diubah | Ganti NS di registrar ke punya CF |
| **ERR_SSL_VERSION** | Mode SSL salah / origin tidak HTTPS | Pakai Full (Strict) atau pasang SSL di origin |
| **522/524** | Origin timeout / connection refused | Cek origin hidup, firewall izinkan CF IP |
| **DNS_PROBE_FINISHED_NXDOMAIN** | Record tidak ada | Tambah A/CNAME yang benar |
| **Too many redirects** | Redirect loop (www↔non-www) | Pastiin cuma 1 arah redirect |
| **CNAME flattening error** | Apex CNAME bentrok dgn A record | Hapus A record apex, pakai CNAME @ saja |
| Lambat pertama kali | Cold DNS cache | Tunggu TTL propagate (~menit) |

```bash
# Cek record aktif
dig example.com +short
dig www.example.com +short
dig MX example.com +short

# Cek propagation global (multiple resolver)
for r in 1.1.1.1 8.8.8.8 9.9.9.9; do
  echo "== $r =="; dig @$r example.com +short
done

# Cek SSL certificate
echo | openssl s_client -servername example.com -connect example.com:443 2>/dev/null | openssl x509 -noout -issuer -dates
```

---

## 🚨 11. Pitfalls & Best Practices

❌ **MX di-proxy 🟠** — email gagal. MX/NS/TXT harus ⚪ grey.
❌ **Apex pakai A record ke Pages** — IP Pages dinamis, akan mati. Pakai CNAME `@` (flatten).
❌ **SSL Off/Flexible ke origin HTTPS** — redirect loop. Pakai Full (Strict).
❌ **Global API Key buat script** — pakai **API Token** (Bearer) yang di-scope & ada TTL. Lebih aman kalau bocor.
❌ **TTL manual kecil** — di CF, `ttl: 1` = Automatic (300dtk efektif). Jangan set < 60.
❌ **Lupa verifikasi TXT saat klaim domain** — beberapa service (Google, GitHub Pages) butuh TXT temporary.
❌ **CNAME ke CNAME berlapis** — CF flatten maksimal, hindari rantai panjang.
❌ **Hapus NS record Cloudflare** — domain langsung tidak terhubung. Jangan sentuh NS kecuali pindah provider.

### ✅ Best Practice
1. **Selalu proxied 🟠** untuk web/API (sembunyikan IP, dapat DDoS protection gratis).
2. **Full (Strict)** SSL untuk semua situs.
3. **API Token** bukan Global Key — scope per-akun, set TTL 6–12 bulan.
4. **CNAME flattening** untuk apex → Pages/Worker.
5. **Email Routing** gratis buat forward ke Gmail.
6. **Cek `dig` + SSL** sebelum umumkan domain live.

---

## 📚 Referensi
- [Cloudflare DNS Docs](https://developers.cloudflare.com/dns/)
- [Custom Domains for Pages](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [SSL/TLS](https://developers.cloudflare.com/ssl/)
- [Email Routing](https://developers.cloudflare.com/email-routing/)
