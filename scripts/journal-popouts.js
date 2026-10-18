/**
 * Journal Popouts
 * A click on a content link that points to an *image* JournalEntryPage opens that image
 * in Foundry's ImagePopout (which has its own Show Players control) instead of navigating
 * the journal sheet away from the page you were on. Ctrl/Cmd-click keeps the old behaviour.
 */
const MODULE = "journal-popouts";

Hooks.once("init", () => {
  game.settings.register(MODULE, "who", {
    name: "Pop out image links for",
    hint: "Who gets pop-outs when clicking a link to an image page. Everyone else navigates normally.",
    scope: "world",
    config: true,
    type: String,
    choices: { gm: "GM only", all: "Everyone" },
    default: "gm"
  });
  game.settings.register(MODULE, "showTitle", {
    name: "Show title when shared",
    hint: "When you press Show Players, also show the image's title to players.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  // Capture phase: runs before Foundry's own content-link click handler.
  document.addEventListener("click", onClick, { capture: true });
});

function enabledForUser() {
  return game.settings.get(MODULE, "who") === "all" || game.user.isGM;
}

/** "N05 – The Scholar" -> "The Scholar" (drops the journal's index prefix). */
function cleanTitle(name) {
  return (name ?? "").replace(/^[A-Z]{1,2}\d{1,3}\s*[–—-]\s*/, "").trim();
}

function onClick(event) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest?.("a.content-link[data-uuid]");
  if (!link || !enabledForUser()) return;

  let page;
  try { page = fromUuidSync(link.dataset.uuid); } catch { return; }
  if (page?.documentName !== "JournalEntryPage" || page.type !== "image" || !page.src) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  openPopout(page);
}

function openPopout(page) {
  const title = cleanTitle(page.name) || page.name;
  const caption = page.image?.caption || "";
  const showTitle = game.settings.get(MODULE, "showTitle");
  const AppV2 = foundry.applications?.apps?.ImagePopout;
  try {
    if (AppV2) {
      new AppV2({ src: page.src, caption, showTitle, window: { title } }).render({ force: true });
    } else {
      new ImagePopout(page.src, { title, caption, shareable: true }).render(true);
    }
  } catch (err) {
    console.error(`${MODULE} | could not open pop-out, falling back to the page`, err);
    page.parent?.sheet?.render(true, { pageId: page.id });
  }
}
