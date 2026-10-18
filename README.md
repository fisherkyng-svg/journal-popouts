# Journal Popouts

A small Foundry VTT (v13–v14) module. When you click a link to an **image journal page**
(a portrait or a piece of scene art), the image opens in a pop-out window instead of moving
the journal away from the page you were reading. The pop-out has Foundry's own **Show Players**
button, and closing it leaves the journal exactly where it was.

- Only links to **image** pages pop out. Text pages, scenes, actors and macros work as before.
- **Ctrl/Cmd-click** a link to open the page the old way.
- Settings: pop-outs for the GM only (default) or everyone; show the title to players when shared.

## Install

Manifest URL:

```
https://github.com/fisherkyng-svg/journal-popouts/releases/latest/download/module.json
```

## Releasing

Bump `version` in `module.json` and `download` to match, then push to `main`.
The Release workflow tags `v<version>` and publishes `module.json` and `module.zip`.

MIT License.
