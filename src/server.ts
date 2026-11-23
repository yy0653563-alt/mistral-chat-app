import "dotenv/config";
import express from "express";
import WebSocket from "ws";
import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

type TimedResponse = { response: Response; clear: () => void };

const app = express();
const port = Number(process.env.PORT) || 3000;
const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL || "openrouter/free";
const visionModel = process.env.OPENROUTER_VISION_MODEL || "nvidia/nemotron-3.5-super-vl:free";
const acemusicKey = process.env.ACEMUSIC_API_KEY;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(currentDirectory, "../public");

app.use(express.json({ limit: "10mb" }));
app.use(express.static(publicDirectory));

function sanitizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { role: string; content: string } =>
        typeof item === "object" && item !== null && "role" in item && "content" in item &&
        typeof item.role === "string" && typeof item.content === "string" &&
        (item.role === "user" || item.role === "assistant"),
    )
    .map((item) => ({ role: item.role as ChatMessage["role"], content: item.content.slice(0, 8_000) }))
    .slice(-20);
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part: unknown) => {
    if (typeof part !== "object" || part === null || !("text" in part)) return "";
    return typeof part.text === "string" ? part.text : "";
  }).join("");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

async function fetchTimed(url: string | URL, timeoutMs: number, init: RequestInit = {}): Promise<TimedResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { response, clear: () => clearTimeout(timeoutId) };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function requestOpenRouter(messages: ChatMessage[], modelName = model, key = apiKey): Promise<string> {
  if (!key) throw new Error("OpenRouter API key is not configured.");
  const timed = await fetchTimed("https://openrouter.ai/api/v1/chat/completions", 60_000, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelName, messages }),
  });
  try {
    if (!timed.response.ok) throw new Error(`OpenRouter returned ${timed.response.status}.`);
    const completion: unknown = await timed.response.json();
    const choices = asRecord(completion)?.choices;
    const firstChoice = Array.isArray(choices) ? asRecord(choices[0]) : null;
    const answer = extractText(asRecord(firstChoice?.message)?.content).trim();
    if (!answer) throw new Error("OpenRouter returned an empty answer.");
    return answer;
  } finally {
    timed.clear();
  }
}

const imageRequestPrefix = /^(?:ارسم|صورة|ولّد\s+صورة|ولد\s+صورة|أنشئ\s+صورة|انشئ\s+صورة|اعمل\s+صورة)\s*[:،-]?\s*/u;

function getImagePrompt(message: string, explicitlyRequested: boolean): string | null {
  const match = imageRequestPrefix.exec(message);
  if (!explicitlyRequested && !match) return null;
  const prompt = (match ? message.slice(match[0].length) : message).trim();
  return prompt.replace(/^(?:(?:اريد|أريد|بدي)\s+)?(?:توليد\s+)?صورة\s+/u, "").trim();
}

async function translateWithMyMemory(prompt: string): Promise<string> {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", prompt);
  url.searchParams.set("langpair", "ar|en");
  const timed = await fetchTimed(url, 10_000);
  try {
    if (!timed.response.ok) return "";
    const result: unknown = await timed.response.json();
    const translated = asRecord(asRecord(result)?.responseData)?.translatedText;
    return typeof translated === "string" ? translated.trim() : "";
  } finally {
    timed.clear();
  }
}

