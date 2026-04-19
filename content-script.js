function firstMeta(keys) {
  for (const key of keys) {
    const selectors = [
      `meta[name="${key}"]`,
      `meta[property="${key}"]`,
      `meta[itemprop="${key}"]`
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const value = (el?.getAttribute("content") || "").trim();
      if (value) return value;
    }
  }
  return "";
}

function firstText(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const value = (el?.textContent || "").trim();
    if (value) return value;
  }
  return "";
}

function allText(selectors) {
  const values = [];
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((el) => {
      const value = (el.textContent || "").trim();
      if (value) values.push(value);
    });
  }
  return [...new Set(values)];
}

function allMeta(keys) {
  const values = [];
  for (const key of keys) {
    const selectors = [
      `meta[name="${key}"]`,
      `meta[property="${key}"]`,
      `meta[itemprop="${key}"]`
    ];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((el) => {
        const value = (el.getAttribute("content") || "").trim();
        if (value) values.push(value);
      });
    }
  }
  return [...new Set(values)];
}

function collectJsonLd(node, out) {
  if (!node || typeof node !== "object") return;
  out.push(node);
  if (Array.isArray(node)) {
    node.forEach((item) => collectJsonLd(item, out));
    return;
  }
  Object.values(node).forEach((value) => {
    if (value && typeof value === "object") collectJsonLd(value, out);
  });
}

function extractJsonLd() {
  const result = { authors: [], title: "", language: "", publisher: "", datePublished: "", types: [] };
  const authors = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const decoded = JSON.parse(script.textContent || "null");
      const nodes = [];
      collectJsonLd(decoded, nodes);
      for (const node of nodes) {
        const nodeType = node["@type"];
        if (typeof nodeType === "string" && nodeType.trim()) result.types.push(nodeType.trim());
        if (Array.isArray(nodeType)) {
          nodeType.forEach((t) => {
            if (typeof t === "string" && t.trim()) result.types.push(t.trim());
          });
        }
        if (!result.title && typeof node.headline === "string") result.title = node.headline.trim();
        if (!result.title && typeof node.name === "string") result.title = node.name.trim();
        if (!result.language && typeof node.inLanguage === "string") result.language = node.inLanguage.trim();
        if (!result.publisher) {
          if (typeof node.publisher === "string") result.publisher = node.publisher.trim();
          else if (node.publisher && typeof node.publisher.name === "string") result.publisher = node.publisher.name.trim();
        }
        if (!result.datePublished && typeof node.datePublished === "string") {
          result.datePublished = node.datePublished.trim();
        }
        const rawAuthor = node.author;
        const items = Array.isArray(rawAuthor) ? rawAuthor : rawAuthor ? [rawAuthor] : [];
        for (const item of items) {
          if (typeof item === "string" && item.trim()) authors.push(item.trim());
          else if (item && typeof item.name === "string" && item.name.trim()) authors.push(item.name.trim());
        }
      }
    } catch (_) {
      // ignore malformed JSON-LD
    }
  }
  result.authors = [...new Set(authors)];
  result.types = [...new Set(result.types)];
  return result;
}

