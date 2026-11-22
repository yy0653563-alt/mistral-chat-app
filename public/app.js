const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const attachButton = document.querySelector("#attach-button");
const imageModeButton = document.querySelector("#image-mode-button");
const imageModeHint = document.querySelector("#image-mode-hint");
const voiceInputButton = document.querySelector("#voice-input-button");
const imageInput = document.querySelector("#image-input");
const imagePreview = document.querySelector("#image-preview");
const imagePreviewThumbnail = document.querySelector("#image-preview-thumbnail");
const removeImageButton = document.querySelector("#remove-image-button");
const messagesElement = document.querySelector("#messages");
const welcome = document.querySelector("#welcome");

/** @type {{ role: "user" | "assistant", content: string }[]} */
const history = [];
let selectedImage = "";
let imageMode = false;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let recognitionBaseText = "";
let activeUtterance = null;
let activeSpeechButton = null;

function scrollToLatest() {
  messagesElement.scrollTo({ top: messagesElement.scrollHeight, behavior: "smooth" });
}

function resetSpeechButton(button) {
  if (!button) return;
  button.classList.remove("speaking");
  button.setAttribute("aria-pressed", "false");
}

function stopSpeaking() {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  resetSpeechButton(activeSpeechButton);
  activeSpeechButton = null;
  activeUtterance = null;
}

function speakMessage(text, button) {
  if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") return;
  if (activeSpeechButton === button) {
    stopSpeaking();
    return;
  }

  stopSpeaking();
  const spokenText = text.replace(/[\*#]/g, "").trim();
  if (!spokenText) return;

  const utterance = new SpeechSynthesisUtterance(spokenText);
  utterance.lang = "ar-SA";
  utterance.rate = 1;
  activeUtterance = utterance;
  activeSpeechButton = button;
  button.classList.add("speaking");
  button.setAttribute("aria-pressed", "true");

  const finish = () => {
    if (activeUtterance !== utterance) return;
    resetSpeechButton(activeSpeechButton);
    activeSpeechButton = null;
    activeUtterance = null;
  };
  utterance.onend = finish;
  utterance.onerror = finish;

  const chooseArabicVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    return voices.find((voice) => voice.lang.toLowerCase().startsWith("ar"));
  };
  const voice = chooseArabicVoice();
  if (voice) {
    utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  } else if (window.speechSynthesis.getVoices().length === 0) {
    // Some browsers load available voices asynchronously after voiceschanged.
    let completed = false;
    const speakWhenReady = () => {
      if (completed) return;
      completed = true;
      window.speechSynthesis.removeEventListener("voiceschanged", speakWhenReady);
      clearTimeout(voiceTimeout);
      if (activeUtterance !== utterance) return;
      const availableVoice = chooseArabicVoice();
      if (availableVoice) utterance.voice = availableVoice;
      window.speechSynthesis.speak(utterance);
    };
    const voiceTimeout = setTimeout(speakWhenReady, 1000);
    window.speechSynthesis.addEventListener("voiceschanged", speakWhenReady);
  } else {
    window.speechSynthesis.speak(utterance);
  }
}

function addMessage(role, text, isError = false, imageUrl = "") {
  welcome?.remove();
  const row = document.createElement("div");
  row.className = `message-row ${role === "user" ? "from-user" : "from-assistant"}`;
  const bubble = document.createElement("div");
  bubble.className = `bubble${isError ? " error-bubble" : ""}`;
  if (text) bubble.append(document.createTextNode(text));
  if (imageUrl) {
    const image = document.createElement("img");
    image.className = "chat-image";
    image.src = imageUrl;
    image.alt = "الصورة المرسلة";
    bubble.append(image);
  }
  if (role === "assistant" && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function") {
    const speakButton = document.createElement("button");
    speakButton.className = "speech-output-button";
    speakButton.type = "button";
    speakButton.setAttribute("aria-label", "قراءة الرد صوتيًا");
    speakButton.setAttribute("aria-pressed", "false");
    speakButton.title = "قراءة الرد صوتيًا";
    speakButton.textContent = "🔊";
    speakButton.addEventListener("click", () => speakMessage(text, speakButton));
    bubble.append(speakButton);
  }
  row.append(bubble);
  messagesElement.append(row);
  scrollToLatest();
  return row;
}

function clearSelectedImage() {
  selectedImage = "";
  imageInput.value = "";
  imagePreviewThumbnail.removeAttribute("src");
  imagePreview.hidden = true;
}

function setImageMode(active) {
  imageMode = active;
  imageModeButton.classList.toggle("active", active);
  imageModeButton.setAttribute("aria-pressed", String(active));
  imageModeHint.hidden = !active;
}

function setListening(active) {
  isListening = active;
  voiceInputButton.classList.toggle("listening", active);
  voiceInputButton.setAttribute("aria-pressed", String(active));
  voiceInputButton.title = active ? "إيقاف الإدخال الصوتي" : "إدخال صوتي";
}

function startListening() {
  recognitionBaseText = input.value.trim();
  try {
    recognition.start();
  } catch {
    addMessage("assistant", "تعذر بدء الإدخال الصوتي. حاول مرة أخرى.", true);
  }
}

function addTypingIndicator() {
  const row = document.createElement("div");
  row.className = "message-row from-assistant";
  row.setAttribute("aria-label", "جارٍ الكتابة");
  row.innerHTML = '<div class="bubble typing" aria-hidden="true"><i></i><i></i><i></i></div>';
  messagesElement.append(row);
  scrollToLatest();
  return row;
}

if (typeof SpeechRecognition === "function") {
  recognition = new SpeechRecognition();
  recognition.lang = "ar-SA";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.addEventListener("start", () => setListening(true));
  recognition.addEventListener("result", (event) => {
    let transcript = "";
    for (let index = 0; index < event.results.length; index += 1) {
      transcript += event.results[index][0].transcript;
    }
    input.value = `${recognitionBaseText}${recognitionBaseText && transcript ? " " : ""}${transcript}`;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  });
  recognition.addEventListener("end", () => setListening(false));
  recognition.addEventListener("error", (event) => {
    setListening(false);
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      addMessage("assistant", "تعذر الوصول إلى الميكروفون. تحقق من الإذن وحاول مجددًا.", true);
    } else if (event.error !== "aborted" && event.error !== "no-speech") {
      addMessage("assistant", "تعذر التعرف على الكلام. حاول مرة أخرى.", true);
    }
  });
  voiceInputButton.addEventListener("click", () => {
    if (isListening) recognition.stop();
    else startListening();
  });
} else {
  voiceInputButton.hidden = true;
}

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
});

