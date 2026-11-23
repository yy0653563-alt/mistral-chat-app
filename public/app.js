const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const attachButton = document.querySelector("#attach-button");
const imageModeButton = document.querySelector("#image-mode-button");
const imageModeHint = document.querySelector("#image-mode-hint");
const plusButton = document.querySelector("#plus-button");
const plusMenu = document.querySelector("#plus-menu");
const plusSongButton = document.querySelector("#plus-song-button");
const plusImageButton = document.querySelector("#plus-image-button");
const plusAttachButton = document.querySelector("#plus-attach-button");
const songModeHint = document.querySelector("#song-mode-hint");
const voiceInputButton = document.querySelector("#voice-input-button");
const voiceSelect = document.querySelector("#voice-select");
const imageInput = document.querySelector("#image-input");
const imagePreview = document.querySelector("#image-preview");
const imagePreviewThumbnail = document.querySelector("#image-preview-thumbnail");
const removeImageButton = document.querySelector("#remove-image-button");
const messagesElement = document.querySelector("#messages");
const welcome = document.querySelector("#welcome");
const sidebar = document.querySelector("#sidebar");
const menuButton = document.querySelector("#menu-button");
const sidebarBackdrop = document.querySelector("#sidebar-backdrop");
const closeSidebarButton = document.querySelector("#close-sidebar-button");
const clearChatButton = document.querySelector("#clear-chat-button");
const saveChatButton = document.querySelector("#save-chat-button");
const apiKeyInput = document.querySelector("#api-key-input");
const saveKeyButton = document.querySelector("#save-key-button");
const clearKeyButton = document.querySelector("#clear-key-button");
const keyStatus = document.querySelector("#key-status");

/** @type {{ role: "user" | "assistant", content: string }[]} */
const history = [];
let selectedImage = "";
let imageMode = false;
let songMode = false;
let clearConfirmationTimer = null;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let recognitionBaseText = "";
let activeUtterance = null;
let activeSpeechButton = null;
let activeAudio = null;

function scrollToLatest() {
  messagesElement.scrollTo({ top: messagesElement.scrollHeight, behavior: "smooth" });
}

function openSidebar() {
  sidebarBackdrop.hidden = false;
  requestAnimationFrame(() => sidebarBackdrop.classList.add("visible"));
  sidebar.classList.add("open");
  sidebar.removeAttribute("inert");
  sidebar.setAttribute("aria-hidden", "false");
  menuButton.setAttribute("aria-expanded", "true");
  closeSidebarButton.focus();
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarBackdrop.classList.remove("visible");
  sidebar.setAttribute("inert", "");
  sidebar.setAttribute("aria-hidden", "true");
  menuButton.setAttribute("aria-expanded", "false");
  window.setTimeout(() => {
    if (!sidebar.classList.contains("open")) sidebarBackdrop.hidden = true;
  }, 260);
}

menuButton.addEventListener("click", () => {
  if (sidebar.classList.contains("open")) closeSidebar();
  else openSidebar();
});
closeSidebarButton.addEventListener("click", closeSidebar);
sidebarBackdrop.addEventListener("click", closeSidebar);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sidebar.classList.contains("open")) {
    closeSidebar();
    menuButton.focus();
  }
});

function resetSpeechButton(button) {
  if (!button) return;
  button.classList.remove("speaking");
  button.setAttribute("aria-pressed", "false");
}

function stopSpeaking() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  resetSpeechButton(activeSpeechButton);
  activeSpeechButton = null;
  activeUtterance = null;
}

