const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const attachButton = document.querySelector("#attach-button");
const imageModeButton = document.querySelector("#image-mode-button");
const songModeButton = document.querySelector("#song-mode-button");
const imageModeHint = document.querySelector("#image-mode-hint");
const plusButton = document.querySelector("#plus-button");
const plusMenu = document.querySelector("#plus-menu");
const plusImageButton = document.querySelector("#plus-image-button");
const plusAttachButton = document.querySelector("#plus-attach-button");
const songModeHint = document.querySelector("#song-mode-hint");
const voiceprintStatus = document.querySelector("#voiceprint-status");
const voiceprintRecordButton = document.querySelector("#voiceprint-record-button");
const voiceprintStopButton = document.querySelector("#voiceprint-stop-button");
const voiceprintList = document.querySelector("#voiceprint-list");
const voiceprintUploadButton = document.querySelector("#voiceprint-upload-button");
const voiceprintFileInput = document.querySelector("#voiceprint-file-input");
const voiceprintBackupButton = document.querySelector("#voiceprint-backup-button");
const voiceprintRestoreButton = document.querySelector("#voiceprint-restore-button");
const voiceprintRestoreInput = document.querySelector("#voiceprint-restore-input");
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
  button.textContent = "⏳";
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
      button.textContent = "⬇️";
      return;
    } catch {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      button.disabled = false;
      button.textContent = "❌️";
      setTimeout(() => { button.textContent = "⬇️"; }, 3000);
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
  if (songModeButton) {
    songModeButton.classList.toggle("active", active);
    songModeButton.setAttribute("aria-pressed", String(active));
  }
  songModeHint.hidden = !active;
  input.placeholder = active ? "اكتب وصف الأغنية..." : "اكتب رسالتك هنا...";
  refreshVoiceprintRow();
}

const VOICEPRINT_KEY = "midad_voiceprint";
const VOICEPRINTS_KEY = "midad_voiceprints";
const VOICEPRINT_ACTIVE_KEY = "midad_voiceprint_active";
const VOICEPRINT_DB_NAME = "midad-voiceprints";
const VOICEPRINT_DB_STORE = "voices";
const VOICEPRINT_MAX_SECONDS = 20;
const VOICEPRINT_MIN_SECONDS = 3;
const VOICEPRINT_MAX_ENTRIES = 10;

let mediaRecorder = null;
let recordedChunks = [];
let recordingTimer = null;
let recordingStartedAt = 0;
let voiceprintAudio = null;
let voiceprintPlayingButton = null;
let voiceprintDbPromise = null;
let voiceprintUseLocalStorage = false;

function openVoiceprintDb() {
  if (voiceprintDbPromise) return voiceprintDbPromise;
  voiceprintDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(VOICEPRINT_DB_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore(VOICEPRINT_DB_STORE, { keyPath: "id" });
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
  return voiceprintDbPromise;
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function idbTransactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve);
    transaction.addEventListener("error", () => reject(transaction.error));
    transaction.addEventListener("abort", () => reject(transaction.error));
  });
}

function isValidVoiceprintEntry(entry) {
  return Boolean(entry) && typeof entry.data === "string" && typeof entry.format === "string" && typeof entry.id === "string";
}

function loadVoiceprintsFromLocalStorage() {
  try {
    const stored = JSON.parse(localStorage.getItem(VOICEPRINTS_KEY) || "null");
    if (Array.isArray(stored)) return stored.filter(isValidVoiceprintEntry);
  } catch {
    // Corrupted library: fall through to the legacy slot, then empty.
  }
  try {
    const legacy = JSON.parse(localStorage.getItem(VOICEPRINT_KEY) || "null");
    if (legacy && typeof legacy.data === "string" && typeof legacy.format === "string") {
      return [{ id: `vp-${Date.now()}`, name: legacy.name || (legacy.source === "upload" ? "مقطع مرفوع" : "صوتي"), data: legacy.data, format: legacy.format, source: legacy.source || "record", savedAt: legacy.savedAt || Date.now() }];
    }
  } catch {
    // Corrupted legacy entry: treat as no saved voice.
  }
  return [];
}