async function translateWithPollinations(prompt: string): Promise<string> {
  const instruction = `Translate this Arabic image description into English. Reply with only the English translation, nothing else: ${prompt}`;
  const url = `https://text.pollinations.ai/${encodeURIComponent(instruction)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const timed = await fetchTimed(url, 15_000);
      try {
        if (!timed.response.ok) continue;
        const translated = (await timed.response.text()).trim().replace(/^["']|["']$/g, "");
        if (!translated || /[\u0600-\u06FF]/u.test(translated)) continue;
        return translated;
      } finally {
        timed.clear();
      }
    } catch {
      // Retry once, then give up.
    }
  }
  return "";
}

async function translateImagePrompt(prompt: string, key = apiKey): Promise<string> {
  if (!/[\u0600-\u06FF]/u.test(prompt)) return prompt;
  if (key) {
    try {
      const translated = await requestOpenRouter([
        { role: "system", content: "You translate Arabic image descriptions into English. Reply with only the English translation, nothing else." },
        { role: "user", content: prompt },
      ], model, key);
      if (translated.trim()) return translated.trim();
    } catch {
      // Fall back to the free translation service if OpenRouter is unavailable.
    }
  }
  try {
    const fromMyMemory = await translateWithMyMemory(prompt);
    if (fromMyMemory) return fromMyMemory;
  } catch {
    // Fall through to the next translation service.
  }
  try {
    return (await translateWithPollinations(prompt)) || prompt;
  } catch {
    return prompt;
  }
}

function reinforceGender(prompt: string): string {
  const masculine = /(?:\b(?:man|male|boy|king|pharaoh|father|brother)\b|رجل|ذكر|ولد|شاب|ملك|فرعون|فرعوني|أب|أخ)/iu;
  const feminine = /(?:\b(?:woman|female|girl|queen)\b|امرأة|أنثى|بنت|فتاة|ملكة)/iu;
  if (masculine.test(prompt) && !feminine.test(prompt)) {
    return `${prompt}, masculine man, strong masculine facial features, male face`;
  }
  if (feminine.test(prompt) && !masculine.test(prompt)) {
    return `${prompt}, feminine woman, soft feminine facial features, female face`;
  }
  return prompt;
}

const songTrigger = /(?:ولّد|ولد|أنشئ|انشئ|اعمل)\s+(?:لي\s+)?(?:أغنية|اغنية)|(?:أغنية|اغنية)|(?:غنّي|غنيلي)/u;

function getSongBrief(message: string): string | null {
  const match = songTrigger.exec(message);
  if (!match) return null;
  const brief = (message.slice(0, match.index) + " " + message.slice(match.index + match[0].length))
    .replace(/\s+/gu, " ")
    .replace(/^(?:لي\s+)?(?:أغنية|اغنية)\s*/u, "")
    .trim();
  return brief;
}

async function generateSong(brief: string): Promise<string> {
  if (!acemusicKey) throw new Error("Acemusic API key is not configured.");
  const vocalInstruction = "Vocal song: a singer must sing throughout the whole song, with vocals from the first second. Not instrumental.";
  const content = `${brief}\n\n${vocalInstruction}\n\nLyrics:\n${brief}`;
  const timed = await fetchTimed("https://api.acemusic.ai/v1/chat/completions", 180_000, {
    method: "POST",
    headers: { Authorization: `Bearer ${acemusicKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "acemusic/acestep-v1.5-turbo",
      messages: [{ role: "user", content }],
      modalities: ["audio", "text"],
      audio: { format: "mp3" },
      duration: 300,
    }),
  });
  try {
    if (!timed.response.ok) throw new Error(`Acemusic returned ${timed.response.status}.`);
    const completion: unknown = await timed.response.json();
    const choices = asRecord(completion)?.choices;
    const firstChoice = Array.isArray(choices) ? asRecord(choices[0]) : null;
    const audioItems = asRecord(firstChoice?.message)?.audio;
    const firstAudio = Array.isArray(audioItems) ? asRecord(audioItems[0]) : null;
    const audioUrl = asRecord(firstAudio?.audio_url)?.url;
    if (typeof audioUrl !== "string" || !audioUrl.startsWith("data:audio/")) {
      throw new Error("Acemusic returned no audio.");
    }
    return audioUrl;
  } finally {
    timed.clear();
  }
}

function triggerRemainder(message: string, triggers: string[]): string | null {
  for (const trigger of triggers) {
    const pattern = new RegExp(`^${trigger}(?:\\s|[:：،,-]|$)`, "u");
    const match = pattern.exec(message);
    if (match) return message.slice(match[0].length).trim();
  }
  return null;
}

function cleanCityName(city: string): string {
  return city.replace(/^(?:في\s+)?(?:مدينة\s+)?/u, "").trim();
}

function numberText(value: unknown): string {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number) : "—";
}