function normalizeWhitespace(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeForCompare(value) {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanTitleUsingSiteContext(title, siteName, authorName = "") {
  let value = (title || "").trim();
  if (!value) return "";
  const site = normalizeWhitespace(siteName);
  if (site) {
    const escaped = escapeRegExp(site);
    value = value.replace(new RegExp(`^${escaped}\\s*[-–—:|]\\s*`, "i"), "");
    value = value.replace(new RegExp(`\\s*[-–—:|]\\s*${escaped}$`, "i"), "");
  }
  value = value.replace(/^[A-Z][A-Za-z0-9.-]+\.[A-Za-z]{2,}\s*[-–—:|]\s*/u, "");
  const parts = value.split(/\s*[-–—|]\s*/).map((v) => v.trim()).filter(Boolean);
  if (parts.length >= 2 && site) {
    value = parts.filter((part) => part.toLowerCase() !== site.toLowerCase()).join(" - ");
  }
  value = value.replace(/\s*[-–—|,:]\s*(Livres?|Books?|Livre|Book)\s*$/iu, "");
  const author = normalizeWhitespace(authorName);
  if (author) {
    const variants = authorVariants(author);
    let changed = true;
    while (changed) {
      changed = false;
      const titleParts = value.split(/\s*[-–—|]\s*/).map((v) => normalizeWhitespace(v)).filter(Boolean);
      if (titleParts.length >= 2) {
        const lastPart = titleParts[titleParts.length - 1];
        if (variants.some((variant) => normalizeForCompare(lastPart) === normalizeForCompare(variant))) {
          titleParts.pop();
          value = titleParts.join(" - ");
          changed = true;
        }
      }
      for (const variant of variants) {
        const updated = value.replace(new RegExp(`\\s*[-–—|,:]\\s*${escapeRegExp(variant)}\\s*$`, "i"), "");
        if (updated !== value) {
          value = updated;
          changed = true;
          break;
        }
      }
    }
  }
  return normalizeWhitespace(value);
}

function cleanAuthorName(name) {
  return (name || "")
    .replace(/^\s*(de|par)\s+/i, "")
    .replace(/\s*\(.*?\)\s*$/u, "")
    .trim();
}

function authorVariants(authorName) {
  const cleaned = cleanAuthorName(authorName);
  if (!cleaned) return [];
  const variants = new Set([cleaned]);
  if (cleaned.includes(",")) {
    const parts = cleaned.split(",").map((v) => normalizeWhitespace(v)).filter(Boolean);
    if (parts.length >= 2) {
      variants.add(`${parts.slice(1).join(" ")} ${parts[0]}`.trim());
    }
  } else {
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      const family = tokens[tokens.length - 1];
      const given = tokens.slice(0, -1).join(" ");
      variants.add(`${family}, ${given}`.trim());
    }
  }
  return [...variants].map(normalizeWhitespace).filter(Boolean);
}

function inferAuthorTextGeneric(jsonLd) {
  const candidates = [
    ...jsonLd.authors,
    firstMeta(["author", "books:author", "book:author", "byline", "bylineInfo"]),
    ...allText([
      '[itemprop="author"]',
      '[itemprop="creator"]',
      ".author",
      ".byline",
      ".contributor",
      ".writer",
      ".bookAuthor"
    ])
  ];
  for (const raw of candidates) {
    const cleaned = cleanAuthorName(raw);
    if (cleaned && !/^visiter/i.test(cleaned) && cleaned.length < 120) {
      return cleaned;
    }
  }
  return "";
}

function bodyLines() {
  return (document.body?.innerText || "")
    .split(/\n+/)
    .map(normalizeWhitespace)
    .filter((line) => line && line.length <= 220);
}

function inferLabeledValue(labelPatterns, options = {}) {
  const lines = bodyLines();
  const sameLineRegex = new RegExp(`^(?:${labelPatterns.join("|")})\\s*[:\\-–—]?\\s*(.+)$`, "iu");
  const labelOnlyRegex = new RegExp(`^(?:${labelPatterns.join("|")})\\s*[:\\-–—]?\\s*$`, "iu");
  const accept = options.accept || ((value) => value.length > 0);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const sameLine = line.match(sameLineRegex);
    if (sameLine) {
      const candidate = normalizeWhitespace(sameLine[1] || "");
      if (accept(candidate)) return candidate;
    }
    if (labelOnlyRegex.test(line)) {
      const next = normalizeWhitespace(lines[i + 1] || "");
      if (accept(next)) return next;
    }
  }
  return "";
}

function inferPublisherGeneric(jsonLd) {
  const labeled = inferLabeledValue(
    [
      "éditeur",
      "editeur",
      "publisher",
      "imprint",
      "maison d'?édition",
      "maison d'?edition"
    ],
    {
      accept: (value) =>
        value.length > 1 &&
        value.length <= 80 &&
        !/\b(?:date de publication|publication|parution|published)\b/i.test(value) &&
        !/\b\d{4}\b/.test(value)
    }
  );
  return labeled || jsonLd.publisher || "";
}

function inferYearGeneric(jsonLd) {
  const bodyText = normalizeWhitespace(document.body?.innerText || "");
  const candidates = [
    jsonLd.datePublished || "",
    firstMeta(["books:release_date", "release_date", "publication_date", "date"]),
    ...allText([
      '[itemprop="datePublished"]',
      '[itemprop="dateCreated"]',
      ".publicationDate",
      ".pub-date",
      ".datePublished"
    ]),
    inferLabeledValue(
      [
        "date de publication",
        "publication",
        "parution",
        "published",
        "publication date",
        "release date"
      ],
      { accept: (value) => /\b(1[5-9]\d{2}|20\d{2})\b/.test(value) }
    ),
    bodyText.match(/\b(?:date de publication|publication|parution|published|publication date)\b[^0-9]{0,40}(1[5-9]\d{2}|20\d{2})/iu)?.[1] || "",
    bodyText.match(/\b(1[5-9]\d{2}|20\d{2})\b(?=[^.]{0,40}\b(?:date de publication|publication|parution|published|publication date)\b)/iu)?.[1] || ""
  ];
  for (const raw of candidates) {
    const match = String(raw).match(/\b(1[5-9]\d{2}|20\d{2})\b/);
    if (match) return match[1];
  }
  return "";
}

