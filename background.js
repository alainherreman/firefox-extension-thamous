const DEFAULT_API_BASE_URL = "https://thamous.ouvaton.org/thamous/php/api/v2/index.php";
const LOGIN_APP_NAME = "firefox-extension";
const storage = (typeof browser !== "undefined" ? browser : chrome).storage.local;
const tabsApi = (typeof browser !== "undefined" ? browser : chrome).tabs;
const windowsApi = (typeof browser !== "undefined" ? browser : chrome).windows;
const runtimeApi = (typeof browser !== "undefined" ? browser : chrome).runtime;

async function getSettings() {
  const data = await storage.get({
    apiBaseUrl: DEFAULT_API_BASE_URL,
    token: "",
    tokenType: "",
    tokenExpiresAt: "",
    login: "",
    displayName: "",
    signature: ""
  });

  return {
    ...data,
    apiBaseUrl: data.apiBaseUrl || DEFAULT_API_BASE_URL
  };
}

async function setSettings(patch) {
  await storage.set(patch);
  return getSettings();
}

async function clearSession() {
  await storage.remove(["token", "tokenType", "tokenExpiresAt", "login", "displayName", "signature"]);
  return getSettings();
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { raw: await response.text() };

  if (!response.ok) {
    const error = payload?.error || {};
    const message = error.message || payload.raw || `HTTP ${response.status}`;
    const code = error.code || "HTTP_ERROR";
    throw new Error(`${code}: ${message}`);
  }

  return payload;
}

async function login({ apiBaseUrl, login, password }) {
  const normalizedApiBaseUrl = (apiBaseUrl || DEFAULT_API_BASE_URL).trim();
  if (!normalizedApiBaseUrl) {
    throw new Error("BAD_CONFIG: URL API manquante");
  }
  if (!login || !password) {
    throw new Error("BAD_CREDENTIALS: Login ou mot de passe manquant");
  }

  const payload = await apiFetch(`${normalizedApiBaseUrl}?path=login_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      login,
      password,
      app: LOGIN_APP_NAME,
      ttl: 86400
    })
  });

  return setSettings({
    apiBaseUrl: normalizedApiBaseUrl,
    token: payload.token || "",
    tokenType: payload.token_type || "",
    tokenExpiresAt: payload.expires_at || "",
    login: payload.login || login,
    displayName: payload.nom || login,
    signature: payload.signature || ""
  });
}

function normalizeApiError(error) {
  const message = String(error?.message || error || "");
  if (message.startsWith("UNAUTHORIZED: Invalid token") || message.startsWith("UNAUTHORIZED: Missing token")) {
    return new Error("UNAUTHORIZED: Votre session API a expiré. Reconnectez-vous.");
  }
  return error instanceof Error ? error : new Error(message || "Erreur inconnue");
}

async function extractActiveTabAndMeta() {
  const settings = await getSettings();
  if (!settings.token) {
    throw new Error("UNAUTHORIZED: Aucun token enregistré");
  }

  const [tab] = await tabsApi.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    throw new Error("BAD_TAB: Aucun onglet actif exploitable");
  }
  if (!/^https?:/i.test(tab.url)) {
    throw new Error("BAD_TAB: L’onglet actif n’utilise pas HTTP(S)");
  }

  let pageMeta = {};
  try {
    pageMeta = await (typeof browser !== "undefined"
      ? browser.tabs.sendMessage(tab.id, { type: "extractPageMetadata" })
      : chrome.tabs.sendMessage(tab.id, { type: "extractPageMetadata" }));
  } catch (error) {
    pageMeta = {};
  }

  return { settings, tab, pageMeta };
}

async function openWindow(url, width = 900, height = 700) {
  return windowsApi.create({
    url,
    type: "normal",
    focused: true,
    width,
    height
  });
}

function getThamousAppBaseFromApi(apiBaseUrl) {
  try {
    const url = new URL(apiBaseUrl || DEFAULT_API_BASE_URL);
    const match = url.pathname.match(/^\/([^/]+)\/php\/api\/v\d+\/index\.php$/);
    if (match && match[1]) {
      return `${url.origin}/${match[1]}/`;
    }
    const genericMatch = url.pathname.match(/^\/([^/]+)\//);
    const appRoot = genericMatch ? genericMatch[1] : "thamous";
    return `${url.origin}/${appRoot}/`;
  } catch (_) {
    return "https://thamous.ouvaton.org/thamous/";
  }
}

async function resolvePreferredThamousAppBase(apiBaseUrl) {
  const fallback = getThamousAppBaseFromApi(apiBaseUrl);
  try {
    const thamousTabs = await tabsApi.query({ url: ["https://thamous.ouvaton.org/thamous/*", "https://thamous.ouvaton.org/mythamous/*"] });
    if (Array.isArray(thamousTabs) && thamousTabs.length > 0) {
      const sorted = [...thamousTabs].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      const chosen = sorted[0];
      const url = new URL(chosen.url);
      const match = url.pathname.match(/^\/(thamous|mythamous)\//);
      if (match && match[1]) {
        return `${url.origin}/${match[1]}/`;
      }
    }
  } catch (_) {
    // fallback below
  }
  return fallback;
}

async function getLlmState() {
  const settings = await getSettings();
  if (!settings.token) {
    return { has_model: false, provider: "", model: "", label: "" };
  }
  const appBase = await resolvePreferredThamousAppBase(settings.apiBaseUrl);
  const response = await fetch(`${appBase}llm/llm_current.php`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Accept": "application/json"
    }
  });
  const payload = await response.json();
  return {
    has_model: Boolean(payload?.has_model),
    provider: payload?.provider || "",
    model: payload?.model || "",
    label: payload?.label || ""
  };
}

async function openLlmManage() {
  const settings = await getSettings();
  const appBase = await resolvePreferredThamousAppBase(settings.apiBaseUrl);
  const url = `${appBase}llm/llm_manage.php`;
  await openWindow(url, 1100, 820);
  return { ok: true, url };
}

async function extractActiveTabImportText(tabId) {
  try {
    const payload = await (typeof browser !== "undefined"
      ? browser.tabs.sendMessage(tabId, { type: "extractPageImportText" })
      : chrome.tabs.sendMessage(tabId, { type: "extractPageImportText" }));
    return payload || {};
  } catch (_) {
    return {};
  }
}

async function waitForTabComplete(tabId, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await tabsApi.get(tabId);
    if (tab && tab.status === "complete") {
      return tab;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("TIMEOUT: chargement de la fenêtre d’import trop long");
}

async function importMainReference() {
  try {
    const { settings, tab, pageMeta } = await extractActiveTabAndMeta();
    const fields = Object.fromEntries(
      Object.entries({
        nom: pageMeta?.author || "",
        titre: pageMeta?.title || "",
        langue: pageMeta?.language || pageMeta?.htmlLang || "",
        editeur: pageMeta?.publisher || "",
        annee: pageMeta?.year || "",
        doi: pageMeta?.doi || "",
        url: pageMeta?.urlField || ""
      }).filter(([, value]) => String(value || "").trim() !== "")
    );

    const payload = await apiFetch(`${settings.apiBaseUrl}?path=prepare_ref`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.token}`
      },
      body: JSON.stringify({
        mode: "from_url",
        projet: "perso",
        page_url: tab.url,
        page_title: pageMeta?.title || "",
        fields
      })
    });

    if (!payload.form_url) {
      throw new Error("BAD_RESPONSE: form_url manquant dans la réponse API");
    }

    await openWindow(payload.form_url, 980, 760);
    return {
      ...payload,
      activeTab: {
        id: tab.id,
        title: tab.title || "",
        url: tab.url
      }
    };
  } catch (error) {
    throw normalizeApiError(error);
  }
}

