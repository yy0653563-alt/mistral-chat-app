import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

const app = express();
const port = Number(process.env.PORT) || 3000;
const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL || "openrouter/free";
const visionModel = process.env.OPENROUTER_VISION_MODEL || "nvidia/nemotron-3.5-super-vl:free";
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(currentDirectory, "../public");

app.use(express.json({ limit: "10mb" }));
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

const imageRequestPrefix = /^(?:ارسم|صورة|ولّد\s+صورة|ولد\s+صورة|أنشئ\s+صورة|انشئ\s+صورة|اعمل\s+صورة)\s*[:،-]?\s*/u;

function getImagePrompt(message: string, explicitlyRequested: boolean): string | null {
  const match = imageRequestPrefix.exec(message);
  if (!explicitlyRequested && !match) return null;
  return (match ? message.slice(match[0].length) : message).trim();
}

async function translateImagePrompt(prompt: string): Promise<string> {
  if (!/[\u0600-\u06FF]/u.test(prompt)) return prompt;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", prompt);
    url.searchParams.set("langpair", "ar|en");
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return prompt;
    const result: unknown = await response.json();
    if (typeof result !== "object" || result === null || !("responseData" in result)) return prompt;
    const responseData = result.responseData;
    if (typeof responseData !== "object" || responseData === null || !("translatedText" in responseData)) return prompt;
    const translated = typeof responseData.translatedText === "string" ? responseData.translatedText.trim() : "";
    return translated || prompt;
  } catch {
    return prompt;
  } finally {
    clearTimeout(timeoutId);
  }
}

app.post("/api/chat", async (req, res) => {
  const body: unknown = req.body;
  if (typeof body !== "object" || body === null) {
    res.status(400).json({ error: "أرسل رسالة نصية صالحة." });
    return;
  }

  const hasMessage = "message" in body;
  const hasImage = "image" in body;
  if (!hasMessage && !hasImage) {
    res.status(400).json({ error: "أرسل رسالة نصية صالحة." });
    return;
  }

  let image: string | undefined;
  if (hasImage) {
    if (typeof body.image !== "string" || !body.image.startsWith("data:image/")) {
      res.status(400).json({ error: "صيغة الصورة غير صالحة. أرسل صورة بصيغة مدعومة." });
      return;
    }
    if (body.image.length > 7_500_000) {
      res.status(400).json({ error: "حجم الصورة كبير جدًا (الحد الأقصى 5 ميغابايت)." });
      return;
    }
    image = body.image;
  }

  let message = "";
  if (hasMessage) {
    if (typeof body.message !== "string") {
      res.status(400).json({ error: "لا يمكن إرسال رسالة فارغة." });
      return;
    }
    message = body.message.trim();
    if (message.length === 0 && !image) {
      res.status(400).json({ error: "لا يمكن إرسال رسالة فارغة." });
      return;
    }
    if (body.message.length > 8_000) {
      res.status(400).json({ error: "الرسالة طويلة جدًا (الحد الأقصى 8000 حرف)." });
      return;
    }
  }

  if (!message && !image) {
    res.status(400).json({ error: "لا يمكن إرسال رسالة فارغة." });
    return;
  }

  // An attached image always takes precedence and is handled as a vision question.
  const explicitlyRequested = "imageRequest" in body && body.imageRequest === true;
  const imagePrompt = image ? null : getImagePrompt(message, explicitlyRequested);
  if (imagePrompt !== null) {
    if (!imagePrompt) {
      res.status(400).json({ error: "اكتب وصفًا للصورة التي تريد توليدها." });
      return;
    }
    if (imagePrompt.length > 500) {
      res.status(400).json({ error: "وصف الصورة طويل جدًا (الحد الأقصى 500 حرف)." });
      return;
    }

    const usedPrompt = await translateImagePrompt(imagePrompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(usedPrompt)}?width=1024&height=1024&model=flux&nologo=true&seed=${Math.floor(Math.random() * 1_000_000)}`;
    res.json({ reply: `إليك الصورة. (الوصف المستخدم: ${usedPrompt})`, imageUrl });
    return;
  }

  if (!apiKey) {
    res.status(503).json({ error: "الخدمة غير مهيأة. أضف OPENROUTER_API_KEY إلى إعدادات الخادم." });
    return;
  }

  const history = sanitizeHistory("history" in body ? body.history : undefined);
  const userMessage: ChatMessage = image
    ? {
        role: "user",
        content: [
          { type: "text", text: message || "صف هذه الصورة بالعربية وساعدني بما فيها." },
          { type: "image_url", image_url: { url: image } },
        ],
      }
    : { role: "user", content: message };
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: "أنت مِداد، مساعد ذكي بالعربية. أجب دائماً باللغة العربية، حتى لو سُئلت بلغة أخرى. عند وصف صورة، اقرأ النص العربي فيها بعناية وانقله كما هو دون تخمين.",
    },
    ...history,
    userMessage,
  ];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: image ? visionModel : model, messages }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

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
    if (error instanceof Error && error.name === "AbortError") {
      res.status(504).json({ error: "استغرق النموذج وقتًا أطول من المتوقع (دقيقة). حاول مرة أخرى." });
      return;
    }
    console.error("OpenRouter chat request failed:", error);
    res.status(502).json({ error: "تعذر الحصول على رد الآن. تحقق من الاتصال ومفتاح API ثم حاول مجددًا." });
  }
});

app.listen(port, () => {
  console.log(`OpenRouter chat app listening on port ${port}`);
});