function inferDocumentAccessUrl(pageUrl, jsonLd) {
  const candidates = [
    firstMeta([
      "citation_pdf_url",
      "citation_fulltext_html_url",
      "citation_abstract_html_url",
      "eprints.document_url",
      "wkhealth_fulltext_url"
    ])
  ].filter(Boolean);
  for (const raw of candidates) {
    try {
      const url = new URL(raw, pageUrl);
      if (/^https?:$/i.test(url.protocol)) {
        return url.toString();
      }
    } catch (_) {
      // ignore invalid candidate
    }
  }
  return "";
}

function inferAuthorText() {
  const authors = allMeta([
    "citation_author",
    "citation_authors",
    "dc.creator",
    "dc.creator.author",
    "dc.creator.person",
    "author",
    "article:author",
    "parsely-author"
  ]);
  const jsonLd = extractJsonLd();
  for (const a of jsonLd.authors) authors.push(a);
  return [...new Set(authors.filter(Boolean))].join(" & ");
}

function extractPageMetadata() {
  const jsonLd = extractJsonLd();
  const siteName = firstMeta(["og:site_name", "application-name"]);
  const rawTitle = firstMeta(["citation_title", "dc.title", "og:title", "twitter:title", "parsely-title"]) || jsonLd.title || document.title || "";
  const author = inferAuthorText() || inferAuthorTextGeneric(jsonLd);
  const title = cleanTitleUsingSiteContext(rawTitle, siteName, author);
  const language = firstMeta(["dc.language", "citation_language", "og:locale", "article:locale"]) || jsonLd.language || document.documentElement.lang || "";
  const publisher = firstMeta(["citation_journal_title", "citation_conference_title", "citation_publisher", "dc.publisher", "og:site_name", "application-name"]) || inferPublisherGeneric(jsonLd) || "";
  const yearRaw = firstMeta(["citation_publication_date", "citation_date", "dc.date", "dc.date.issued", "article:published_time", "rft.date", "citation_online_date"]) || inferYearGeneric(jsonLd);
  const yearMatch = yearRaw.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  const doi = firstMeta(["citation_doi", "dc.identifier", "dc.identifier.doi", "prism.doi", "bepress_citation_doi", "doi"]);
  return {
    title: title.trim(),
    author: author.trim(),
    language: language.trim(),
    publisher: publisher.trim(),
    year: yearMatch ? yearMatch[1] : "",
    doi: doi.trim(),
    htmlLang: (document.documentElement.lang || "").trim(),
    urlField: inferDocumentAccessUrl(location.href, jsonLd)
  };
}

function extractImportablePageText() {
  const text = (document.body?.innerText || "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    text: text.slice(0, 180000),
    title: document.title || "",
    url: location.href
  };
}

function populateLlmImportPage(payload) {
  const urlInput = document.getElementById("llm_source_url");
  const textArea = document.getElementById("llm_source_text");
  const form = document.getElementById("llm-extract-form");
  if (!urlInput || !textArea || !form) {
    return { ok: false, reason: "IMPORT_FORM_NOT_FOUND" };
  }

  const hasSourceText = typeof payload?.sourceText === "string" && payload.sourceText.trim() !== "";

  if (!hasSourceText && typeof payload?.sourceUrl === "string") {
    urlInput.value = payload.sourceUrl;
    urlInput.dispatchEvent(new Event("input", { bubbles: true }));
    urlInput.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (hasSourceText) {
    urlInput.value = "";
    urlInput.dispatchEvent(new Event("input", { bubbles: true }));
    urlInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  if (hasSourceText) {
    textArea.value = payload.sourceText;
    textArea.dispatchEvent(new Event("input", { bubbles: true }));
    textArea.dispatchEvent(new Event("change", { bubbles: true }));
  }

  if (payload?.autoSubmit) {
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  }

  return { ok: true };
}


window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || event.data.type !== "llm_model_changed") {
    return;
  }
  browser.runtime.sendMessage({
    type: "saveExtensionLlmSelection",
    payload: {
      provider: event.data.provider || "",
      model: event.data.model_key || "",
      label: event.data.model_label || ""
    }
  }).catch(() => {});
});

browser.runtime.onMessage.addListener((message) => {
  if (!message || !message.type) return undefined;
  if (message.type === "extractPageMetadata") {
    return Promise.resolve(extractPageMetadata());
  }
  if (message.type === "extractPageImportText") {
    return Promise.resolve(extractImportablePageText());
  }
  if (message.type === "populateLlmImportPage") {
    return Promise.resolve(populateLlmImportPage(message.payload || {}));
  }
  return undefined;
});