attachButton.addEventListener("click", () => imageInput.click());
imageModeButton.addEventListener("click", () => setImageMode(!imageMode));

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    clearSelectedImage();
    addMessage("assistant", "يُرجى اختيار ملف صورة صالح.", true);
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    clearSelectedImage();
    addMessage("assistant", "حجم الصورة كبير جدًا. الحد الأقصى 5 ميغابايت.", true);
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    if (typeof reader.result !== "string" || !reader.result.startsWith("data:image/")) {
      clearSelectedImage();
      addMessage("assistant", "تعذرت قراءة الصورة. حاول اختيارها مرة أخرى.", true);
      return;
    }
    selectedImage = reader.result;
    imagePreviewThumbnail.src = selectedImage;
    imagePreview.hidden = false;
  });
  reader.addEventListener("error", () => {
    clearSelectedImage();
    addMessage("assistant", "تعذرت قراءة الصورة. حاول اختيارها مرة أخرى.", true);
  });
  reader.readAsDataURL(file);
});

removeImageButton.addEventListener("click", clearSelectedImage);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isListening) recognition.stop();
  const message = input.value.trim();
  const image = selectedImage;
  if (!message && !image) return;
  const requestImage = imageMode && !image;

  addMessage("user", message, false, image);
  const previousHistory = history.slice(-20);
  if (message) history.push({ role: "user", content: message });
  clearSelectedImage();
  setImageMode(false);
  input.value = "";
  input.style.height = "auto";
  input.disabled = true;
  sendButton.disabled = true;
  attachButton.disabled = true;
  imageModeButton.disabled = true;
  voiceInputButton.disabled = true;
  const typingRow = addTypingIndicator();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error("استغرق الرد وقتًا أطول من المتوقع. حاول مرة أخرى.")), 90_000);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, ...(image ? { image } : {}), ...(requestImage ? { imageRequest: true } : {}), history: previousHistory }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "حدث خطأ أثناء إرسال الرسالة.");
    if (typeof data.reply !== "string") throw new Error("وصل رد غير صالح من الخادم.");

    history.push({ role: "assistant", content: data.reply });
    typingRow.remove();
    addMessage("assistant", data.reply, false, typeof data.imageUrl === "string" ? data.imageUrl : "");
  } catch (error) {
    typingRow.remove();
    addMessage("assistant", error instanceof Error ? error.message : "حدث خطأ غير متوقع.", true);
  } finally {
    input.disabled = false;
    sendButton.disabled = false;
    attachButton.disabled = false;
    imageModeButton.disabled = false;
    voiceInputButton.disabled = false;
    input.focus();
  }
});
