const STORAGE_KEY = "vp-markdown-live-document";

const SAMPLE_MARKDOWN = `# Bienvenido a Markdown Live Editor

Este es tu espacio para **escribir**, _organizar_ y dar forma a tus ideas sin distracciones.

## Todo sucede al instante

La vista previa se actualiza mientras escribes. Cuando termines, podrás exportar tu documento como **Markdown** o como una página **HTML** completa.

> Las buenas ideas empiezan con una línea en blanco y un poco de curiosidad.

### Lo que puedes hacer

- Escribir con sintaxis Markdown
- Añadir [enlaces](https://www.markdownguide.org/)
- Crear listas, citas y tablas
- Incluir \`código en línea\`
- [x] Guardar automáticamente en este navegador
- [ ] Exportar tu próxima gran idea

| Formato | Resultado |
| :-- | :-- |
| **Negrita** | Destaca una idea |
| _Cursiva_ | Añade intención |

\`\`\`js
const idea = "Escribe algo extraordinario";
console.log(idea);
\`\`\`

---

Empieza a editar este texto y hazlo tuyo. ✦`;

const elements = {
  input: document.querySelector("#markdownInput"),
  preview: document.querySelector("#preview"),
  wordCount: document.querySelector("#wordCount"),
  charCount: document.querySelector("#charCount"),
  saveStatus: document.querySelector("#saveStatus"),
  exportMarkdown: document.querySelector("#exportMarkdown"),
  exportHtml: document.querySelector("#exportHtml"),
  copyHtml: document.querySelector("#copyHtml"),
  newDocument: document.querySelector("#newDocument"),
  toast: document.querySelector("#toast"),
  editorTab: document.querySelector("#editorTab"),
  previewTab: document.querySelector("#previewTab"),
  editorPanel: document.querySelector("#editorPanel"),
  previewPanel: document.querySelector("#previewPanel"),
};

let saveTimer;
let toastTimer;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInline(source) {
  const codeTokens = [];
  let text = source.replace(/`([^`]+)`/g, (_, code) => {
    const token = `\u0000CODE${codeTokens.length}\u0000`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  text = escapeHtml(text);
  text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  text = text.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  text = text.replace(/  $/g, "<br>");

  codeTokens.forEach((token, index) => {
    text = text.replace(`\u0000CODE${index}\u0000`, token);
  });

  return text;
}

function splitTableRow(line) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function isTableDivider(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderMarkdown(source) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      html.push(`<pre><code${language ? ` data-language="${escapeHtml(language)}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`);
      index += 1;
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
      html.push("<hr>");
      index += 1;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = splitTableRow(line);
      const alignmentCells = splitTableRow(lines[index + 1]);
      const alignments = alignmentCells.map((cell) => {
        if (cell.startsWith(":") && cell.endsWith(":")) return "center";
        if (cell.endsWith(":")) return "right";
        return "left";
      });
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      const head = headers.map((cell, i) => `<th style="text-align:${alignments[i] || "left"}">${renderInline(cell)}</th>`).join("");
      const body = rows.map((row) => `<tr>${row.map((cell, i) => `<td style="text-align:${alignments[i] || "left"}">${renderInline(cell)}</td>`).join("")}</tr>`).join("");
      html.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote><p>${quote.map(renderInline).join("<br>")}</p></blockquote>`);
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-+*]\s+(.+)$/);
    const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const listTag = ordered ? "ol" : "ul";
      const pattern = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/;
      const items = [];
      while (index < lines.length) {
        const match = lines[index].match(pattern);
        if (!match) break;
        let content = match[1];
        const task = content.match(/^\[([ xX])\]\s+(.+)$/);
        if (task) {
          const checked = task[1].toLowerCase() === "x" ? " checked" : "";
          content = `<input type="checkbox" disabled${checked}> ${renderInline(task[2])}`;
        } else {
          content = renderInline(content);
        }
        items.push(`<li>${content}</li>`);
        index += 1;
      }
      html.push(`<${listTag}>${items.join("")}</${listTag}>`);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^```/.test(lines[index]) &&
      !/^>\s?/.test(lines[index]) &&
      !/^\s*([-+*]\s+|\d+[.)]\s+)/.test(lines[index]) &&
      !/^\s*(---+|___+|\*\*\*+)\s*$/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    html.push(`<p>${paragraph.map(renderInline).join("\n")}</p>`);
  }

  return html.join("\n");
}

function updateEditor({ persist = true } = {}) {
  const value = elements.input.value;
  elements.preview.innerHTML = renderMarkdown(value);
  elements.wordCount.textContent = value.trim() ? value.trim().split(/\s+/).length : 0;
  elements.charCount.textContent = value.length;

  if (persist) {
    elements.saveStatus.textContent = "Guardando…";
    elements.saveStatus.classList.add("is-saving");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, value);
      elements.saveStatus.textContent = "Guardado localmente";
      elements.saveStatus.classList.remove("is-saving");
    }, 350);
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

