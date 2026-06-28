# 🔗 Panduan Lengkap Cloudflare Bindings

**Semua yang perlu lo tahu tentang D1, KV, R2, Queues, Durable Objects, dan Secrets.**

---

## 📊 Overview

| Binding | Nama di Kode | Type | Database / Config | Free Tier | Persistence |
|---------|------------|------|-------------------|-----------|-------------|
| **D1** | `env.DB` | SQLite | Database ID + Name | 5GB storage | ✅ Disk |
| **KV** | `env.CACHE` | Key-Value | Namespace ID | 1GB | ✅ Global |
| **R2** | `env.ASSETS` | Object | Bucket Name | 10GB | ✅ S3-like |
| **Queues** | `env.QUEUE` | Message | Queue Name | 100k/mo | ✅ Buffer |
| **DO** | `env.COUNTER` | Stateful | Class Name | Included | ✅ RAM+DB |
| **Secrets** | `env.SECRET` | Env Var | Key Name | Unlimited | ✅ Config |

## 🔧 D1 — Detail Lengkap

### Apa itu D1?

**D1** = Cloudflare database **SQLite** yang jalan di edge. Bisa bikin relasi, query, dan nyimpen data persisten.

### Kelebihan
- **SQL** — `SELECT`, `INSERT`, `UPDATE` biasa
- **Persistence** — data aman meski Worker restart
- **Backup** — otomatis tiap 6 jam
- **Free** — 5GB storage

### Kekurangan
- **Read-only di `sqlite_master`** — jangan query `PRAGMA table_info`
- **Latency** — ~100ms cold, ~10ms warm
- **Max 10 database** per account

### Setup

```bash
# Bikin database baru
wrangler d1 create my-database

# Init migration
wrangler d1 migrations create my-database create_users_table

# Apply migration
wrangler d1 migrations apply my-database --remote

# Query langsung
wrangler d1 execute my-database --remote --command "SELECT 1"
```

### Di Worker

```javascript
// CREATE TABLE
await env.DB.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`).run();

// SELECT
const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();

// INSERT
await env.DB.prepare("INSERT INTO users (name, email) VALUES (?, ?)")
  .bind("John", "john@example.com").run();

// UPDATE
await env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind("Jane", 1).run();

// DELETE
await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(1).run();
```

### Tips

- **Always use `.bind()`** — jangan pake raw string, risk SQL injection
- **`first()`** vs **`all()`** — `first()` buat 1 row, `all()` buat banyak
- **`run()`** vs **`first()`** — `run()` gak return data (INSERT/UPDATE/DELETE), `first()` return data
- **Batch insert** — pake `db.batch()` untuk multiple statements

## 🗃️ KV — Detail Lengkap

### Apa itu KV?

**Workers KV** = **key-value store global**. Simpel: `get`, `put`, `delete`.

### Kelebihan
- **Read cepat** — ~5ms dari edge
- **Global** — data di semua lokasi
- **TTL** — bisa set expire time

### Kekurangan
- **Write latency** — ~5-60 detik buat propagate ke semua edge
- **1MB limit** per value
- **25 reads/sec** per free tier

### Contoh

```javascript
// Set dengan TTL
await env.CACHE.put("user:123", JSON.stringify(userData), {
  expirationTtl: 3600  // 1 jam
});

// Get
const cached = await env.CACHE.get("key", "text");  // atau "json"
const parsed = JSON.parse(cached);

// Delete
await env.CACHE.delete("old_key");

// List keys (pagination)
const list = await env.CACHE.list({ prefix: "user:", limit: 100 });
```

### Pattern: Cache-aside

```javascript
async function getData(key) {
  // 1. Cek cache
  const cached = await env.CACHE.get(key);

  if (cached) {
    return JSON.parse(cached);  // cache hit
  }

  // 2. Hit source
  const data = await fetchFromSource(key);
  const json = JSON.stringify(data);

  // 3. Set cache
  await env.CACHE.put(key, json, { expirationTtl: 60 });

  return data;
}
```

## 📦 R2 — Detail Lengkap

### Apa itu R2?

**R2** = S3-compatible object storage **tanpa egress fee**. Bedanya sama S3: bayar egress $0.

### Kegunaan
- Hosting gambar untuk website
- Backup database
- File upload dari user
- Log files

### Contoh

```javascript
// Get object
const obj = await env.ASSETS.get("path/to/file.pdf");
if (obj === null) return new Response("Not found", { status: 404 });

