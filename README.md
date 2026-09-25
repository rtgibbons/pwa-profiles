# Better PWAs

**Independent project: not affiliated with, sponsored by, or endorsed by any listed site or
vendor. Product names and trademarks belong to their respective owners and identify compatible
services only. No vendor logo artwork is distributed; bundled templates use neutral generated icons.**

Better PWAs is a Chrome extension that helps websites feel more like real desktop apps. It lets
you replace a site's web app manifest with one you control—without changing the website or sending
your settings anywhere.

This is useful when a site has an incomplete manifest, does not expose the window style you want,
or is not installable as a Progressive Web App at all.

## What you can customize

Each site has its own **profile** (called a configuration in the settings page). A profile contains
the addresses it applies to, its replacement manifest, and any optional network rules.

With a profile, you can:

- choose whether the app opens as a normal browser tab, minimal window, standalone window, or
  fullscreen app;
- request enhanced modes such as a tabbed app or window-controls overlay, with a standard display
  mode as the fallback;
- set the manifest theme color with a color picker;
- set the active-tab color manually, or derive one from the theme color using Chromium's contrast
  behavior;
- keep advanced and experimental manifest fields by editing the complete JSON;
- manage Declarative Net Request rules needed by a particular site; and
- export your profiles for backup or import them into another browser.

## An easier starting point

You do not have to write a manifest from scratch. Enter a website URL and Better PWAs will import
its existing manifest. If the site does not have one, the extension builds a draft from metadata
such as the page title, description, theme color, and icons.

When no usable app icon exists, Better PWAs creates a tiny, deterministic gradient-and-stripes icon
for that site. It is generated locally and remains the same for the same hostname.

The extension also includes read-only templates. Using one creates an editable copy, so the bundled
original is always available if you want to start over. Templates include Slack, GitHub, Canva,
Sydney Morning Herald, Notion, Claude, Discord, Outlook, Microsoft Teams, X, and Reddit.

This project builds on Ben's MIT-licensed
[betterPWAs at 40ee31a](https://github.com/benfredwells/betterPWAs/commit/40ee31ad6cf6acc66189b482dab25df094b5abc2),
with adapted templates/software from MIT-licensed
[bmndc/betterPWAs at d10a17c](https://github.com/bmndc/betterPWAs/commit/d10a17ca4dc928be96f4acc4367a9202133b11d4).
See [third-party notices and the asset ledger](THIRD_PARTY_NOTICES.md) and [LICENSE](LICENSE).

On upgrade, saved profiles with a known `templateId` have obsolete bundled/vendor template
icons replaced by neutral generated icons, including legacy shortcut artwork. Recognized X
defaults and its obsolete notification-icon rule are updated without resetting other settings.
Custom icons, rules, colors, and profile edits are retained. Custom/imported profiles and profiles
whose template identity was manually removed cannot be safely attributed and are left unchanged;
replace their obsolete icon references manually or recreate them from a current template.

## How to use it

> **Create and enable the site profile before you create or install the web app.** Chromium reads
> the manifest while creating the app, so installing first can leave the app using the site's old
> manifest.

1. Load Better PWAs and open its settings by clicking the extension icon or choosing
   **Extension details → Extension options**.
2. Select **New configuration**, import a website, or start from one of the templates.
3. Review the site match pattern and manifest. Adjust the display modes, colors, icon, or advanced
   JSON as needed.
4. Turn on **Enabled** and approve access to the requested site. This activates the profile.
5. Open or reload the website so Better PWAs can apply the replacement manifest.
6. Use the browser's **Install app** or **Create shortcut** action to create the app.

If the app was already installed before its profile was enabled, uninstall the app and create it
again. Changing an installed app's identity-related manifest fields may also require recreating it.

To confirm the replacement is active, open the site's DevTools and check **Application →
Manifest**. You should see the name, colors, display modes, and other values from your profile.

## Privacy

Profiles are stored locally in `chrome.storage.local`. The four original sites have required host
permissions; other sites require optional access for enabling profiles or importing site metadata.
See [PRIVACY.md](PRIVACY.md) for site access and discovery behavior.

## Development

Load this directory as an unpacked extension at `chrome://extensions` with Developer mode enabled.

```sh
npm test
npm run check
```

After committing tracked changes, run `npm run package` to build and verify
`dist/betterPWAs.zip` from an explicit runtime allowlist in clean tracked HEAD. Requires Node.js
22 or newer, Git, and `unzip`. Repeated builds of the same commit are byte-identical. Untracked
files and source-only artwork never enter the archive; LICENSE and notices are included.
