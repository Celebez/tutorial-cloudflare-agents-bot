# Contoh Runnable — Telegram Echo Bot

Folder ini berisi kode yang **beneran bisa di-deploy** ke Cloudflare Workers, melengkapi tutorial di `../README.md`.

## Isi
- `worker.js` — bot Telegram minimal (echo pesan) pakai ES Modules + `ctx.waitUntil()`
- `wrangler.toml` — config Worker + contoh binding (KV/D1/R2, dikomentari)

## Cara jalanin

```bash
# 1. Install wrangler
npm install -g wrangler

# 2. Login (browser)
npx wrangler login

# 3. Set token bot sebagai SECRET (aman, tidak masuk git)
npx wrangler secret put BOT_TOKEN
# lalu paste token dari @BotFather

# 4. Deploy
npx wrangler deploy

# 5. Set webhook (ganti <TOKEN> dan <worker> dengan punyamu)
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<worker>.workers.dev/"

# 6. Tes: kirim pesan ke bot di Telegram, dia akan mem-balas "Kamu bilang: ..."
```

## Catatan
- `BOT_TOKEN` di `wrangler.toml` `[vars]` hanya fallback lokal. Di production **selalu** pakai `wrangler secret put` agar token tidak bocor ke git.
- Worker harus balas `200 OK` dengan cepat; kirim balasan Telegram lewat `ctx.waitUntil()` (background) supaya tidak kena timeout.