function speakMessage(text, button) {
  if (activeSpeechButton === button) {
    stopSpeaking();
    return;
  }
  stopSpeaking();
  const spokenText = text.replace(/[\*#]/g, "").trim();
  if (!spokenText) return;
  const selectedVoice = voiceSelect ? voiceSelect.value : "phone";
  if (selectedVoice !== "phone") {
    speakWithCloudVoice(spokenText, button, selectedVoice);
  } else {
    speakWithPhoneVoice(spokenText, button);
  }
}

function speakWithPhoneVoice(spokenText, button) {
  if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") return;
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

  const chooseArabicVoice = () => window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("ar"));
  const voice = chooseArabicVoice();
  if (voice) {
    utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  } else if (window.speechSynthesis.getVoices().length === 0) {
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

async function speakWithCloudVoice(text, button, voiceName) {
    activeSpeechButton = button;
    button.classList.add("speaking");
    button.setAttribute("aria-pressed", "true");
  for (let attempt = 0; attempt < 2; attempt++) {
      try {
            const response = await fetch("/api/tts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text, voice: voiceName }),
            });
            if (!response.ok) throw new Error("TTS request failed.");
            const blob = await response.blob();
            if (activeSpeechButton !== button) return;
            const audio = new Audio(URL.createObjectURL(blob));
            activeAudio = audio;
            audio.onended = () => {
                    URL.revokeObjectURL(audio.src);
                    if (activeAudio === audio) activeAudio = null;
                    resetSpeechButton(button);
                    if (activeSpeechButton === button) activeSpeechButton = null;
            };
            audio.onerror = audio.onended;
            await audio.play();
        return;
      } catch {
            if (activeSpeechButton !== button) return;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (activeSpeechButton !== button) return;
          continue;
        }
            resetSpeechButton(button);
            activeSpeechButton = null;
            speakWithPhoneVoice(text, button);
      }
  }
  }
async function downloadVoice(text, button) {
  const spokenText = text.replace(/[\*#]/g, "").trim();
  if (!spokenText) return;
  const selectedVoice = voiceSelect ? voiceSelect.value : "phone";
  const voiceName = selectedVoice !== "phone" ? selectedVoice : "ar-SY-LaithNeural";
  button.disabled = true;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: spokenText, voice: voiceName }),
      });
      if (!response.ok) throw new Error("TTS request failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "midad-voice.mp3";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      button.disabled = false;
      return;
    } catch {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      button.disabled = false;
      addMessage("assistant", "تعذّر تنزيل الصوت. تحقق من الاتصال وحاول مجددًا.", true);
    }
  }
}
function addMessage(role, text, isError = false, imageUrl = "", audioUrl = "") {
  welcome?.remove();
  const row = document.createElement("div");
  row.className = `message-row ${role === "user" ? "from-user" : "from-assistant"}`;
  row.dataset.role = role;
  row.dataset.content = text;
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
    if (audioUrl) {
    const audio = document.createElement("audio");
    audio.className = "chat-audio";
    audio.controls = true;
    audio.src = audioUrl;
    bubble.append(audio);
    const downloadLink = document.createElement("a");
    downloadLink.className = "chat-audio-download";
    downloadLink.href = audioUrl;
    downloadLink.download = "midad-song.mp3";
    downloadLink.textContent = "تحميل الأغنية";
    bubble.append(downloadLink);
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
    const downloadButton = document.createElement("button");
    downloadButton.className = "speak-button";
    downloadButton.type = "button";
    downloadButton.textContent = "⬇️";
    downloadButton.setAttribute("aria-label", "تنزيل الصوت");
    downloadButton.addEventListener("click", () => downloadVoice(text, downloadButton));
    bubble.append(speakButton);
    bubble.append(downloadButton);
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

function setSongMode(active) {
  songMode = active;
  songModeHint.hidden = !active;
  input.placeholder = active ? "اكتب وصف الأغنية..." : "اكتب رسالتك هنا...";
}
function closePlusMenu() {
  plusMenu.hidden = true;
  plusButton.setAttribute("aria-expanded", "false");
}
plusButton.addEventListener("click", () => {
  const open = plusMenu.hidden;
  plusMenu.hidden = !open;
  plusButton.setAttribute("aria-expanded", String(open));
  if (open) plusSongButton.focus();
});
document.addEventListener("click", (event) => {
  if (!plusMenu.hidden && !event.target.closest("#plus-menu") && !event.target.closest("#plus-button")) closePlusMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePlusMenu();
});
plusSongButton.addEventListener("click", () => {
  setSongMode(!songMode);
  setImageMode(false);
  closePlusMenu();
  input.focus();
});
plusImageButton.addEventListener("click", () => {
  setImageMode(!imageMode);
  setSongMode(false);
  closePlusMenu();
  input.focus();
});
plusAttachButton.addEventListener("click", () => {
  closePlusMenu();
  imageInput.click();
});

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
    for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0].transcript;
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
    closeSidebar();
  });
} else {
  voiceInputButton.hidden = true;
}

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
});

attachButton.addEventListener("click", () => {
  closeSidebar();
  imageInput.click();
});
imageModeButton.addEventListener("click", () => {
  setImageMode(!imageMode);
  closeSidebar();
});

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

function resetClearConfirmation() {
  if (clearConfirmationTimer !== null) window.clearTimeout(clearConfirmationTimer);
  clearConfirmationTimer = null;
  clearChatButton.textContent = "مسح المحادثة 🗑️";
}

