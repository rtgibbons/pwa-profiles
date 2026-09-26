# PWA Profiles Privacy Policy

Effective September 26, 2026.

PWA Profiles – Custom Web Apps is an independent Chrome extension for creating and applying
local, per-site web app profiles. Its canonical source is
[github.com/rtgibbons/pwa-profiles](https://github.com/rtgibbons/pwa-profiles).

## Local data and purpose

Profiles and settings are kept in `chrome.storage.local`, in your browser profile, not Chrome
Sync or a developer-operated server. They can include names, identifiers, template identity,
creation/update timestamps, enabled state, URL match patterns, replacement web app manifests
(including start URLs, icons, shortcuts, colors and display preferences), and validated page
color overrides. Old network-rule data is retained as an optional, inert `legacyRules` array
for backup compatibility. It is never interpreted or executed. No network-rule editor or
network-rule execution is provided.

The extension compares the current top-level tab URL, when Chrome makes it available, with
enabled profile patterns to select a profile and update its toolbar status. It does not read
Chrome browsing history, record a browsing-history log, or store a list of visited pages.
The packaged content script replaces or adds a manifest on matching pages with granted access;
the extension may also apply a validated color as CSS. It does not collect page content in the
background. Document-scoped injection status is used to report whether a replacement is active.

## Website discovery and network contacts

Only when you choose **Import website**, the extension requests access to the selected HTTP or
HTTPS scheme and concrete hostname, then fetches the entered page and, if linked, its same-origin
manifest. It reads page metadata such as title, description, theme color and icon declarations
to build a disabled draft. Discovery requests omit credentials and referrers. The destination
server can still receive ordinary connection information, including your IP address and request
URL. Do not put secrets, passwords, authentication tokens or sensitive query parameters in
profile fields, manifests, URLs or imported files.

Prefer HTTPS. HTTP is unencrypted and can be observed or modified in transit. HTTP support
is for localhost, legacy, intranet, and other user-selected sites. Avoid sensitive values in
HTTP URLs or content. The extension does not encrypt HTTP traffic.

Discovery does not automatically follow redirects. Readable same-origin redirects are followed
for at most five hops; cross-origin destinations are rejected before another fetch. If Chrome
hides a redirect destination, discovery stops and asks you to enter the final URL directly.
Linked cross-origin manifests are not fetched. Loading a remote icon preview, or a browser
loading remote assets referenced by an applied manifest, can contact the asset host, including
third-party hosts, under normal browser networking rules. Those hosts have their own privacy
practices; permission removal does not prevent all ordinary image or website requests. Packaged
templates instead use icons generated locally without vendor asset requests.

## Permissions and your controls

Fresh installations have zero configured profiles and no site access. All 12 templates are
optional starting points; copies start disabled. Required permissions are `storage` for local
settings and `scripting` for the packaged content script and validated CSS. There is no `tabs`
permission, required host access, or Declarative Net Request permission.

Optional HTTP/HTTPS host declarations allow the **Grant access** action to request one concrete
scheme/hostname at a time. Enabling or editing a profile never prompts for site access. An enabled
profile with missing access stays inactive and displays **Needs site access**. Wildcard-host
profiles must be edited to concrete hosts. A wildcard scheme requires separate HTTP and HTTPS
grants. Match-pattern paths narrow injection; Chrome host grants cover the whole hostname for
that scheme, across paths and ports.
Explicit ports in profile match patterns are rejected rather than silently removed. Invalid
saved or imported patterns stay available for editing and export, but cannot activate a profile.

Disabling removes site access when no other enabled profile uses it. After a disable, edit,
delete, replacement or import is saved, unused actual host grants are removed. Shared grants,
including broad grants retained from older installations, remain while they cover an origin
needed by any enabled profile. A newly acquired discovery grant is released after success or
failure unless an enabled profile needs it; discovery does not release pre-existing grants.
You can also revoke access in Chrome's extension settings. Revocation keeps profiles enabled
but inactive and stops future registrations. Reload open pages after changes: already-applied
manifests and CSS, or an installed web app's saved metadata, are not automatically undone.

## Retention, export and deletion

Data stays locally until you edit, delete or replace it, or uninstall the extension. Import and
export use files you choose locally and do not upload them. Imports replace current profiles,
migrate legacy data and always disable imported profiles; review them before enabling and
granting access. Exported files can contain all profile fields, including inert legacy data.
Keep them private. Deleting a profile or uninstalling does not delete exported files, browser
backups, remote-server logs or separately installed web apps. Delete those separately as needed.
Browser crashes or closing the options page during discovery can interrupt temporary-grant
cleanup; review Chrome's site-access settings if an operation is interrupted.

## No developer data collection or remote code

There is no developer backend, account system, analytics, advertising or telemetry. The developer
does not receive, sell or share profile data, use it for profiling, creditworthiness or lending,
or conduct human review of it. Network contacts described above serve only the features you
choose. No remote executable code is downloaded or executed; extension JavaScript is packaged
with the extension. Imported manifests and metadata are data, not scripts.

PWA Profiles' use of information received from Google APIs adheres to the Chrome Web Store
User Data Policy, including the Limited Use requirements. Data is used only to provide or
improve the extension's single purpose of user-controlled web app profiles, not for advertising,
unrelated purposes, sale, credit decisions or human review.