function saveVoiceprintsToLocalStorage(entries) {
  try {
    localStorage.setItem(VOICEPRINTS_KEY, JSON.stringify(entries));
    return true;
  } catch {
    addMessage("assistant", "تعذر حفظ الصوت في المتصفح (المساحة ممتلئة). احذف صوتًا قديمًا من المكتبة.", true);
    return false;
  }
}

async function loadVoiceprints() {
  if (voiceprintUseLocalStorage) return loadVoiceprintsFromLocalStorage();
  try {
    const db = await openVoiceprintDb();
    const entries = await idbRequest(db.transaction(VOICEPRINT_DB_STORE, "readonly").objectStore(VOICEPRINT_DB_STORE).getAll());
    const valid = (entries || []).filter(isValidVoiceprintEntry);
    if (valid.length > 0) return valid;
    const migrated = loadVoiceprintsFromLocalStorage();
    if (migrated.length > 0) {
      const tx = db.transaction(VOICEPRINT_DB_STORE, "readwrite");
      const store = tx.objectStore(VOICEPRINT_DB_STORE);
      migrated.forEach((entry) => store.put(entry));
      await idbTransactionDone(tx);
      try {
        localStorage.removeItem(VOICEPRINTS_KEY);
        localStorage.removeItem(VOICEPRINT_KEY);
      } catch {
        // Ignore: the old keys staying behind is harmless.
      }
      return migrated;
    }
    return [];
  } catch {
    voiceprintUseLocalStorage = true;
    return loadVoiceprintsFromLocalStorage();
  }
}

async function saveVoiceprints(entries) {
  if (voiceprintUseLocalStorage) return saveVoiceprintsToLocalStorage(entries);
  try {
    const db = await openVoiceprintDb();
    const tx = db.transaction(VOICEPRINT_DB_STORE, "readwrite");
    const store = tx.objectStore(VOICEPRINT_DB_STORE);
    const existingKeys = await idbRequest(store.getAllKeys());
    existingKeys.forEach((key) => {
      if (!entries.some((entry) => entry.id === key)) store.delete(key);
    });
    entries.forEach((entry) => store.put(entry));
    await idbTransactionDone(tx);
    return true;
  } catch {
    voiceprintUseLocalStorage = true;
    return saveVoiceprintsToLocalStorage(entries);
  }
}

function getActiveVoiceprintId() {
  return localStorage.getItem(VOICEPRINT_ACTIVE_KEY) || "";
}

function setActiveVoiceprintId(id) {
  if (id) localStorage.setItem(VOICEPRINT_ACTIVE_KEY, id);
  else localStorage.removeItem(VOICEPRINT_ACTIVE_KEY);
}

function findActiveVoiceprint(entries) {
  const activeId = getActiveVoiceprintId();
  return entries.find((entry) => entry.id === activeId) || null;
}

async function getActiveVoiceprint() {
  return findActiveVoiceprint(await loadVoiceprints());
}

async function loadVoiceprint() {
  return getActiveVoiceprint();
}

function nextVoiceName(entries) {
  let n = 1;
  const names = new Set(entries.map((entry) => entry.name));
  while (names.has(`صوت ${n}`)) n++;
  return `صوت ${n}`;
}

async function addVoiceprintToLibrary(entry) {
  const entries = await loadVoiceprints();
  if (entries.length >= VOICEPRINT_MAX_ENTRIES) {
    addMessage("assistant", "المكتبة ممتلئة (10 أصوات). احذف صوتًا قديمًا قبل إضافة صوت جديد.", true);
    return false;
  }
  if (!(await saveVoiceprints([...entries, entry]))) return false;
  setActiveVoiceprintId(entry.id);
  return true;
}

