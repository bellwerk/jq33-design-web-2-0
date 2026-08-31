(() => {
  "use strict";

  const nextPaint = () =>
    new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });

  const waitForStylesheet = (stylesheet) => {
    if (stylesheet.sheet) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        window.clearTimeout(timeout);
        stylesheet.removeEventListener("load", finish);
        stylesheet.removeEventListener("error", finish);
        resolve();
      };
      const timeout = window.setTimeout(finish, 8_000);
      stylesheet.addEventListener("load", finish, { once: true });
      stylesheet.addEventListener("error", finish, { once: true });
    });
  };

  const activateDeferredStyles = async () => {
    const stylesheets = [
      ...document.querySelectorAll('link[rel="stylesheet"][data-jq33-deferred-css]'),
    ];
    await nextPaint();
    for (const stylesheet of stylesheets) stylesheet.media = "all";
    await Promise.all(stylesheets.map(waitForStylesheet));
    await nextPaint();
    document.documentElement.dataset.jq33Css = "ready";
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void activateDeferredStyles(), {
      once: true,
    });
  } else {
    void activateDeferredStyles();
  }
})();