const weatherDescriptions: Record<number, string> = {
  0: "سماء صافية", 1: "غائم قليلاً", 2: "غائم جزئيًا", 3: "غائم",
  45: "ضباب", 48: "ضباب", 51: "رذاذ", 53: "رذاذ", 55: "رذاذ",
  61: "مطر", 63: "مطر", 65: "مطر", 71: "ثلج", 73: "ثلج", 75: "ثلج", 77: "ثلج",
  80: "زخات مطر", 81: "زخات مطر", 82: "زخات مطر", 95: "عاصفة رعدية", 96: "عاصفة رعدية", 99: "عاصفة رعدية",
};

async function getWeatherFromOpenMeteo(city: string): Promise<string> {
  const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodeUrl.searchParams.set("name", city);
  geocodeUrl.searchParams.set("count", "1");
  geocodeUrl.searchParams.set("language", "ar");
  geocodeUrl.searchParams.set("format", "json");
  const geocodeTimed = await fetchTimed(geocodeUrl, 12_000);
  let geocode: unknown;
  try {
    if (!geocodeTimed.response.ok) throw new Error("Geocoding request failed.");
    geocode = await geocodeTimed.response.json();
  } finally {
    geocodeTimed.clear();
  }
  const results = asRecord(geocode)?.results;
  const location = Array.isArray(results) ? asRecord(results[0]) : null;
  if (!location || typeof location.latitude !== "number" || typeof location.longitude !== "number") {
    return "لم أجد مدينة بهذا الاسم.";
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(location.latitude));
  forecastUrl.searchParams.set("longitude", String(location.longitude));
  forecastUrl.searchParams.set("current", "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m");
  forecastUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  forecastUrl.searchParams.set("timezone", "auto");
  const forecastTimed = await fetchTimed(forecastUrl, 12_000);
  let forecast: unknown;
  try {
    if (!forecastTimed.response.ok) throw new Error("Forecast request failed.");
    forecast = await forecastTimed.response.json();
  } finally {
    forecastTimed.clear();
  }
  const current = asRecord(asRecord(forecast)?.current);
  const daily = asRecord(asRecord(forecast)?.daily);
  const high = Array.isArray(daily?.temperature_2m_max) ? daily.temperature_2m_max[0] : undefined;
  const low = Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min[0] : undefined;
  if (!current) throw new Error("Weather data was incomplete.");
  const cityName = typeof location.name === "string" ? location.name : city;
  const condition = typeof current.weather_code === "number" ? weatherDescriptions[current.weather_code] || "حالة جوية غير معروفة" : "حالة جوية غير معروفة";
  return `طقس ${cityName}: ${condition}. درجة الحرارة ${numberText(current.temperature_2m)}°م، الرطوبة ${numberText(current.relative_humidity_2m)}٪، سرعة الرياح ${numberText(current.wind_speed_10m)} كم/س. العظمى اليوم ${numberText(high)}°م والصغرى ${numberText(low)}°م.`;
}

const wttrConditions: Record<string, string> = {
  Clear: "سماء صافية", Sunny: "مشمس", "Partly cloudy": "غائم جزئيًا", Cloudy: "غائم",
  Overcast: "غائم كليًا", Mist: "ضباب خفيف", Fog: "ضباب", "Light rain": "مطر خفيف",
  "Moderate rain": "مطر معتدل", "Heavy rain": "مطر غزير", Rain: "مطر",
  Thunderstorm: "عاصفة رعدية", "Light snow": "ثلج خفيف", Snow: "ثلج",
};

async function getWeatherFromWttrin(city: string): Promise<string> {
  const timed = await fetchTimed(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, 12_000);
  let result: unknown;
  try {
    if (!timed.response.ok) throw new Error("wttr.in request failed.");
    result = await timed.response.json();
  } finally {
    timed.clear();
  }
  const conditions = asRecord(result)?.current_condition;
  const current = Array.isArray(conditions) ? asRecord(conditions[0]) : null;
  if (!current) throw new Error("wttr.in returned no weather data.");
  const descriptions = current.weatherDesc;
  const rawDescription = Array.isArray(descriptions) ? asRecord(descriptions[0])?.value : undefined;
  const description = typeof rawDescription === "string" ? rawDescription.trim() : undefined;
  const condition = typeof description === "string" ? wttrConditions[description] || description : "حالة جوية غير معروفة";
  return `طقس ${city}: ${condition}. درجة الحرارة ${numberText(current.temp_C)}°م، الرطوبة ${numberText(current.humidity)}٪، سرعة الرياح ${numberText(current.windspeedKmph)} كم/س.`;
}