async function refreshVoiceprintRow() {
  const recording = mediaRecorder && mediaRecorder.state === "recording";
  if (recording) return;
  stopVoiceprintPreview();
  const entries = await loadVoiceprints();
  const active = findActiveVoiceprint(entries);
  voiceprintList.innerHTML = "";
  const noneRow = document.createElement("div");
  noneRow.className = "voiceprint-list-item" + (!active ? " selected" : "");
  const noneSelectButton = document.createElement("button");
  noneSelectButton.type = "button";
  noneSelectButton.className = "voiceprint-list-select";
  noneSelectButton.textContent = !active ? "●" : "○";
  noneSelectButton.setAttribute("aria-label", "اختيار");
  noneSelectButton.addEventListener("click", () => {
    stopVoiceprintPreview();
    setActiveVoiceprintId("");
    refreshVoiceprintRow();
  });
  const noneButton = document.createElement("button");
  noneButton.type = "button";
  noneButton.className = "voiceprint-list-name";
  noneButton.textContent = (!active ? "✓ " : "") + "بدون صوت مرجعي";
  noneButton.addEventListener("click", () => {
    stopVoiceprintPreview();
    setActiveVoiceprintId("");
    refreshVoiceprintRow();
  });
  noneRow.append(noneSelectButton, noneButton);
  voiceprintList.appendChild(noneRow);
  entries.forEach((entry) => {
    const row = document.createElement("div");
    const isActive = Boolean(active) && active.id === entry.id;
    row.className = "voiceprint-list-item" + (isActive ? " selected" : "");
    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "voiceprint-list-select";
    selectButton.textContent = isActive ? "●" : "○";
    selectButton.setAttribute("aria-label", "اختيار");
    selectButton.addEventListener("click", () => {
      stopVoiceprintPreview();
      setActiveVoiceprintId(entry.id);
      refreshVoiceprintRow();
    });
    const nameButton = document.createElement("button");
    nameButton.type = "button";
    nameButton.className = "voiceprint-list-name";
    nameButton.textContent = (isActive ? "✓ " : "") + (entry.name || "صوت");
    nameButton.addEventListener("click", () => {
      stopVoiceprintPreview();
      setActiveVoiceprintId(entry.id);
      refreshVoiceprintRow();
    });
    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "voiceprint-list-action";
    playButton.textContent = "▶";
    playButton.setAttribute("aria-label", "استمع");
    playButton.addEventListener("click", () => toggleVoiceprintPreview(entry, playButton));
    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "voiceprint-list-action";
    renameButton.textContent = "✏️";
    renameButton.setAttribute("aria-label", "تسمية");
    renameButton.addEventListener("click", () => renameVoiceprint(entry));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "voiceprint-list-action danger";
    deleteButton.textContent = "✕";
    deleteButton.setAttribute("aria-label", "حذف");
    deleteButton.addEventListener("click", () => deleteVoiceprint(entry));
    row.append(selectButton, nameButton, playButton, renameButton, deleteButton);
    voiceprintList.appendChild(row);
  });
  voiceprintList.hidden = entries.length === 0;
  voiceprintUploadButton.hidden = false;
  voiceprintRecordButton.hidden = false;
  voiceprintStopButton.hidden = true;
  if (entries.length === 0) {
    voiceprintStatus.textContent = "سجّل 10–20 ثانية من صوتك (غنِّ أو دندن لحنًا) أو ارفع مقطعًا صوتيًا قصيرًا، وستُغنّى الأغنية بصوتك أو على لحن المقطع.";
    voiceprintRecordButton.textContent = "🎤 سجّل صوتك";
  } else if (active) {
    voiceprintStatus.textContent = active.source === "upload"
      ? `✓ المقطع «${active.name}» محفوظ — ستُغنّى الأغنية على لحنه وأدائه.`
      : `✓ الصوت «${active.name}» محفوظ — ستُغنّى الأغنية بصوتك.`;
    voiceprintRecordButton.textContent = "🎤 سجّل صوتًا جديدًا";
  } else {
    voiceprintStatus.textContent = "اختر صوتًا من المكتبة، أو سجّل صوتًا جديدًا، أو ارفع مقطعًا.";
    voiceprintRecordButton.textContent = "🎤 سجّل صوتًا جديدًا";
  }
}

