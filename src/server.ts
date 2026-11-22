import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const app = express();
const port = Number(process.env.PORT) || 3000;
const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL || "openrouter/free";
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(currentDirectory, "../public");

app.use(express.json({ limit: "32kb" }));
app.use(express.static(publicDirectory));

function sanitizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is { role: string; content: string } =>
        typeof item === "object" &&
        item !== null &&
        "role" in item &&
        "content" in item &&
        typeof item.role === "string" &&
        typeof item.content === "string" &&
        (item.role === "user" || item.role === "assistant"),
    )
    .map((item) => ({
      role: item.role as ChatMessage["role"],
      content: item.content.slice(0, 8_000),
    }))
    .slice(-20);
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part: unknown) => {
      if (typeof part !== "object" || part === null || !("text" in part)) return "";
      return typeof part.text === "string" ? part.text : "";
    })
    .join("");
}

app.post("/api/chat", async (req, res) => {
  const body: unknown = req.body;
  if (typeof body !== "object" || body === null || !("message" in body)) {
    res.status(400).json({ error: "أرسل رسالة نصية صالحة." });
    return;
  }

  const message = body.message;
  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "لا يمكن إرسال رسالة فارغة." });
    return;
  }
  if (message.length > 8_000) {
    res.status(400).json({ error: "الرسالة طويلة جدًا (الحد الأقصى 8000 حرف)." });
    return;
  }
  if (!apiKey) {
    res.status(503).json({ error: "الخدمة غير مهيأة. أضف OPENROUTER_API_KEY إلى إعدادات الخادم." });
    return;
  }

  const history = sanitizeHistory("history" in body ? body.history : undefined);
  const messages: ChatMessage[] = [...history, { role: "user", content: message.trim() }];

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
    });

    if (!response.ok) {
      console.error(`OpenRouter chat request failed with status ${response.status}.`);
      res.status(502).json({ error: "تعذر الحصول على رد الآن. تحقق من الاتصال ومفتاح API ثم حاول مجددًا." });
      return;
    }

    const completion: unknown = await response.json();
    const answer =
      typeof completion === "object" && completion !== null && "choices" in completion &&
      Array.isArray(completion.choices) && completion.choices.length > 0 &&
      typeof completion.choices[0] === "object" && completion.choices[0] !== null &&
      "message" in completion.choices[0] && typeof completion.choices[0].message === "object" &&
      completion.choices[0].message !== null && "content" in completion.choices[0].message
        ? extractText(completion.choices[0].message.content)
        : "";

    if (!answer) {
      res.status(502).json({ error: "لم يصل رد نصي من النموذج. حاول مرة أخرى." });
      return;
    }
    res.json({ reply: answer });
  } catch (error) {
    console.error("OpenRouter chat request failed:", error);
    res.status(502).json({ error: "تعذر الحصول على رد الآن. تحقق من الاتصال ومفتاح API ثم حاول مجددًا." });
  }
});

app.listen(port, () => {
  console.log(`OpenRouter chat app listening on port ${port}`);
});