async function getWeather(city: string): Promise<string> {
  try {
    return await getWeatherFromOpenMeteo(city);
  } catch (error) {
    console.error("Open-Meteo weather failed, trying wttr.in:", error);
    return await getWeatherFromWttrin(city);
  }
}

async function getPrayerTimes(city: string): Promise<string> {
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Damascus", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
  const [day, month, year] = date.split("/");
  const url = new URL(`https://api.aladhan.com/v1/timingsByCity/${day}-${month}-${year}`);
  url.searchParams.set("city", city);
  url.searchParams.set("country", "Syria");
  url.searchParams.set("method", "5");
  const timed = await fetchTimed(url, 12_000);
  let result: unknown;
  try {
    if (!timed.response.ok) throw new Error("Prayer times request failed.");
    result = await timed.response.json();
  } finally {
    timed.clear();
  }
  const data = asRecord(asRecord(result)?.data);
  const timings = asRecord(data?.timings);
  const hijri = asRecord(asRecord(data?.date)?.hijri);
  const hijriDate = hijri ? [hijri.day, asRecord(hijri.month)?.ar, hijri.year].filter((part) => typeof part === "string" || typeof part === "number").join(" ") : "غير متاح";
  if (!timings) throw new Error("Prayer times response was incomplete.");
  return `مواقيت الصلاة في ${city} اليوم (${hijriDate} هـ): الفجر ${timings.Fajr || "—"}، الشروق ${timings.Sunrise || "—"}، الظهر ${timings.Dhuhr || "—"}، العصر ${timings.Asr || "—"}، المغرب ${timings.Maghrib || "—"}، العشاء ${timings.Isha || "—"}.`;
}

async function getCurrencyRates(): Promise<string> {
  const timed = await fetchTimed("https://open.er-api.com/v6/latest/USD", 12_000);
  let result: unknown;
  try {
    if (!timed.response.ok) throw new Error("Currency request failed.");
    result = await timed.response.json();
  } finally {
    timed.clear();
  }
  const rates = asRecord(asRecord(result)?.rates);
  if (!rates) throw new Error("Currency rates were unavailable.");
  const currencies: Array<[string, string]> = [["SYP", "الليرة السورية"], ["EUR", "اليورو"], ["GBP", "الجنيه الإسترليني"], ["TRY", "الليرة التركية"], ["SAR", "الريال السعودي"], ["AED", "الدرهم الإماراتي"], ["JOD", "الدينار الأردني"], ["EGP", "الجنيه المصري"], ["LBP", "الليرة اللبنانية"]];
  const values = currencies.map(([code, name]) => `${name} (${code}): ${numberText(rates[code])}`).join("، ");
  return `أسعار 1 دولار أمريكي: ${values}. (الأسعار الرسمية)`;
}

async function getWikipediaSummary(term: string): Promise<string> {
  const searchUrl = new URL("https://ar.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", term);
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("srlimit", "1");
  const searchTimed = await fetchTimed(searchUrl, 12_000, { headers: { "User-Agent": "MidadChatApp/1.0 (Wikipedia summary tool)" } });
  let searchResult: unknown;
  try {
    if (!searchTimed.response.ok) throw new Error("Wikipedia search failed.");
    searchResult = await searchTimed.response.json();
  } finally {
    searchTimed.clear();
  }
  const hits = asRecord(asRecord(searchResult)?.query)?.search;
  const hit = Array.isArray(hits) ? asRecord(hits[0]) : null;
  if (!hit || typeof hit.pageid !== "number" || typeof hit.title !== "string") {
    return "لم أجد مقالًا بهذا الاسم في ويكيبيديا العربية.";
  }

  const extractUrl = new URL("https://ar.wikipedia.org/w/api.php");
  extractUrl.searchParams.set("action", "query");
  extractUrl.searchParams.set("prop", "extracts");
  extractUrl.searchParams.set("exintro", "");
  extractUrl.searchParams.set("explaintext", "");
  extractUrl.searchParams.set("pageids", String(hit.pageid));
  extractUrl.searchParams.set("format", "json");
  const extractTimed = await fetchTimed(extractUrl, 12_000, { headers: { "User-Agent": "MidadChatApp/1.0 (Wikipedia summary tool)" } });
  let extractResult: unknown;
  try {
    if (!extractTimed.response.ok) throw new Error("Wikipedia article request failed.");
    extractResult = await extractTimed.response.json();
  } finally {
    extractTimed.clear();
  }
  const pages = asRecord(asRecord(asRecord(extractResult)?.query)?.pages);
  const article = asRecord(pages?.[String(hit.pageid)]);
  const extract = typeof article?.extract === "string" ? article.extract.slice(0, 800) : "";
  return `${hit.title}\n\n${extract || "لا يتوفر ملخص للمقال."}\n\nhttps://ar.wikipedia.org/?curid=${hit.pageid}`;
}

