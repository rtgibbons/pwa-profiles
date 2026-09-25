(async () => {
  const response = await chrome.runtime.sendMessage({ type: "getConfigurationForPage" });
  if (!response?.ok || !response.configuration) return;

  const { id, manifest, replaceExistingManifest } = response.configuration;
  const manifestUrl = `data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}`;

  if (!document.head) {
    await new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (!document.head) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(document, { childList: true, subtree: true });
    });
  }

  if (replaceExistingManifest) removeOtherManifests(manifestUrl);
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = manifestUrl;
  link.dataset.betterPwas = id;
  document.head.appendChild(link);

  if (replaceExistingManifest) {
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLLinkElement && node.rel === "manifest" && node.href !== manifestUrl) {
            node.remove();
          }
        }
      }
    }).observe(document.head, { childList: true });
  }

  await chrome.runtime.sendMessage({ type: "manifestInjected", configurationId: id });
})().catch((error) => console.error("PWA Profiles could not inject the manifest:", error));

function removeOtherManifests(manifestUrl) {
  document.querySelectorAll('link[rel="manifest"]').forEach((link) => {
    if (link.href !== manifestUrl) link.remove();
  });
}