// Set object
await env.ASSETS.put("path/to/file.pdf", fileBody);

// Delete
await env.ASSETS.delete("old/file.pdf");

// List
const objects = await env.ASSETS.list();
```

### R2 vs S3

| Feature | R2 | S3 |
|---------|-----|----|
| Egress fee | $0 | $0.09/GB |
| Free tier | 10GB | 5GB |
| Global | ✅ | Regional |
| S3 API | ✅ | ✅ |

## 📨 Queues — Detail Lengkap

### Apa itu Queues?

**Message queue** buat **async processing**. Producer kirim pesan, consumer process.

### Producer (dalam fetch handler)

```javascript
export default {
  async fetch(request, env) {
    // Kirim pesan ke queue
    await env.QUEUE.send({
      type: "email",
      to: "user@example.com",
      subject: "Welcome"
    });

    return new Response("Queued!");
  }
};
```

### Consumer (queue handler terpisah)

```javascript
export default {
  async queue(batch, env) {
    for (const msg of batch.messages) {
      const { type, to, subject } = msg.body;

      switch (type) {
        case "email":
          await sendEmail(to, subject, msg.body.content);
          break;
        case "webhook":
          await fetch(to, { method: "POST" });
          break;
      }
    }
  }
};
```

### Notes

- **Max batch size** — 10 messages default
- **Retry** — otomatis 3x kalau gagal
- **Dead letter** — bisa set untuk pesan yang selalu gagal

## 🧠 Durable Objects — Detail Lengkap

### Apa itu Durable Objects?

**Stateful singleton** di edge. Setiap DO punya **ID unik** dan **state sendiri**.

### Pattern: Counter

```javascript
// durable-object.js
export class Counter {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    let count = this.state.storage.get("count") || 0;

    if (url.pathname === "/increment") {
      count++;
      await this.state.storage.put("count", count);
    }

    return new Response(`Count: ${count}`);
  }
}

// worker.js — panggil DO
const id = env.COUNTER.idFromName("global");
const stub = env.COUNTER.get(id);
const resp = await stub.fetch("https://.../increment");
```

### Kapan pake DO?

- **WebSocket connections** — perlu state per connection
- **Real-time games** — player position, score
- **Rate limiter** — per-user
- **Coordination** — distributed locks

## 🔐 Secrets — Detail Lengkap

### Set via Wrangler

```bash
echo "supersecret123" | wrangler secret put API_KEY
```

### Set via API

```bash
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCT/workers/scripts/$NAME/secrets" \
  -H "X-Auth-Email: $EMAIL" \
  -H "X-Auth-Key: $CF_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "API_KEY", "text": "supersecret123", "type": "secret_text"}'
```

### Best Practices

1. **Jangan hardcode** — pake `env.SECRET` bukan string literal
2. **Jangan simpan di git** — `.env` files are for local dev
3. **Rotate periodically** — ganti key tiap 30-90 hari
4. **Limit scope** — tiap Worker/secrets punya scope sendiri

## 🧪 Testing Bindings

### Via Wrangler

```bash
# Test D1
wrangler d1 execute DB_NAME --remote --command "SELECT 1"

# Test KV
wrangler kv key get --namespace-id NAMESPACE_ID KEY

# Test R2
wrangler r2 object get BUCKET_NAME --file key
```

### Via Worker (test endpoint)

```javascript
// Tambah endpoint /debug di worker
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/debug") {
      const tests = {};

      // Test D1
      try {
        const r = await env.DB.prepare("SELECT 1 as val").first();
        tests.d1 = r?.val === 1 ? "✅" : "❌";
      } catch (e) {
        tests.d1 = `❌ ${e.message}`;
      }

      // Test KV
      try {
        await env.CACHE.get("debug_test");
        tests.kv = "✅ (read only, no write check)";
      } catch (e) {
        tests.kv = `❌ ${e.message}`;
      }

      return new Response(JSON.stringify(tests, null, 2), {
        headers: { "content-type": "application/json" }
      });
    }
  }
};
```

---

## 🚨 Common Binding Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `D1_ERROR: SQLITE_AUTH` | `sqlite_master` query | Ganti ke `SELECT COUNT(*)` |
| `KV_ERROR: expired` | Key udah lewat TTL | Set ulang |
| `R2_ERROR: body exceeded` | File > limit | Split / compress |
| `Queues_ERROR: timeout` | Consumer > 30s | Optimize |
| `DO_ERROR: not found` | Binding belum di-set | Cek `wrangler.toml` |