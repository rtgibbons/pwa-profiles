Better PWAs does not collect, transmit, sell, or share personal information.

The extension stores user-created site configurations, web app manifests, and network rules in
Chrome's local extension storage. This data stays on the user's device and is not available to the
developer. Exported settings are saved only when the user explicitly requests a local backup.

The extension declares required access to app.slack.com, github.com, www.canva.com, and
www.smh.com.au, and creates enabled profiles for those sites on first use. Chromium controls
whether that access is granted. Other HTTP/HTTPS origins are optional: access is requested
when you enable a profile or import a site's manifest and page metadata. Importing fetches the
page and its same-origin manifest; previewing imported icons can contact their hosts.
The extension only registers profile scripts and network rules for enabled profiles
with granted access. Site access supports manifest replacement, profile color overrides,
user-configured Declarative Net Request rules, and user-initiated site discovery.

The source code can be inspected at [github.com/rtgibbons/pwa-profiles](https://github.com/rtgibbons/pwa-profiles).