async function importCurrentPage() {
  try {
    const { settings, tab, pageMeta } = await extractActiveTabAndMeta();
    const host = (() => {
      try {
        return new URL(tab.url).hostname.replace(/^www\./i, "");
      } catch (_) {
        return "";
      }
    })();

    const payload = await apiFetch(`${settings.apiBaseUrl}?path=prepare_ref`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.token}`
      },
      body: JSON.stringify({
        mode: "direct",
        projet: "perso",
        table: "tbiblio",
        type: "Site",
        fields: {
          nom: pageMeta?.publisher || host,
          titre: pageMeta?.title || tab.title || host,
          langue: pageMeta?.language || pageMeta?.htmlLang || "",
          editeur: pageMeta?.publisher || host,
          annee: pageMeta?.year || "",
          url: tab.url,
          doi: ""
        }
      })
    });

    if (!payload.form_url) {
      throw new Error("BAD_RESPONSE: form_url manquant dans la réponse API");
    }

    await openWindow(payload.form_url, 980, 760);
    return {
      ...payload,
      activeTab: {
        id: tab.id,
        title: tab.title || "",
        url: tab.url
      }
    };
  } catch (error) {
    throw normalizeApiError(error);
  }
}

async function importAllReferences() {
  try {
    const { settings, tab } = await extractActiveTabAndMeta();
    const importTextPayload = await extractActiveTabImportText(tab.id);
    const sourceText = (importTextPayload?.text || "").trim();
    const appBase = await resolvePreferredThamousAppBase(settings.apiBaseUrl);
    const importUrl =
      `${appBase}llm/import_biblio_llm.php?source_url=` +
      encodeURIComponent(tab.url) +
      (sourceText ? "" : "&auto_extract=1");
    const createdWindow = await openWindow(importUrl, 1100, 820);
    const createdTabs = createdWindow?.tabs || await tabsApi.query({ windowId: createdWindow.id });
    const targetTab = createdTabs && createdTabs[0];
    if (sourceText && targetTab?.id) {
      await waitForTabComplete(targetTab.id);
      await (typeof browser !== "undefined"
        ? browser.tabs.sendMessage(targetTab.id, {
            type: "populateLlmImportPage",
            payload: {
              sourceUrl: tab.url,
              sourceText,
              autoSubmit: true
            }
          })
        : chrome.tabs.sendMessage(targetTab.id, {
            type: "populateLlmImportPage",
            payload: {
              sourceUrl: tab.url,
              sourceText,
              autoSubmit: true
            }
          }));
    }
    return { ok: true, url: importUrl };
  } catch (error) {
    throw normalizeApiError(error);
  }
}

runtimeApi.onMessage.addListener((message) => {
  if (!message || !message.type) {
    return Promise.resolve({ ok: false, error: "Message invalide" });
  }

  if (message.type === "getState") {
    return getSettings();
  }
  if (message.type === "login") {
    return login(message.payload);
  }
  if (message.type === "logout") {
    return clearSession();
  }
  if (message.type === "getLlmState") {
    return getLlmState();
  }
  if (message.type === "openLlmManage") {
    return openLlmManage();
  }
  if (message.type === "saveSettings") {
    return setSettings(message.payload || {});
  }
  if (message.type === "importMainReference") {
    return importMainReference(message.payload || {});
  }
  if (message.type === "importAllReferences") {
    return importAllReferences(message.payload || {});
  }
  if (message.type === "importCurrentPage") {
    return importCurrentPage(message.payload || {});
  }

  return Promise.resolve({ ok: false, error: "Type de message inconnu" });
});