function isPrivateIPv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIPv4(address);
  const normalized = address.toLowerCase();
  if (isIP(address) !== 6) return true;
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("ff")) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIPv4(mapped[1]) : false;
}

async function validatePublicPageUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) throw new Error("Invalid page URL.");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("Private host.");
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("Private host.");
  } else {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error("Private host.");
  }
  return url;
}

async function readWebPage(rawUrl: string): Promise<string> {
  const url = await validatePublicPageUrl(rawUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "error",
      headers: { Accept: "text/html" },
    });
    if (!response.ok || !(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) {
      throw new Error("Page was not available as HTML.");
    }
    if (!response.body) throw new Error("Empty page response.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (totalBytes + value.byteLength > 512 * 1024) {
        await reader.cancel();
        break;
      }
      totalBytes += value.byteLength;
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const html = new TextDecoder().decode(bytes);
    const text = html
      .replace(/<!--[\s\S]*?-->/gu, " ")
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, " ")
      .replace(/<[^>]*>/gu, " ")
      .replace(/&nbsp;/giu, " ")
      .replace(/&amp;/giu, "&")
      .replace(/&lt;/giu, "<")
      .replace(/&gt;/giu, ">")
      .replace(/&quot;/giu, '"')
      .replace(/&#39;|&apos;/giu, "'")
      .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([\da-f]+);/giu, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
      .replace(/\s+/gu, " ").trim();
    return text.slice(0, 6_000);
  } finally {
    clearTimeout(timeoutId);
  }
}

