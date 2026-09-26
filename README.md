# PWA Profiles – Custom Web Apps

**Independent project: not affiliated with, sponsored by, or endorsed by any listed site or
vendor. Product names and trademarks belong to their respective owners and identify compatible
services only. No vendor logo artwork is distributed; bundled templates use neutral generated icons.**

PWA Profiles is a Chrome extension that helps websites feel more like real desktop apps. It lets
you replace a site's web app manifest with one you control—without changing the website or sending
your settings anywhere.

Maintained by Ryan Gibbons at [rtgibbons/pwa-profiles](https://github.com/rtgibbons/pwa-profiles).

This is useful when a site has an incomplete manifest, does not expose the window style you want,
or is not installable as a Progressive Web App at all.

## What you can customize

Each site has its own **profile** (called a configuration in the settings page). A profile contains
the addresses it applies to, its replacement manifest, and optional page color settings.

With a profile, you can:

- choose whether the app opens as a normal browser tab, minimal window, standalone window, or
  fullscreen app;
- request enhanced modes such as a tabbed app or window-controls overlay, with a standard display
  mode as the fallback;
- set the manifest theme color with a color picker;
- set the active-tab color manually, or derive one from the theme color using Chromium's contrast
  behavior;
- keep advanced and experimental manifest fields by editing the complete JSON;
- export your profiles for backup or import them into another browser.

## An easier starting point

You do not have to write a manifest from scratch. Enter a website URL and PWA Profiles will import
its same-origin manifest after you explicitly grant that site access. If the site does not have one, the extension builds a draft from metadata
such as the page title, description, theme color, and icons.

When no usable app icon exists, PWA Profiles creates a tiny, deterministic gradient-and-stripes icon
for that site. It is generated locally and remains the same for the same hostname.

The extension also includes read-only templates. Using one creates an editable copy, so the bundled
original is always available if you want to start over. Fresh installs have **zero profiles and no
site access**; all 12 templates are opt-in and copies start disabled. Templates include Slack, GitHub, Canva,
Sydney Morning Herald, Notion, Claude, Discord, Outlook, Microsoft Teams, X, and Reddit.

This project builds on Ben's MIT-licensed
[betterPWAs at 40ee31a](https://github.com/benfredwells/betterPWAs/commit/40ee31ad6cf6acc66189b482dab25df094b5abc2),
with adapted templates/software from MIT-licensed
[bmndc/betterPWAs at d10a17c](https://github.com/bmndc/betterPWAs/commit/d10a17ca4dc928be96f4acc4367a9202133b11d4).
See [third-party notices and the asset ledger](THIRD_PARTY_NOTICES.md) and [LICENSE](LICENSE).

On upgrade, saved profiles with a known `templateId` have obsolete bundled/vendor template
icons replaced by neutral generated icons, including legacy shortcut artwork. Recognized X
defaults and its obsolete notification-icon rule are updated without resetting other settings.
Custom icons, colors, and profile edits are retained. Schema 3 archives old rules as inert
`legacyRules` data for import/export only; there is no rule editor, execution or CSP removal.
Existing enabled states and identities survive upgrades without a permission prompt. Custom/imported profiles and profiles
whose template identity was manually removed cannot be safely attributed and are left unchanged;
replace their obsolete icon references manually or recreate them from a current template.

## How to use it

> **Create and enable the site profile before you create or install the web app.** Chromium reads
> the manifest while creating the app, so installing first can leave the app using the site's old
> manifest.

1. Load PWA Profiles and open its settings by clicking the extension icon or choosing
   **Extension details → Extension options**.
2. Select **New configuration**, import a website, or start from one of the templates.
3. Review the site match pattern and manifest. Adjust the display modes, colors, icon, or advanced
   JSON as needed.
4. Turn on **Enabled** and save. This never prompts. If access is missing the profile stays
   inactive and says **Needs site access**. Click **Grant access** for each concrete origin.
   Denial leaves the profile enabled but inactive. `*://example.com/*` needs separate HTTP and
   HTTPS grants; wildcard hosts must be edited into concrete host patterns.
5. Open or reload the website so PWA Profiles can apply the replacement manifest after access
   is granted. Path-specific patterns narrow injection, but Chrome grants cover all paths and
   ports on that scheme/hostname.
6. Use the browser's **Install app** or **Create shortcut** action to create the app.

If the app was already installed before its profile was enabled, uninstall the app and create it
again. Changing an installed app's identity-related manifest fields may also require recreating it.

To confirm the replacement is active, open the site's DevTools and check **Application →
Manifest**. You should see the name, colors, display modes, and other values from your profile.

Disabling removes site access when no other enabled profile uses it. Edits, deletion and imports
also remove unused actual grants after saving; shared or broad legacy grants remain if another
enabled profile needs an origin they cover. Chrome-side revocation leaves the profile enabled
but inactive. Reload pages after changes: existing document CSS/manifests and installed app
metadata are not automatically undone. Toolbar status resets when the tab URL is unavailable.

Settings exports use `pwa-profiles-settings-YYYY-MM-DD.json`. Existing
`better-pwas-settings-*.json` backups still import by content; imported profiles start disabled.
The rebrand does not change storage keys or web app manifest IDs. Name and version changes do
not transfer storage between extension IDs; keep the same extension installation when upgrading.

## Privacy

Profiles are stored locally in `chrome.storage.local`. Only storage and scripting are required.
Site access is optional and requested one concrete origin per Grant access or Import website
click. Discovery temporarily acquires access, fetches only the selected origin's page and
same-origin manifest without credentials/referrers, then releases newly acquired access unless
an enabled profile needs it. Pre-existing grants are retained. Readable same-origin redirects
are limited to five hops; Chrome-hidden redirects fail closed and require the final URL directly.
Remote icon previews and applied-manifest assets may contact third-party servers. No remote
code, developer backend or telemetry is used. Do not store secrets or tokens in profiles.
See [PRIVACY.md](PRIVACY.md) for site access and discovery behavior.

## Development

Load this directory as an unpacked extension at `chrome://extensions` with Developer mode enabled.

### Developer-only cleanup before a same-ID unpacked upgrade

Old dynamic network rules can persist outside profile storage. Before upgrading from a build
with network-rule permission, **export your profiles**, then run in the **old worker** DevTools:

```js
const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds: oldRules.map(rule => rule.id)});
await chrome.declarativeNetRequest.getDynamicRules(); // Verify [] before updating.
```

Only then update/reload. This build cannot clear those rules and makes no cleanup API calls.
If already upgraded, export, remove the unpacked extension, reload it, and import. **Imports
start disabled.** A new CWS item ID cannot inherit old dynamic rules or settings from another
ID. See source-only [CWS_SUBMISSION.md](CWS_SUBMISSION.md) for reviewer and disclosure guidance.

```sh
npm test
npm run check
```

After committing tracked changes, run `npm run package` to build and verify
`dist/pwa-profiles.zip` from an explicit runtime allowlist in clean tracked HEAD. Requires Node.js
22 or newer, Git, and `unzip`. Repeated builds of the same commit are byte-identical. Untracked
files and source-only artwork never enter the archive; LICENSE and notices are included.
