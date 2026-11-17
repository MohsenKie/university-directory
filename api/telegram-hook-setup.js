module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  if (!process.env.TELEGRAM_WEBHOOK_SETUP_SECRET || req.query.key !== process.env.TELEGRAM_WEBHOOK_SETUP_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN_missing" });
  const webhook = "https://zkvvyocmwuuyctmeizby.supabase.co/functions/v1/telegram-professors-bot";
  try {
    const response = await fetch("https://api.telegram.org/bot" + token + "/setWebhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: webhook, allowed_updates: ["message"] })
    });
    const setWebhook = await response.json();
    const infoResponse = await fetch("https://api.telegram.org/bot" + token + "/getWebhookInfo");
    const webhookInfo = await infoResponse.json();
    return res.status(200).json({ setWebhook, webhookInfo });
  } catch (error) {
    return res.status(502).json({ error: "telegram_api_failed", message: String(error) });
  }
};