const urlPattern = /https?:\/\/[^\s<>"']+/iu;

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

  // Image generation retains priority; an attached image remains a vision question.
  const clientKey = "apiKey" in body && typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const effectiveKey = clientKey || apiKey || "";
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
    const usedPrompt = reinforceGender(await translateImagePrompt(imagePrompt, effectiveKey));
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(usedPrompt)}?width=1024&height=1024&model=flux&nologo=true&seed=${Math.floor(Math.random() * 1_000_000)}`;
    let imageReady = false;
    for (let attempt = 0; attempt < 3 && !imageReady; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const check = await fetchTimed(imageUrl, 15_000);
        try {
          const contentType = check.response.headers.get("content-type") || "";
          imageReady = check.response.ok && contentType.startsWith("image/");
        } finally {
          check.clear();
        }
      } catch {
        imageReady = false;
      }
    }
    if (!imageReady) {
      res.json({ reply: "خدمة توليد الصور ممتلئة الآن. حاول بعد دقيقة." });
      return;
    }
    res.json({ reply: `إليك الصورة. (الوصف المستخدم: ${usedPrompt})`, imageUrl });
    return;
  }

    // Song generation; an attached image remains a vision question.
  const songExplicitlyRequested = "songRequest" in body && body.songRequest === true;
  const songBrief = image ? null : (songExplicitlyRequested ? message : getSongBrief(message));
  if (songBrief !== null) {
    if (!songBrief) {
      res.status(400).json({ error: "اكتب وصفًا للأغنية التي تريد توليدها." });
      return;
    }
    if (songBrief.length > 2000) {
      res.status(400).json({ error: "وصف الأغنية طويل جدًا (الحد الأقصى 2000 حرف)." });
      return;
    }
    if (!acemusicKey) {
      res.json({ reply: "توليد الأغاني غير مهيأ. أضف ACEMUSIC_API_KEY إلى إعدادات الخادم." });
      return;
    }
    try {
      const audioUrl = await generateSong(songBrief);
      res.json({ reply: `إليك الأغنية 🎵 (الوصف: ${songBrief})`, audioUrl });
    } catch (error) {
      console.error("Song generation failed:", error);
      res.json({ reply: "تعذر توليد الأغنية الآن. حاول مجددًا." });
    }
    return;
  }

  // Attachments are always treated as vision input, not as tool requests.
  if (!image) {
    const pageMatch = urlPattern.exec(message);
    if (pageMatch) {
      let pageText: string;
      try {
        pageText = await readWebPage(pageMatch[0].replace(/[),.!?،؛]+$/u, ""));
      } catch (error) {
        console.error("Page read failed:", error);
        res.json({ reply: "تعذر فتح الرابط. تحقق منه وحاول مجددًا." });
        return;
      }
      if (pageText.length < 200) {
        res.json({ reply: "تعذرت قراءة محتوى هذه الصفحة (قد تكون صفحة تفاعلية)." });
        return;
      }
      try {
        const answer = await requestOpenRouter([
          { role: "system", content: "لخّص محتوى صفحة الويب التالية بالعربية، ثم أجب عن سؤال المستخدم بناءً على محتواها فقط." },
          { role: "user", content: `رسالة المستخدم: ${message}\n\nمحتوى الصفحة:\n${pageText}` },
        ], model, effectiveKey);
        res.json({ reply: answer });
      } catch (error) {
        console.error("Page summary failed:", error);
        res.json({ reply: "تعذر تلخيص الصفحة الآن. حاول مجددًا." });
      }
      return;
    }

    const weatherCity = triggerRemainder(message, ["حالة الطقس", "الطقس", "طقس"]);
    if (weatherCity !== null) {
      try {
        res.json({ reply: await getWeather(cleanCityName(weatherCity) || "دمشق") });
      } catch (error) {
        console.error("Weather tool failed:", error);
        res.json({ reply: "تعذر الحصول على حالة الطقس الآن. حاول مجددًا." });
      }
      return;
    }

    const prayerCity = triggerRemainder(message, ["أوقات الصلاة", "اوقات الصلاة", "مواقيت الصلاة"]);
    if (prayerCity !== null) {
      try {
        res.json({ reply: await getPrayerTimes(cleanCityName(prayerCity) || "دمشق") });
      } catch (error) {
        console.error("Prayer times tool failed:", error);
        res.json({ reply: "تعذر الحصول على مواقيت الصلاة الآن. حاول مجددًا." });
      }
      return;
    }

    if (triggerRemainder(message, ["سعر الدولار", "سعر الصرف", "أسعار العملات", "اسعار العملات", "الدولار"]) !== null) {
      try {
        res.json({ reply: await getCurrencyRates() });
      } catch (error) {
        console.error("Currency tool failed:", error);
        res.json({ reply: "تعذر الحصول على أسعار العملات الآن. حاول مجددًا." });
      }
      return;
    }

    const wikipediaTerm = triggerRemainder(message, ["ابحث في ويكيبيديا عن", "ويكيبيديا"]);
    if (wikipediaTerm !== null) {
      if (!wikipediaTerm) {
        res.json({ reply: "اكتب موضوعًا للبحث عنه في ويكيبيديا." });
        return;
      }
      try {
        res.json({ reply: await getWikipediaSummary(wikipediaTerm) });
      } catch (error) {
        console.error("Wikipedia tool failed:", error);
        res.json({ reply: "تعذر البحث في ويكيبيديا الآن. حاول مجددًا." });
      }
      return;
    }
  }

  if (!effectiveKey) {
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
    { role: "system", content: "أنت مِداد، مساعد ذكي بالعربية. أجب دائماً باللغة العربية، حتى لو سُئلت بلغة أخرى. عند وصف صورة، اقرأ النص العربي فيها بعناية وانقله كما هو دون تخمين." },
    ...history,
    userMessage,
  ];

  try {
    const answer = await requestOpenRouter(messages, image ? visionModel : model, effectiveKey);
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

const ttsVoices: Record<string, string> = {
  "ar-AE-FatimaNeural": "ar-AE",
  "ar-AE-HamdanNeural": "ar-AE",
  "ar-BH-AliNeural": "ar-BH",
  "ar-BH-LailaNeural": "ar-BH",
  "ar-DZ-AminaNeural": "ar-DZ",
  "ar-DZ-IsmaelNeural": "ar-DZ",
  "ar-EG-SalmaNeural": "ar-EG",
  "ar-EG-ShakirNeural": "ar-EG",
  "ar-IQ-RanaNeural": "ar-IQ",
  "ar-IQ-BasselNeural": "ar-IQ",
  "ar-JO-SanaNeural": "ar-JO",
  "ar-JO-TaimNeural": "ar-JO",
  "ar-KW-FahedNeural": "ar-KW",
  "ar-KW-NouraNeural": "ar-KW",
  "ar-LB-LaylaNeural": "ar-LB",
  "ar-LB-RamiNeural": "ar-LB",
  "ar-LY-ImanNeural": "ar-LY",
  "ar-LY-OmarNeural": "ar-LY",
  "ar-MA-JamalNeural": "ar-MA",
  "ar-MA-MounaNeural": "ar-MA",
  "ar-OM-AbdullahNeural": "ar-OM",
  "ar-OM-AyshaNeural": "ar-OM",
  "ar-QA-AmalNeural": "ar-QA",
  "ar-QA-MoazNeural": "ar-QA",
  "ar-SA-HamedNeural": "ar-SA",
  "ar-SA-ZariyahNeural": "ar-SA",
  "ar-SY-AmanyNeural": "ar-SY",
  "ar-SY-LaithNeural": "ar-SY",
  "ar-TN-HediNeural": "ar-TN",
  "ar-TN-ReemNeural": "ar-TN",
  "ar-YE-MaryamNeural": "ar-YE",
  "ar-YE-SalehNeural": "ar-YE",
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function synthesizeSpeech(text: string, voice: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lang = ttsVoices[voice];
    if (!lang) {
      reject(new Error("Unknown voice."));
      return;
    }
    const connectionId = crypto.randomUUID().replace(/-/g, "");
    const socket = new WebSocket(
      `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connectionId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
        },
      },
    );
    const chunks: Buffer[] = [];
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      socket.close();
      reject(new Error("Speech synthesis timed out."));
    }, 30_000);
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(Buffer.concat(chunks));
    };
    socket.on("open", () => {
      const timestamp = new Date().toISOString();
      socket.send(
        `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`,
      );
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'>${escapeXml(text)}</voice></speak>`;
      socket.send(
        `X-RequestId:${crypto.randomUUID().replace(/-/g, "")}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}\r\nPath:ssml\r\n\r\n${ssml}`,
      );
    });
    socket.on("message", (data) => {
      const buffer = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data as ArrayBuffer);
      const separator = buffer.indexOf("\r\n\r\n");
      if (separator === -1) return;
      const header = buffer.subarray(0, separator).toString("utf8");
      if (header.includes("Path:audio")) chunks.push(buffer.subarray(separator + 4));
      if (header.includes("Path:turn.end")) {
        socket.close();
        finish();
      }
    });
    socket.on("error", (error) => finish(error));
    socket.on("close", () => {
      if (chunks.length > 0) finish();
    });
  });
}

app.post("/api/tts", async (req, res) => {
  const body: unknown = req.body;
  if (typeof body !== "object" || body === null) {
    res.status(400).json({ error: "أرسل نصًا وصوتًا صالحين." });
    return;
  }
  const text = "text" in body && typeof body.text === "string" ? body.text.trim() : "";
  const voice = "voice" in body && typeof body.voice === "string" ? body.voice : "";
  if (!text || text.length > 2000) {
    res.status(400).json({ error: "النص المطلوب نطقه غير صالح." });
    return;
  }
  if (!(voice in ttsVoices)) {
    res.status(400).json({ error: "الصوت المطلوب غير معروف." });
    return;
  }
  try {
    const audio = await synthesizeSpeech(text, voice);
    if (audio.length === 0) throw new Error("Empty audio.");
    res.set("Content-Type", "audio/mpeg");
    res.send(audio);
  } catch (error) {
    console.error("TTS request failed:", error);
    res.status(502).json({ error: "تعذر نطق النص بهذا الصوت الآن. حاول مجددًا." });
  }
});

app.listen(port, () => {
  console.log(`OpenRouter chat app listening on port ${port}`);
});