function stopVoiceprintPreview() {
  if (voiceprintAudio) {
    voiceprintAudio.pause();
    voiceprintAudio = null;
  }
  if (voiceprintPlayingButton) {
    voiceprintPlayingButton.textContent = "▶";
    voiceprintPlayingButton = null;
  }
}

function toggleVoiceprintPreview(entry, button) {
  if (voiceprintAudio && voiceprintPlayingButton === button) {
    stopVoiceprintPreview();
    return;
  }
  stopVoiceprintPreview();
  const mime = entry.format === "mp4" ? "audio/mp4" : entry.format === "ogg" ? "audio/ogg" : entry.format === "wav" ? "audio/wav" : entry.format === "flac" ? "audio/flac" : entry.format === "mp3" ? "audio/mpeg" : "audio/webm";
  voiceprintAudio = new Audio(`data:${mime};base64,${entry.data}`);
  voiceprintPlayingButton = button;
  button.textContent = "⏸";
  voiceprintAudio.addEventListener("ended", stopVoiceprintPreview);
  voiceprintAudio.addEventListener("error", () => {
    stopVoiceprintPreview();
    addMessage("assistant", "تعذر تشغيل التسجيل المحفوظ.", true);
  });
  voiceprintAudio.play().catch(() => {
    stopVoiceprintPreview();
    addMessage("assistant", "تعذر تشغيل التسجيل المحفوظ.", true);
  });
}

async function deleteVoiceprint(entry) {
  stopVoiceprintPreview();
  const entries = (await loadVoiceprints()).filter((item) => item.id !== entry.id);
  if (await saveVoiceprints(entries)) {
    if (getActiveVoiceprintId() === entry.id) {
      setActiveVoiceprintId(entries.length > 0 ? entries[entries.length - 1].id : "");
    }
  }
  refreshVoiceprintRow();
}

async function renameVoiceprint(entry) {
  const name = prompt("اسم جديد للصوت:", entry.name || "");
  if (name === null) return;
  const trimmed = name.trim().slice(0, 30);
  if (!trimmed) return;
  const entries = (await loadVoiceprints()).map((item) => item.id === entry.id ? { ...item, name: trimmed } : item);
  if (await saveVoiceprints(entries)) refreshVoiceprintRow();
}

async function exportVoiceprintLibrary() {
  const entries = await loadVoiceprints();
  if (entries.length === 0) {
    addMessage("assistant", "المكتبة فارغة — لا يوجد ما تحفظه.", true);
    return;
  }
  const backup = { version: 1, exportedAt: Date.now(), activeId: getActiveVoiceprintId(), voices: entries };
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "midad-voices-backup.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseVoiceprintBackup(text) {
  try {
    const backup = JSON.parse(text);
    if (!backup || !Array.isArray(backup.voices)) return null;
    const voices = backup.voices.filter(isValidVoiceprintEntry);
    if (voices.length === 0) return null;
    return { voices, activeId: typeof backup.activeId === "string" ? backup.activeId : "" };
  } catch {
    return null;
  }
}

