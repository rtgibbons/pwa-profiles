# Chrome Web Store submission worksheet — source only

Not part of the extension ZIP. These are draft dashboard answers for owner review, not a claim
that an item has been submitted or approved. Do not submit until public URLs and support contact
are owner-approved and the final package has been reviewed.

## Single purpose (exact answer)

Let users create, edit, and apply local per-site web app profiles that customize a website's
installable web app manifest, display behavior, icons, and colors on explicitly authorized sites.

## Permission justifications

- **storage:** Store user-created profiles, settings, schema version, and inert legacy backup
  data locally in `chrome.storage.local`; support local import/export. No Sync or server storage.
- **scripting:** Register the packaged manifest-replacement content script only for enabled
  profiles with all required site grants, preserving path-specific matches. Apply validated
  hexadecimal color overrides as CSS on authorized matching pages.
- **Optional hosts `http://*/*`, `https://*/*`:** Users choose arbitrary websites, so the optional
  declaration must cover web origins. At runtime, request only one concrete scheme/hostname
  per explicit Grant access or Import website click. Never request wildcard hosts or all sites.
  Fresh installs have no site grants or profiles. HTTP supports user-selected local and other
  HTTP web apps; it is not requested globally. Enabling alone never prompts. Missing access is
  visibly inactive. Disabling removes site access when no other enabled profile uses it.
  Edits/deletion/imports also release unused actual grants after persistence. Shared and broad
  legacy grants remain only while needed. Discovery releases a newly acquired grant in finally
  unless an enabled profile needs it; pre-existing discovery access is retained.

No tabs, required host, or network-rule permissions. Current top-level URLs may be available
through the tabs API under host grants; no browsing-history API or log is used.

## Remote code answer

**No.** All executable JavaScript is in the package. User-selected page metadata and same-origin
manifest JSON are data, not code. Locally generated icons and optional remote icon/asset URLs
are images, not remotely hosted scripts. No eval, Function constructor or remote module loading.
CSS is generated from validated colors, not downloaded. No CSP-removal/network-rule feature.

## Privacy practices / data categories

Conservatively disclose **Web history**, **Website content**, and **User-generated content** if
offered by the dashboard. Explain that these describe local access/processing, not collection
by the developer:

- Web history: current top-level URL matching for authorized profiles and toolbar status only;
  no history API, visit log or developer transmission.
- Website content: explicit Import website reads the selected page metadata and same-origin
  manifest to build a disabled draft. Redirects are manual, same-origin and bounded when
  readable; opaque destinations fail closed. No cross-origin redirect target is fetched.
- User-generated content: locally edited profiles/manifests, names, match patterns, settings,
  icons, timestamps and inert `legacyRules`; local export/import only.

Disclose remote preview and applied-manifest asset contacts (possibly third-party hosts), and
ordinary server connection information. Discovery fetches omit credentials/referrers, but
remote images follow browser networking rules. The packaged templates' icons are local.

Certify only after confirming final code: no sale/transfers to third parties for unrelated
purposes; no advertising, profiling, creditworthiness/lending use, or human review; use only
for the stated single purpose. No backend, accounts, analytics or telemetry. Follow Chrome
Web Store User Data Policy and Limited Use requirements. Local data remains until removed,
replaced or uninstalled; exports, backups and installed web apps are separate. Warn users not
to store secrets or tokens. The public policy is `PRIVACY.md`; keep dashboard text consistent.

## Publication placeholders — owner approval required

- Privacy policy public URL: **[PLACEHOLDER: owner-approved stable HTTPS URL displaying PRIVACY.md]**
- Support URL: **[PLACEHOLDER: owner-approved public support URL]**
- Support email, if required: **[PLACEHOLDER: owner-approved contact; do not publish an inferred address]**
- Canonical source: https://github.com/rtgibbons/pwa-profiles

## Reviewer steps — no account or external mutation

1. Install fresh and open options. Confirm zero profiles and 12 optional templates; no site
   access is required at install. Copy a template and confirm the editable copy starts disabled.
2. For a public read-only test, create a new profile using Import website with
   `https://example.com`. Approve only `https://example.com/*`. Inspect the disabled draft and
   save it. If the server blocks discovery, copy a template instead and change its name,
   pattern to `https://example.com/*`, start URL and scope to `https://example.com/`.
3. Enable the profile. No permission prompt occurs; with no retained grant it says Needs site
   access. Click Grant access, deny, and confirm it remains enabled/inactive. Click again and
   approve. Reload example.com. Inspect Application → Manifest and the toolbar title.
4. Copy/create a second enabled profile for the same origin. Disable the first and confirm
   the shared grant remains. Disable the last and confirm access is removed. Re-enable without
   prompting. Grant again, then revoke using Chrome's extension settings; the profile stays
   enabled but inactive. Reload to remove previously applied document changes.
5. Export locally, then import the file. Confirm all imported profiles are disabled. No login,
   purchase, form submission, remote write, or installation of a separate web app is required.
6. Review policy, optional-host prompts and the source package. CWS_SUBMISSION.md, tests,
   scripts, source artwork and README are excluded; privacy, LICENSE and notices are included.

## Developer-only same-ID unpacked upgrade warning

Persistent dynamic rules from the old build may survive a same-ID unpacked upgrade. Before
upgrading, export profiles, open the **old** extension worker DevTools and run:

```js
const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds: oldRules.map(rule => rule.id)});
await chrome.declarativeNetRequest.getDynamicRules(); // Must return [] before updating.
```

Then update/reload the unpacked extension. The new build deliberately has neither the API
permission nor runtime cleanup calls. If already upgraded without cleanup, export, remove
the unpacked extension, reload it, and import the backup. Imports start disabled. A new CWS
item ID cannot inherit another extension ID's old dynamic rules or local settings.