function getDocumentTitle() {
  const heading = elements.input.value.match(/^#\s+(.+)$/m)?.[1] || "documento-markdown";
  return heading
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "documento-markdown";
}

function downloadFile(contents, filename, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getExportHtml() {
  const title = elements.input.value.match(/^#\s+(.+)$/m)?.[1] || "Documento Markdown";
  const content = renderMarkdown(elements.input.value);
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { max-width: 760px; margin: 0 auto; padding: 48px 24px; color: #25332c; background: #fffefa; font: 16px/1.7 system-ui, sans-serif; }
    h1, h2, h3, h4 { color: #17261f; line-height: 1.2; }
    h1 { padding-bottom: .4em; border-bottom: 1px solid #dddcd5; }
    a { color: #c65332; } blockquote { margin-left: 0; padding: .2em 1em; border-left: 3px solid #e96f48; color: #5f6b64; }
    code { padding: .15em .35em; border-radius: 4px; color: #a8452a; background: #f3ece5; font-family: ui-monospace, monospace; }
    pre { padding: 18px; overflow: auto; border-radius: 8px; color: #e7efe9; background: #17261f; } pre code { padding: 0; color: inherit; background: none; }
    img { max-width: 100%; } table { width: 100%; border-collapse: collapse; } th, td { padding: 8px 11px; border: 1px solid #dddcd5; } th { background: #f3f2ed; }
  </style>
</head>
<body>
${content}
</body>
</html>`;
}

function wrapSelection(before, after = before, placeholder = "texto") {
  const input = elements.input;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const selection = input.value.slice(start, end) || placeholder;
  input.setRangeText(`${before}${selection}${after}`, start, end, "end");
  input.focus();
  updateEditor();
}

function prefixLines(prefix) {
  const input = elements.input;
  const value = input.value;
  const start = value.lastIndexOf("\n", input.selectionStart - 1) + 1;
  const nextBreak = value.indexOf("\n", input.selectionEnd);
  const end = nextBreak === -1 ? value.length : nextBreak;
  const selection = value.slice(start, end);
  const replacement = selection.split("\n").map((line) => `${prefix}${line}`).join("\n");
  input.setRangeText(replacement, start, end, "select");
  input.focus();
  updateEditor();
}

function applyFormat(format) {
  const actions = {
    heading: () => prefixLines("# "),
    bold: () => wrapSelection("**", "**", "texto en negrita"),
    italic: () => wrapSelection("_", "_", "texto en cursiva"),
    link: () => wrapSelection("[", "](https://)", "texto del enlace"),
    quote: () => prefixLines("> "),
    code: () => wrapSelection("`", "`", "código"),
    list: () => prefixLines("- "),
  };
  actions[format]?.();
}

function switchMobilePanel(panel) {
  const showEditor = panel === "editor";
  elements.editorPanel.hidden = !showEditor;
  elements.previewPanel.hidden = showEditor;
  elements.editorTab.classList.toggle("is-active", showEditor);
  elements.previewTab.classList.toggle("is-active", !showEditor);
  elements.editorTab.setAttribute("aria-selected", String(showEditor));
  elements.previewTab.setAttribute("aria-selected", String(!showEditor));
}

function restoreDesktopPanels() {
  if (window.matchMedia("(min-width: 901px)").matches) {
    elements.editorPanel.hidden = false;
    elements.previewPanel.hidden = false;
  } else {
    switchMobilePanel(elements.previewTab.classList.contains("is-active") ? "preview" : "editor");
  }
}

elements.input.value = localStorage.getItem(STORAGE_KEY) ?? SAMPLE_MARKDOWN;
updateEditor({ persist: false });

elements.input.addEventListener("input", () => updateEditor());
elements.input.addEventListener("keydown", (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (event.key === "Tab") {
    event.preventDefault();
    elements.input.setRangeText("  ", elements.input.selectionStart, elements.input.selectionEnd, "end");
    updateEditor();
  }
  if (modifier && event.key.toLowerCase() === "b") {
    event.preventDefault();
    applyFormat("bold");
  }
  if (modifier && event.key.toLowerCase() === "i") {
    event.preventDefault();
    applyFormat("italic");
  }
  if (modifier && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (event.shiftKey) elements.exportHtml.click();
    else elements.exportMarkdown.click();
  }
});

document.querySelectorAll("[data-format]").forEach((button) => {
  button.addEventListener("click", () => applyFormat(button.dataset.format));
});

elements.exportMarkdown.addEventListener("click", () => {
  downloadFile(elements.input.value, `${getDocumentTitle()}.md`, "text/markdown;charset=utf-8");
  showToast("Markdown exportado");
});

elements.exportHtml.addEventListener("click", () => {
  downloadFile(getExportHtml(), `${getDocumentTitle()}.html`, "text/html;charset=utf-8");
  showToast("HTML exportado");
});

elements.copyHtml.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(renderMarkdown(elements.input.value));
    showToast("HTML copiado al portapapeles");
  } catch {
    showToast("No se pudo copiar automáticamente");
  }
});

elements.newDocument.addEventListener("click", () => {
  const hasCustomContent = elements.input.value.trim() && elements.input.value !== SAMPLE_MARKDOWN;
  if (hasCustomContent && !window.confirm("¿Crear un documento nuevo? El contenido actual se borrará del editor.")) return;
  elements.input.value = "# Documento sin título\n\nEmpieza a escribir aquí…";
  updateEditor();
  elements.input.focus();
  showToast("Documento nuevo creado");
});

elements.editorTab.addEventListener("click", () => switchMobilePanel("editor"));
elements.previewTab.addEventListener("click", () => switchMobilePanel("preview"));
window.addEventListener("resize", restoreDesktopPanels);
restoreDesktopPanels();