async function importVoiceprintLibrary(file) {
  if (!file) return;
  let text = "";
  try {
    text = await file.text();
  } catch {
    addMessage("assistant", "تعذر قراءة الملف. حاول مرة أخرى.", true);
    return;
  }
  const backup = parseVoiceprintBackup(text);
  if (!backup) {
    addMessage("assistant", "الملف ليس نسخة احتياطية صالحة لمكتبة الأصوات.", true);
    return;
  }
  const existing = await loadVoiceprints();
  const existingIds = new Set(existing.map((entry) => entry.id));
  const merged = [...existing];
  let added = 0;
  for (const voice of backup.voices) {
    if (merged.length >= VOICEPRINT_MAX_ENTRIES) break;
    if (existingIds.has(voice.id)) continue;
    merged.push(voice);
    added++;
  }
  if (added === 0) {
    addMessage("assistant", "كل الأصوات في النسخة موجودة أصلًا في المكتبة.", true);
    return;
  }
  if (await saveVoiceprints(merged)) {
    if (backup.activeId && merged.some((entry) => entry.id === backup.activeId)) setActiveVoiceprintId(backup.activeId);
    addMessage("assistant", `تمت الاستعادة: ${added} ${added === 1 ? "صوت" : "أصوات"} أُضيفت إلى المكتبة.`);
  }
  refreshVoiceprintRow();
}

function formatVoiceprintTime(seconds) {
  return `0:${String(seconds).padStart(2, "0")}`;
}

function updateRecordingStatus() {
  const elapsed = Math.min(VOICEPRINT_MAX_SECONDS, Math.floor((Date.now() - recordingStartedAt) / 1000));
  voiceprintStatus.textContent = `جارٍ التسجيل… ${formatVoiceprintTime(elapsed)} / ${formatVoiceprintTime(VOICEPRINT_MAX_SECONDS)} — غنِّ أو دندن`;
}

async function startVoiceprintRecording() {
  stopVoiceprintPreview();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
    addMessage("assistant", "متصفحك لا يدعم تسجيل الصوت.", true);
    return;
  }
  const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
  const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    addMessage("assistant", "تعذر الوصول إلى الميكروفون. اسمح بالميكروفون من إعدادات المتصفح ثم حاول مجددًا.", true);
    return;
  }
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", () => {
    stream.getTracks().forEach((track) => track.stop());
    clearInterval(recordingTimer);
    recordingTimer = null;
    const elapsed = (Date.now() - recordingStartedAt) / 1000;
    const recorder = mediaRecorder;
    mediaRecorder = null;
    if (elapsed < VOICEPRINT_MIN_SECONDS) {
      refreshVoiceprintRow();
      voiceprintStatus.textContent = "التسجيل قصير جدًا — سجّل 10 ثوانٍ على الأقل.";
      return;
    }
    const blob = new Blob(recordedChunks, { type: recorder.mimeType || "audio/webm" });
    const format = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      const dataUrl = String(reader.result || "");
      const base64 = dataUrl.split(",", 2)[1] || "";
      if (!base64) {
        addMessage("assistant", "تعذر حفظ التسجيل. حاول مرة أخرى.", true);
        refreshVoiceprintRow();
        return;
      }
      await addVoiceprintToLibrary({ id: `vp-${Date.now()}`, name: nextVoiceName(await loadVoiceprints()), data: base64, format, source: "record", savedAt: Date.now() });
      refreshVoiceprintRow();
    });
    reader.addEventListener("error", () => {
      addMessage("assistant", "تعذر حفظ التسجيل. حاول مرة أخرى.", true);
      refreshVoiceprintRow();
    });
    reader.readAsDataURL(blob);
  });
  mediaRecorder.start();
  recordingStartedAt = Date.now();
  voiceprintRecordButton.hidden = true;
  voiceprintUploadButton.hidden = true;
  voiceprintStopButton.hidden = false;
  voiceprintList.hidden = true;
  updateRecordingStatus();
  recordingTimer = setInterval(() => {
    updateRecordingStatus();
    if (Date.now() - recordingStartedAt >= VOICEPRINT_MAX_SECONDS * 1000 && mediaRecorder) mediaRecorder.stop();
  }, 500);
}

function stopVoiceprintRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
}

const VOICEPRINT_MAX_FILE_BYTES = 3_000_000;

