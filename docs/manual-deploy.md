# 🚀 Manual Deploy Cloudflare Workers via REST API

**Tanpa Wrangler, tanpa browser login. Cocok buat headless VPS atau CI/CD.**

---

## Prasyarat

Sebelum deploy, lo butuh:

1. **Cloudflare Account** — daftar di https://dash.cloudflare.com (gratis)
2. **Account ID** — dari Cloudflare Dashboard → sidebar → "Account ID"
3. **Global API Key** — dari Cloudflare Dashboard → My Profile → API Tokens → Global API Key
4. **Email** — yang dipake daftar Cloudflare

## Auth Method

Global API Key pake **X-Auth-Key headers**, BUKAN Bearer token:

```bash
-H "X-Auth-Email: email@example.com"
-H "X-Auth-Key: cfk_your_api_key"
```

## Step 1: Bikin Worker Script

```javascript
// worker.js
export default {
  async fetch(request, env, ctx) {
    return new Response("Hello dari manual deploy! 🚀");
  }
};
```

## Step 2: Deploy via curl

```bash
# Set variables
CF_ACCT="YOUR_ACCOUNT_ID"
CF_KEY="YOUR_GLOBAL_API_KEY"    # format: cfk_...
EMAIL="your-email@example.com"
WORKER_NAME="my-first-worker"

# Bikin upload body (multipart/form-data)
cat > /tmp/metadata.json << 'EOF'
{
  "main_module": "worker.js",
  "compatibility_date": "2026-06-01"
}
EOF

# Upload
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/${CF_ACCT}/workers/scripts/${WORKER_NAME}" \
  -H "X-Auth-Email: ${EMAIL}" \
  -H "X-Auth-Key: ${CF_KEY}" \
  -H "Content-Type: multipart/form-data" \
  -F "metadata=@/tmp/metadata.json;type=application/json" \
  -F "worker.js=@worker.js;type=application/javascript+module"
```

### Expected Response

```json
{
  "success": true,
  "result": {
    "id": "my-first-worker",
    "etag": "...",
    "size": 123,
    "available_on_subdomain": true
  }
}
```

## Step 3: Cek di Browser

Buka `https://my-first-worker.YOUR_SUBDOMAIN.workers.dev/`

## Step 4: Set Route (Custom Domain)

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/workers/routes" \
  -H "X-Auth-Email: ${EMAIL}" \
  -H "X-Auth-Key: ${CF_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"pattern": "api.example.com/*", "script": "my-first-worker"}'
```

## Full Example with Bindings

Folder structure:

```
my-worker/
├── worker.js       ← Main code
├── package.json     ← Dependencies
└── wrangler.toml    ← Config (optional)
```

### worker.js with D1 + KV

```javascript
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Routing
    if (url.pathname === "/api/users") {
      const users = await env.DB.prepare("SELECT * FROM users LIMIT 10").all();
      return new Response(JSON.stringify(users), {
        headers: { "content-type": "application/json" }
      });
    }

    if (url.pathname === "/cache/test") {
      const cached = await env.CACHE.get("test");
      return new Response(cached || "not found");
    }

    return new Response("Hello dari Worker dengan bindings!");
  }
};
```

### wrangler.toml

```toml
name = "my-worker"
compatibility_date = "2026-06-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "xxxx-xxxx-xxxx-xxxx"

[[kv_namespaces]]
binding = "CACHE"
id = "xxxx-xxxx-xxxx-xxxx"
```

## Deploy with Bindings

```bash
# Untuk D1 binding, tambah di metadata saat upload
# Atau lebih gampang:
wrangler deploy
```

## Pitfalls

- **Content-Type `application/javascript`** → error 10021. Harus `application/javascript+module`
- **Main_module nama** — harus sama persis dengan form field name
- **File size limit** — 1MB di free plan
- **D1 binding type** — di metadata jangan `d1_database_binding`, pake `d1`

## Checklist Deploy

- [ ] Worker script sudah bener (`export default { async fetch... }`)
- [ ] Bindings sudah di metadata
- [ ] Secret sudah di set (via `wrangler secret put`)
- [ ] Route sudah di set (opsional)
- [ ] Test: `curl -sI https://worker-name.subdomain.workers.dev/`