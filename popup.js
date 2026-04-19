const extApi = typeof browser !== "undefined" ? browser : chrome;

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginInput = document.getElementById("login");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("login-button");
const importMainButton = document.getElementById("import-main-button");
const importAllButton = document.getElementById("import-all-button");
const importPageButton = document.getElementById("import-page-button");
const llmStatusEl = document.getElementById("llm-status");
const llmStatusButton = document.getElementById("llm-status-button");
const chooseLlmButton = document.getElementById("choose-llm-button");
const logoutButton = document.getElementById("logout-button");
const headerUserName = document.getElementById("header-user-name");
const statusEl = document.getElementById("status");

function setStatus(message, isError = false) {
  statusEl.textContent = message || "";
  statusEl.classList.toggle("hidden", !message);
  statusEl.style.color = isError ? "#b00020" : "#6d4c1b";
}

function toggleView(isLoggedIn) {
  loginView.classList.toggle("hidden", isLoggedIn);
  appView.classList.toggle("hidden", !isLoggedIn);
  logoutButton.classList.toggle("hidden", !isLoggedIn);
}

async function sendMessage(type, payload) {
  return extApi.runtime.sendMessage({ type, payload });
}

async function refreshState() {
  const state = await sendMessage("getState");
  loginInput.value = state.login || "";

  const isLoggedIn = Boolean(state.token);
  toggleView(isLoggedIn);
  if (isLoggedIn) {
    headerUserName.textContent = state.displayName || state.login || "utilisateur";
    try {
      const llmState = await sendMessage("getLlmState");
      if (llmState?.has_model) {
        llmStatusEl.textContent = `LLM : ${llmState.provider || ""}${llmState.provider ? " - " : ""}${llmState.label || llmState.model}`;
        llmStatusButton.classList.remove("hidden");
        chooseLlmButton.classList.add("hidden");
        importAllButton.disabled = false;
      } else {
        llmStatusEl.textContent = "";
        llmStatusButton.classList.add("hidden");
        chooseLlmButton.classList.remove("hidden");
        importAllButton.disabled = true;
      }
    } catch (error) {
      llmStatusEl.textContent = "";
      llmStatusButton.classList.add("hidden");
      chooseLlmButton.classList.remove("hidden");
      importAllButton.disabled = true;
    }
  } else {
    headerUserName.textContent = "Thamous";
    llmStatusEl.textContent = "";
    llmStatusButton.classList.add("hidden");
    chooseLlmButton.classList.add("hidden");
    importAllButton.disabled = false;
  }
  return state;
}

loginButton.addEventListener("click", async () => {
  setStatus("Connexion…");
  try {
    const state = await sendMessage("login", {
      login: loginInput.value.trim(),
      password: passwordInput.value
    });
    passwordInput.value = "";
    await refreshState();
    setStatus(`Connecté : ${state.displayName || state.login || "utilisateur"}`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
});

importMainButton.addEventListener("click", async () => {
  setStatus("Préparation de la référence…");
  try {
    const result = await sendMessage("importMainReference", {});
    setStatus(`Page de validation ouverte pour : ${result.activeTab?.title || result.page_url || "page active"}`);
    window.close();
  } catch (error) {
    if ((error.message || "").startsWith("UNAUTHORIZED:")) {
      await sendMessage("logout");
      await refreshState();
    }
    setStatus(error.message || String(error), true);
  }
});

importAllButton.addEventListener("click", async () => {
  setStatus("Ouverture de l’import bibliographique…");
  try {
    await sendMessage("importAllReferences", {});
    window.close();
  } catch (error) {
    if ((error.message || "").startsWith("UNAUTHORIZED:")) {
      await sendMessage("logout");
      await refreshState();
    }
    setStatus(error.message || String(error), true);
  }
});

chooseLlmButton.addEventListener("click", async () => {
  try {
    await sendMessage("openLlmManage", {});
    setStatus("Fenêtre de sélection du modèle LLM ouverte.");
    window.close();
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
});

llmStatusButton.addEventListener("click", async () => {
  try {
    await sendMessage("openLlmManage", {});
    setStatus("Fenêtre de sélection du modèle LLM ouverte.");
    window.close();
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
});

importPageButton.addEventListener("click", async () => {
  setStatus("Préparation de la page web…");
  try {
    const result = await sendMessage("importCurrentPage", {});
    setStatus(`Page de validation ouverte pour : ${result.activeTab?.title || result.page_url || "page active"}`);
    window.close();
  } catch (error) {
    if ((error.message || "").startsWith("UNAUTHORIZED:")) {
      await sendMessage("logout");
      await refreshState();
    }
    setStatus(error.message || String(error), true);
  }
});

logoutButton.addEventListener("click", async () => {
  await sendMessage("logout");
  await refreshState();
  setStatus("Session locale supprimée.");
});

refreshState().catch((error) => {
  setStatus(error.message || String(error), true);
});