function voiceprintFormatFromFile(file) {
  const type = (file.type || "").toLowerCase();
  if (type.includes("mp4") || type.includes("m4a")) return "mp4";
  if (type.includes("ogg") || type.includes("opus")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (type.includes("flac")) return "flac";
  if (type.includes("webm")) return "webm";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".mp4") || name.endsWith(".m4a")) return "mp4";
  if (name.endsWith(".ogg") || name.endsWith(".opus")) return "ogg";
  if (name.endsWith(".wav")) return "wav";
  if (name.endsWith(".flac")) return "flac";
  if (name.endsWith(".webm")) return "webm";
  if (name.endsWith(".mp3")) return "mp3";
  return "";
}

function handleVoiceprintFile(file) {
  if (!file) return;
  const format = voiceprintFormatFromFile(file);
  if (!format) {
    addMessage("assistant", "صيغة الملف غير مدعومة. ارفع مقطعًا صوتيًا (mp3 أو wav أو webm أو غيرها).", true);
    return;
  }
  if (file.size > VOICEPRINT_MAX_FILE_BYTES) {
    addMessage("assistant", "المقطع كبير جدًا — ارفع مقطعًا قصيرًا (10–30 ثانية).", true);
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    const dataUrl = String(reader.result || "");
    const base64 = dataUrl.split(",", 2)[1] || "";
    if (!base64) {
      addMessage("assistant", "تعذر قراءة الملف. حاول مرة أخرى.", true);
      return;
    }
    const clipName = (file.name || "").replace(/\.[^.]+$/, "").slice(0, 30) || "مقطع";
    await addVoiceprintToLibrary({ id: `vp-${Date.now()}`, name: clipName, data: base64, format, source: "upload", savedAt: Date.now() });
    refreshVoiceprintRow();
  });
  reader.addEventListener("error", () => {
    addMessage("assistant", "تعذر قراءة الملف. حاول مرة أخرى.", true);
  });
  reader.readAsDataURL(file);
}

voiceprintRecordButton.addEventListener("click", startVoiceprintRecording);
voiceprintStopButton.addEventListener("click", stopVoiceprintRecording);
voiceprintUploadButton.addEventListener("click", () => voiceprintFileInput.click());
voiceprintFileInput.addEventListener("change", () => {
  handleVoiceprintFile(voiceprintFileInput.files ? voiceprintFileInput.files[0] : null);
  voiceprintFileInput.value = "";
});
if (voiceprintBackupButton) voiceprintBackupButton.addEventListener("click", exportVoiceprintLibrary);
if (voiceprintRestoreButton) voiceprintRestoreButton.addEventListener("click", () => voiceprintRestoreInput.click());
if (voiceprintRestoreInput) voiceprintRestoreInput.addEventListener("change", () => {
  importVoiceprintLibrary(voiceprintRestoreInput.files ? voiceprintRestoreInput.files[0] : null);
  voiceprintRestoreInput.value = "";
});
refreshVoiceprintRow();
function closePlusMenu() {
  plusMenu.hidden = true;
  plusButton.setAttribute("aria-expanded", "false");
}
plusButton.addEventListener("click", () => {
  const open = plusMenu.hidden;
  plusMenu.hidden = !open;
  plusButton.setAttribute("aria-expanded", String(open));
  if (open) plusImageButton.focus();
});
document.addEventListener("click", (event) => {
  if (!plusMenu.hidden && !event.target.closest("#plus-menu") && !event.target.closest("#plus-button")) closePlusMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePlusMenu();
});
if (songModeButton) songModeButton.addEventListener("click", () => {
  setSongMode(!songMode);
  setImageMode(false);
  closeSidebar();
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
    const voiceprint = requestSong ? await loadVoiceprint() : null;
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, ...(image ? { image } : {}), ...(requestImage ? { imageRequest: true } : {}), ...(requestSong ? { songRequest: true } : {}), ...(voiceprint ? { voiceReference: voiceprint } : {}), ...(savedKey ? { apiKey: savedKey } : {}), history: previousHistory }),
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
