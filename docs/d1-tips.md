# 🐛 D1 Database Tips & Common Pitfalls

**Database SQLite di Cloudflare Edge — tapi ada beberapa hal yang gak jalan.**

---

## Yang Bisa Dilakukan di D1

✅ `SELECT`, `INSERT`, `UPDATE`, `DELETE`
✅ `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`
✅ `JOIN`, `GROUP BY`, `ORDER BY` — SQL biasa
✅ `datetime()` — fungsi SQLite
✅ Parameter binding — `?` placeholder

## Yang TIDAK Bisa Dilakukan

❌ **PRAGMA table_info** — error "not authorized: SQLITE_AUTH"
❌ **sqlite_master** — error "SQLITE_AUTH"
❌ **PRAGMA** lainnya kecuali di CLI (`wrangler d1 execute`)
❌ **SQL functions** — `random()`, `uuid()` — ada yang gak support

### Contoh Error

```javascript
// ❌ INI ERROR
const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
for (const table of tables.results) {
  const info = await env.DB.prepare(`PRAGMA table_info(${table.name})`).all(); // ERROR!
}
```

### Yang Bener

```javascript
// ✅ INI AMAN
const count = await env.DB.prepare("SELECT COUNT(*) as cnt FROM users").first();
const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(1).first();
```

### Kenapa?

`sqlite_master` dan `PRAGMA` adalah **internal database metadata** yang di-block D1 karena:
1. Security — mencegah info leak
2. Performance — `PRAGMA` lambat di edge
3. Compatibility — D1 bukan SQLite biasa

## Migration Pattern

### 1. Bikin migration file

```bash
wrangler d1 migrations create my-database add_email_field
```

### 2. Isi migration

```sql
-- migrations/0001_add_email_field.sql
ALTER TABLE users ADD COLUMN email TEXT UNIQUE;
```

### 3. Apply

```bash
wrangler d1 migrations apply my-database --remote
```

### Alternative: Via Worker

Kalau migration via CLI error, pake Worker:

```javascript
export default {
  async fetch(request, env) {
    // Migration di runtime
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        applied_at TEXT DEFAULT (datetime('now'))
      )
    `).run();

    const applied = await env.DB.prepare("SELECT name FROM migrations").all();
    const appliedNames = new Set(applied.results?.map(r => r.name) || []);

    if (!appliedNames.has("add_email")) {
      await env.DB.prepare("ALTER TABLE users ADD COLUMN email TEXT").run();
      await env.DB.prepare("INSERT INTO migrations (name) VALUES (?)").bind("add_email").run();
    }
  }
};
```

## Backup

D1 backup otomatis tiap 6 jam. Bisa juga manual:

```bash
# Export ke JSON
wrangler d1 execute my-database --remote --command "SELECT * FROM users" --json > backup.json

# Import
cat backup.json | wrangler d1 execute my-database --remote --command "..." --json
```

## Best Practices

1. **Index** — `CREATE INDEX IF NOT EXISTS idx_email ON users(email)` untuk query cepat
2. **Limit** — `SELECT ... LIMIT 100` — jangan query million rows tanpa limit
3. **Error handling** — selalu `try/catch` binding di worker
4. **Batch** — `db.batch()` untuk multiple statements
5. **Close** — jangan lupa `close()` setelah query