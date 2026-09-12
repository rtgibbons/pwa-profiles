# Better PWAs

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
Sydney Morning Herald, Notion, Claude, Discord, Outlook, Microsoft Teams, X, and Reddit. Several
were adapted from [bmndc/betterPWAs](https://github.com/bmndc/betterPWAs).

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

Profiles are stored locally in `chrome.storage.local`. Site access is requested only when needed,
and importing a website or applying its profile does not send your settings to an external service.

## Development

Load this directory as an unpacked extension at `chrome://extensions` with Developer mode enabled.

```sh
npm test
npm run check
```
