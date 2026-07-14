// Minimal Telegram echo bot — Cloudflare Workers
// Jalankan: wrangler deploy  (setelah set BOT_TOKEN via `wrangler secret put BOT_TOKEN`)
//
// Cara set webhook (sekali):
//   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<worker>.workers.dev/"
//
// Catatan: jangan lupa set BOT_TOKEN di wrangler.toml [vars] ATAU via secret.
// Di production, gunakan secret (wrangler secret put BOT_TOKEN) agar token tidak masuk git.

export default {
  async fetch(request, env, ctx) {
    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("ok"); // Telegram hanya kirim JSON; abaikan request lain
    }

    // Hanya proses pesan teks
    const message = update?.message;
    if (message?.text) {
      const chatId = message.chat.id;
      const text = message.text;

      // Balas pesan yang diterima (echo)
      const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
      ctx.waitUntil(
        fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `Kamu bilang: ${text}`,
          }),
        })
      );
    }

    // Telegram butuh 200 OK cepat
    return new Response("ok");
  },
};