clearChatButton.addEventListener("click", () => {
  if (clearConfirmationTimer !== null) {
    resetClearConfirmation();
    stopSpeaking();
    if (isListening) recognition.stop();
    history.length = 0;
    messagesElement.replaceChildren(welcome);
    clearSelectedImage();
    setImageMode(false);
    input.value = "";
    input.style.height = "auto";
    closeSidebar();
    return;
  }
  clearChatButton.textContent = "اضغط مجددًا للتأكيد";
  clearConfirmationTimer = window.setTimeout(resetClearConfirmation, 3000);
});

saveChatButton.addEventListener("click", () => {
  const visibleMessages = [...messagesElement.querySelectorAll(".message-row[data-role]")]
    .map((row) => ({ role: row.dataset.role, content: row.dataset.content || "" }))
    .filter((message) => message.content.trim());
  const messages = visibleMessages.length ? visibleMessages : history;
  if (!messages.length) {
    addMessage("assistant", "لا توجد محادثة لحفظها.", true);
    closeSidebar();
    return;
  }
  const content = messages.map(({ role, content }) => `${role === "user" ? "أنت" : "مِداد"}: ${content}`).join("\n\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = "midad-chat.txt";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
  closeSidebar();
});

const storedApiKey = localStorage.getItem("midad_openrouter_key") || "";
if (storedApiKey) {
  apiKeyInput.value = storedApiKey;
  keyStatus.textContent = "تم حفظ المفتاح في متصفحك.";
}
saveKeyButton.addEventListener("click", () => {
  const value = apiKeyInput.value.trim();
  if (!value) {
    keyStatus.textContent = "اكتب المفتاح أولاً.";
    return;
  }
  localStorage.setItem("midad_openrouter_key", value);
  keyStatus.textContent = "تم حفظ المفتاح في متصفحك.";
});
clearKeyButton.addEventListener("click", () => {
  localStorage.removeItem("midad_openrouter_key");
  apiKeyInput.value = "";
  keyStatus.textContent = "تم حذف المفتاح.";
});

const savedVoice = localStorage.getItem("midad_voice") || "phone";
if (voiceSelect) {
  voiceSelect.value = savedVoice;
  voiceSelect.addEventListener("change", () => {
    localStorage.setItem("midad_voice", voiceSelect.value);
    stopSpeaking();
  });
}

sidebar.querySelectorAll(".example-phrase").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.textContent.trim();
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    input.focus();
    closeSidebar();
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isListening) recognition.stop();
  const message = input.value.trim();
  const image = selectedImage;
  if (!message && !image) return;
  const requestImage = imageMode && !image;
  const requestSong = songMode && !image;

  addMessage("user", message, false, image);
  const previousHistory = history.slice(-20);
  if (message) history.push({ role: "user", content: message });
  clearSelectedImage();
  setImageMode(false);
  setSongMode(false);
  input.value = "";
  input.style.height = "auto";
  input.disabled = true;
  sendButton.disabled = true;
  attachButton.disabled = true;
  imageModeButton.disabled = true;
  plusButton.disabled = true;
  voiceInputButton.disabled = true;
  const typingRow = addTypingIndicator();

  try {
    const controller = new AbortController();
                const isSongRequest = requestSong || /(?:ولّد|ولد|أنشئ|انشئ|اعمل)\s+(?:لي\s+)?(?:أغنية|اغنية)|(?:أغنية|اغنية)|(?:غنّي|غنيلي)/u.test(message);
    const timeoutId = setTimeout(() => controller.abort(new Error("استغرق الرد وقتًا أطول من المتوقع. حاول مرة أخرى.")), isSongRequest ? 240_000 : 90_000);
    const savedKey = localStorage.getItem("midad_openrouter_key") || "";
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, ...(image ? { image } : {}), ...(requestImage ? { imageRequest: true } : {}), ...(requestSong ? { songRequest: true } : {}), ...(savedKey ? { apiKey: savedKey } : {}), history: previousHistory }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "حدث خطأ أثناء إرسال الرسالة.");
    if (typeof data.reply !== "string") throw new Error("وصل رد غير صالح من الخادم.");

    history.push({ role: "assistant", content: data.reply });
    typingRow.remove();
    addMessage("assistant", data.reply, false, typeof data.imageUrl === "string" ? data.imageUrl : "", typeof data.audioUrl === "string" ? data.audioUrl : "");
  } catch (error) {
    typingRow.remove();
    addMessage("assistant", error instanceof Error ? error.message : "حدث خطأ غير متوقع.", true);
  } finally {
    input.disabled = false;
    sendButton.disabled = false;
    attachButton.disabled = false;
    imageModeButton.disabled = false;
  plusButton.disabled = false;
    voiceInputButton.disabled = false;
    input.focus();
  }
});
