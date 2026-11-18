# Claude UI

Een desktop-app met een grafische interface voor [Claude Code](https://claude.com/claude-code): tabbladen met chats per repo, tool-calls en subagents volgen, model en effort kiezen, usage-overzicht, een ingebouwde terminal en meer. Het draait op de officiële Claude Agent SDK en gebruikt je **eigen Claude-abonnement** (geen API-key). Alles loopt lokaal via jouw Claude Code; er gaat niets via mijn kant.

> Dit is een onofficieel hobbyproject en geen product van Anthropic.

## Downloaden

Download de nieuwste versie onder [**Releases**](https://github.com/tommiekleijer/claude-ui/releases/latest). Je hoeft niets anders te installeren (geen Node, geen Git, geen Claude Code-CLI): alles zit in de app.

| Systeem | Bestand | Starten |
|---|---|---|
| **Windows 10/11** | `claude-ui-…-windows-setup.exe` | Dubbelklik. Windows toont "onbekende uitgever": kies **Meer info → Toch uitvoeren**. Vereist WSL (zie hieronder). |
| **macOS** | `claude-ui-…-mac-arm64.dmg` (Apple Silicon) of `…-mac-x64.dmg` (Intel) | Sleep de app naar Programma's. Bij het eerste openen: rechtsklik → **Open** (de app is niet door Apple ondertekend). |
| **Linux** | `claude-ui-…-linux-x86_64.AppImage` | `chmod +x claude-ui-*.AppImage && ./claude-ui-*.AppImage` |

**Windows en WSL:** de app draait Claude Code in WSL (Windows Subsystem for Linux), zodat je repos, tools en Claude Code-instellingen dezelfde zijn als in je WSL-terminal. Heb je WSL nog niet, installeer het dan met `wsl --install` in PowerShell.

**Inloggen:** de eerste keer log je in met je Claude-abonnement. Typ in de app `/login`; er opent een ingebouwde terminal waarin je inlogt. Had je Claude Code al ingelogd op je computer, dan gebruikt de app die login.

## Bijwerken

Open **Instellingen** (druppelicoon rechtsboven) → **Updates** → **Controleren**. De app controleert ook zelf kort na het opstarten en laat een groen bolletje bij het druppelicoon zien als er een nieuwe versie is. Op Windows en Linux installeert de knop de update en herstart de app; op macOS opent hij de downloadpagina.

## Gebruik

- **Standaardmap**: projecten en chats komen uit één map, standaard `~/GitHub` (of je homemap als die niet bestaat). Wijzigen doe je in **Project openen → Wijzigen**; de keuze staat in `~/.config/claude-ui/config.json`.
- **Zijbalk**: chats van **Dit project** of **Alle repos** (met de repo erbij). Klik op een chat om hem te hervatten, ook als die in een andere repo staat.
- **Model en effort**: kies je onder het invoerveld; de wijziging geldt direct, ook in een lopende sessie.
- **Statusbalk**: model, context-%, 5-uursgebruik (met tempo en x1.25), 7-daagse limiet en resettijden, net als je Claude Code-statusline.
- **Chat**: Enter verstuurt, Shift+Enter geeft een nieuwe regel. Antwoorden streamen live, met markdown en codeblokken (kopieerknop).
- **Wachtrij**: verstuur je iets terwijl Claude nog bezig is, dan komt het in de wachtrij en gaat het automatisch als het antwoord klaar is. **Nu versturen** onderbreekt Claude en stuurt dat bericht direct; het onderbroken bericht komt daarna opnieuw aan de beurt.
- **Bijlagen**: plak (Ctrl+V) of sleep afbeeldingen en bestanden in het invoerveld, of gebruik de paperclip. Afbeeldingen en kleine tekstbestanden gaan direct mee. Andere bestanden (xlsx, pdf, zip, …) zet de backend in `~/.cache/claude-ui/uploads/` en Claude krijgt het pad. Klik op een geplakte foto om hem te bekijken.
- **Tools**: elke tool-call is een inklapbare regel met input en output; bestandswijzigingen zie je als diff.
- **Permissiemodus**: Shift+Tab wisselt tussen Vragen, Wijzigingen accepteren, Plan en Auto, net als in Claude Code. Alles toestaan kies je via de lijst onder het invoerveld.
- **Vragen van Claude**: als Claude een vraag met keuzes stelt, krijg je een venster met de opties en een vrij veld "Anders".
- **Shell-commando's**: begin een bericht met `!` (bv. `!git status`) om het direct in de projectmap uit te voeren; de uitvoer gaat mee met je volgende bericht aan Claude.
- **Interactieve commands**: `/permissions`, `/mcp`, `/login` en andere commands die alleen in de terminal werken, openen automatisch een ingebouwde terminal met de echte Claude Code. `/clear`, `/usage`, `/model <naam>` en `/effort <niveau>` handelt de app zelf af.
- **MCP-inloggen**: in Beheer staat bij een server die moet inloggen een knop **Inloggen** (claude.ai-connectors via claude.ai, andere servers via `/mcp` in de ingebouwde terminal).
- **Toestemming**: in de standaardmodus vraagt Claude toestemming voor schrijfacties en commando's: Toestaan, Weigeren of Altijd toestaan voor deze sessie.

Claude Code laadt dezelfde instellingen als in de terminal: `~/.claude/CLAUDE.md`, skills, plugins, MCP-servers en de settings van het project. De backend start via je login-shell, zodat de Bash-tool dezelfde `PATH` en omgeving heeft als je terminal.

## Ontwikkelen

```bash
npm ci
npm run dev        # backend (tsx watch) + Vite op http://127.0.0.1:5173 (browser)
npm run dev:app    # Electron-venster op de dev-server (naast npm run dev)
npm run typecheck
npm run build && npm run app
npm run dist       # installer voor het huidige systeem in out/
```

Structuur:
- `electron/`: venster, backend starten, klembord, meldingen en updates
- `server/`: Fastify + WebSocket op 127.0.0.1, SDK-sessies
- `web/`: React-UI (design system [Vertex](https://github.com/Kristianvanderlinde/vertex))
- `shared/protocol.ts`: berichten tussen UI en backend

Een release maken: verhoog `version` in `package.json`, commit, en push een tag `vX.Y.Z`; GitHub Actions bouwt de installers en zet ze op de releasepagina.

## Troubleshooting

| Probleem | Oplossing |
|---|---|
| Gele melding "API-key gevonden" | `ANTHROPIC_API_KEY` staat in je omgeving. De app negeert hem, maar haal hem weg uit je shell-config. |
| "De backend start niet" bij openen | De melding toont de laatste output. Op Windows: controleer of WSL werkt (`wsl -e echo ok`). |
| Claude antwoordt niet of geeft een authenticatiefout | Typ `/login` in de app en log opnieuw in. |
| Commando's in de Bash-tool vinden een programma niet | De backend gebruikt de omgeving van je login-shell. Zet `PATH` in je shell-config en herstart de app. |
| macOS: "app is beschadigd" | Draai `xattr -cr "/Applications/Claude UI.app"` in Terminal en open hem opnieuw. |
| Linux: AppImage start niet | Installeer FUSE (`sudo apt install libfuse2`) of start met `--appimage-extract-and-run`. |

## Licentie

MIT, zie [LICENSE](LICENSE).
