const DEFAULT_API_BASE_URL = "https://thamous.ouvaton.org/thamous/php/api/v2/index.php";
const LOGIN_APP_NAME = "firefox-extension";
const storage = (typeof browser !== "undefined" ? browser : chrome).storage.local;
const tabsApi = (typeof browser !== "undefined" ? browser : chrome).tabs;
const windowsApi = (typeof browser !== "undefined" ? browser : chrome).windows;
const runtimeApi = (typeof browser !== "undefined" ? browser : chrome).runtime;

const permissionsApi = (typeof browser !== "undefined" ? browser : chrome).permissions;

async function hasApiHostPermission(apiBaseUrl) {
  try {
    if (!permissionsApi?.contains) return null;
    const url = new URL(apiBaseUrl || DEFAULT_API_BASE_URL);
    return await permissionsApi.contains({ origins: [`${url.protocol}//${url.host}/*`] });
  } catch (_) {
    return null;
  }
}

async function getSettings() {
  const data = await storage.get({
    apiBaseUrl: DEFAULT_API_BASE_URL,
    token: "",
    tokenType: "",
    tokenExpiresAt: "",
    login: "",
    displayName: "",
    signature: "",
    extensionLlmProvider: "",
    extensionLlmModel: "",
    extensionLlmLabel: ""
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
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const hostPermission = await hasApiHostPermission(url);
    const hint = hostPermission === false ? " Accès hôte Firefox manquant pour thamous.ouvaton.org." : "";
    throw new Error(`Impossible de joindre Thamous depuis l’extension.${hint} Détail technique: ${error?.name || 'Error'}${error?.message ? `: ${error.message}` : ''}`);
  }
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
    return new Error("Votre session API a expiré. Reconnectez-vous.");
  }
  return error instanceof Error ? error : new Error(message || "Erreur inconnue");
}

function getBrowserLanguageFallback() {
  return String(
    (typeof navigator !== "undefined" && (navigator.language || (navigator.languages || [])[0])) ||
    ""
  ).trim();
}

function getEffectivePageLanguage(pageMeta = {}) {
  return String(pageMeta?.language || pageMeta?.htmlLang || getBrowserLanguageFallback() || "").trim();
}

function getEffectivePageUrl(tab, pageMeta = {}) {
  return String(pageMeta?.urlField || tab?.url || "").trim();
}

async function extractActiveTabAndMeta() {
  const settings = await getSettings();
  if (!settings.token) {
    throw new Error("Aucune session API enregistrée. Reconnectez-vous.");
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

function isYouTubeUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "youtu.be" || host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com");
  } catch (_) {
    return false;
  }
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

function getCanonicalThamousBase(apiBaseUrl) {
  try {
    const url = new URL(apiBaseUrl || DEFAULT_API_BASE_URL);
    return `${url.origin}/thamous/`;
  } catch (_) {
    return "https://thamous.ouvaton.org/thamous/";
  }
}

async function getLlmState() {
  const settings = await getSettings();
  return {
    has_model: Boolean(settings.extensionLlmProvider && settings.extensionLlmModel),
    provider: settings.extensionLlmProvider || "",
    model: settings.extensionLlmModel || "",
    label: settings.extensionLlmLabel || settings.extensionLlmModel || "",
    appBase: getCanonicalThamousBase(settings.apiBaseUrl)
  };
}

async function saveExtensionLlmSelection(payload = {}) {
  const provider = String(payload.provider || "").trim();
  const model = String(payload.model || payload.model_key || "").trim();
  const label = String(payload.label || payload.model_label || model).trim();
  await storage.set({
    extensionLlmProvider: provider,
    extensionLlmModel: model,
    extensionLlmLabel: provider && model ? label : ""
  });
  return getLlmState();
}

async function openLlmManage() {
  const settings = await getSettings();
  const appBase = getCanonicalThamousBase(settings.apiBaseUrl);
  const params = new URLSearchParams();
  if (settings.extensionLlmProvider) {
    params.set("provider", settings.extensionLlmProvider);
  }
  if (settings.extensionLlmModel) {
    params.set("model", settings.extensionLlmModel);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const url = `${appBase}llm/llm_manage_extension.php${suffix}`;
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
        langue: getEffectivePageLanguage(pageMeta),
        editeur: pageMeta?.publisher || "",
        annee: pageMeta?.year || "",
        doi: pageMeta?.doi || "",
        url: getEffectivePageUrl(tab, pageMeta),
        duree: pageMeta?.duree || ""
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
    const isYoutube = isYouTubeUrl(tab.url);
    const effectiveType = pageMeta?.refType || (isYoutube ? "Vidéo" : "Site");
    const effectivePublisher = pageMeta?.publisher || (isYoutube ? "YouTube" : host);
    const effectiveAuthor = pageMeta?.author || "";

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
        type: effectiveType,
        fields: {
          nom: effectiveType === "Vidéo" ? effectiveAuthor : effectivePublisher,
          titre: pageMeta?.title || tab.title || host,
          langue: getEffectivePageLanguage(pageMeta),
          editeur: effectivePublisher,
          annee: pageMeta?.year || "",
          duree: pageMeta?.duree || "",
          url: getEffectivePageUrl(tab, pageMeta),
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
    if (!settings.extensionLlmProvider || !settings.extensionLlmModel) {
      throw new Error("BAD_LLM: Choisissez d’abord un modèle LLM pour l’extension.");
    }
    const importTextPayload = await extractActiveTabImportText(tab.id);
    const sourceText = (importTextPayload?.text || "").trim();
    const appBase = getCanonicalThamousBase(settings.apiBaseUrl);
    const importUrl =
      `${appBase}llm/import_biblio_llm.php?source_url=` +
      encodeURIComponent(tab.url) +
      `&provider=${encodeURIComponent(settings.extensionLlmProvider)}` +
      `&model=${encodeURIComponent(settings.extensionLlmModel)}` +
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
  if (message.type === "saveExtensionLlmSelection") {
    return saveExtensionLlmSelection(message.payload || {});
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
