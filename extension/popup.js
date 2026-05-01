// Atlas IDE Chrome Extension — Popup Logic

const ATLAS_URL_KEY = "atlas-ide-url";
const CAPTURES_KEY = "atlas-captures";
const RECENTS_KEY = "atlas-recent-projects";

// Default — users can change in settings
const DEFAULT_URL = "https://id-preview--5360bfd7-938b-4e8a-856c-6688429afae3.lovable.app";

function getAtlasUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(ATLAS_URL_KEY, (result) => {
      resolve(result[ATLAS_URL_KEY] || DEFAULT_URL);
    });
  });
}

// Open Atlas IDE
document.getElementById("open-atlas").addEventListener("click", async () => {
  const url = await getAtlasUrl();
  chrome.tabs.create({ url });
  window.close();
});

// Capture page context
document.getElementById("capture-page").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const capture = {
    url: tab.url,
    title: tab.title,
    timestamp: Date.now(),
    favicon: tab.favIconUrl || null,
  };

  chrome.storage.local.get(CAPTURES_KEY, (result) => {
    const captures = result[CAPTURES_KEY] || [];
    captures.unshift(capture);
    // Keep last 20
    chrome.storage.local.set({ [CAPTURES_KEY]: captures.slice(0, 20) });
  });

  const status = document.getElementById("capture-status");
  status.classList.add("show");
  setTimeout(() => status.classList.remove("show"), 3000);
});

// New project — opens Atlas with intent
document.getElementById("new-project").addEventListener("click", async () => {
  const url = await getAtlasUrl();
  chrome.tabs.create({ url: url + "?intent=new-project" });
  window.close();
});

// Load recent projects from storage
chrome.storage.local.get(RECENTS_KEY, (result) => {
  const recents = result[RECENTS_KEY] || [];
  const container = document.getElementById("recents");

  if (recents.length === 0) {
    container.innerHTML = '<div style="font-size:10px;opacity:0.3;padding:8px 0;">No recent projects</div>';
    return;
  }

  recents.slice(0, 5).forEach((project) => {
    const el = document.createElement("div");
    el.className = "recent";
    el.innerHTML = `
      <span class="dot"></span>
      <span class="name">${project.name}</span>
      <span class="time">${timeAgo(project.lastOpened)}</span>
    `;
    el.addEventListener("click", async () => {
      const url = await getAtlasUrl();
      chrome.tabs.create({ url: url + "?project=" + project.id });
      window.close();
    });
    container.appendChild(el);
  });
});

// Settings link
document.getElementById("settings-link").addEventListener("click", (e) => {
  e.preventDefault();
  const url = prompt("Atlas IDE URL:", DEFAULT_URL);
  if (url) {
    chrome.storage.local.set({ [ATLAS_URL_KEY]: url });
  }
});

// Help link
document.getElementById("help-link").addEventListener("click", async (e) => {
  e.preventDefault();
  const url = await getAtlasUrl();
  chrome.tabs.create({ url: url + "?surface=help" });
  window.close();
});

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + "m";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h";
  return Math.floor(hrs / 24) + "d";
}
