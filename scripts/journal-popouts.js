/**
 * Journal Popouts
 * A click on a content link that points to an *image* JournalEntryPage opens that image
 * in Foundry's ImagePopout (which has its own Show Players control) instead of navigating
 * the journal sheet away from the page you were on. Ctrl/Cmd-click keeps the old behaviour.
 *
 * Also: a GM-only "Close shared images" control (scene controls + hotkey) that closes image
 * pop-outs on every connected screen in one press.
 */
const MODULE = "journal-popouts";
const SOCKET = `module.${MODULE}`;

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
  game.settings.register(MODULE, "closeScope", {
    name: "Close shared images: which pop-outs",
    hint: "All image pop-outs on players' screens, or only the ones you sent with Show Players (leaves alone portraits a player opened themselves).",
    scope: "world",
    config: true,
    type: String,
    choices: { all: "All image pop-outs", shared: "Only images shared with Show Players" },
    default: "all"
  });
  game.settings.register(MODULE, "closeOwn", {
    name: "Close shared images: also close mine",
    hint: "Also close image pop-outs on the GM's own screen.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.keybindings.register(MODULE, "closeImages", {
    name: "Close shared images on all screens",
    hint: "GM only. Closes image pop-outs on every connected player's screen.",
    editable: [{ key: "Backquote", modifiers: ["Shift"] }],
    restricted: true,
    onDown: () => { closeEverywhere(); return true; }
  });
  // Capture phase: runs before Foundry's own content-link click handler.
  document.addEventListener("click", onClick, { capture: true });
  trackSharedImages();
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET, (data, senderId) => {
    if (data?.action !== "closeImages") return;
    // Only obey the GM. (senderId is the emitting user; older cores omit it, so fall back to the payload.)
    const sender = game.users.get(senderId ?? data.from);
    if (!sender?.isGM) return;
    closeLocal(data.scope);
  });
  game.modules.get(MODULE).api = { closeEverywhere, closeLocal };
});

Hooks.on("getSceneControlButtons", controls => {
  const tool = {
    name: "closeSharedImages",
    title: "Close shared images on all screens",
    icon: "fa-solid fa-images",
    button: true,
    visible: game.user.isGM,
    order: 99,
    onChange: () => closeEverywhere(),
    onClick: () => closeEverywhere() // v12 name for the same callback
  };
  if (Array.isArray(controls)) controls.find(c => c.name === "token")?.tools.push(tool);
  else if (controls.tokens?.tools) controls.tokens.tools[tool.name] = tool;
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

// ---------------------------------------------------------------------------
// Close shared images

/** ImagePopout class for this core (AppV2 on v13+, legacy global on older cores). */
function popoutClass() {
  return foundry.applications?.apps?.ImagePopout ?? globalThis.ImagePopout;
}

function openPopouts() {
  const cls = popoutClass();
  if (!cls) return [];
  const v2 = foundry.applications?.instances ? [...foundry.applications.instances.values()] : [];
  const v1 = Object.values(ui.windows ?? {});
  return [...new Set([...v2, ...v1])].filter(app => app instanceof cls);
}

/**
 * Mark pop-outs that arrived via Show Players, so "only shared" can leave a player's own
 * windows alone. Wraps the core share handler to remember the shared image path, then tags
 * the next pop-out that renders that image.
 */
const pendingShared = new Set();
let canTrackShared = false;

function trackSharedImages() {
  const cls = popoutClass();
  const original = cls?._handleShareImage;
  if (typeof original !== "function") return;
  cls._handleShareImage = function (data, ...rest) {
    const src = data?.image ?? data?.src;
    if (src) pendingShared.add(src);
    return original.call(this, data, ...rest);
  };
  canTrackShared = true;
  Hooks.on("renderImagePopout", app => {
    const src = app.options?.src ?? app.object;
    if (src && pendingShared.delete(src)) app._journalPopoutsShared = true;
  });
}

function closeLocal(scope = "all") {
  const onlyShared = scope === "shared" && canTrackShared;
  let n = 0;
  for (const app of openPopouts()) {
    if (onlyShared && !app._journalPopoutsShared) continue;
    app.close();
    n++;
  }
  return n;
}

function closeEverywhere() {
  if (!game.user.isGM) return;
  const scope = game.settings.get(MODULE, "closeScope");
  if (scope === "shared" && !canTrackShared) {
    ui.notifications.warn("Journal Popouts: can't tell shared images apart on this Foundry version, so closing all image pop-outs.");
  }
  game.socket.emit(SOCKET, { action: "closeImages", scope, from: game.user.id });
  const mine = game.settings.get(MODULE, "closeOwn") ? closeLocal(scope) : 0;
  ui.notifications.info(`Closed shared images on all player screens${mine ? ` and ${mine} on yours` : ""}.`);
}
