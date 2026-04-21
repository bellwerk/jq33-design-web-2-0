(() => {
  const config = window.JQ33 || {};
  const measurementId = String(config.GA_MEASUREMENT_ID || "").trim();
  if (!measurementId) return;

  if (!window.dataLayer) {
    window.dataLayer = [];
  }
  if (!window.gtag) {
    window.gtag = function gtag() {
      window.dataLayer?.push(arguments);
    };
  }

  if (document.querySelector(`script[src*="gtag/js?id=${measurementId}"]`)) {
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
    measurementId
  )}`;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", measurementId, { anonymize_ip: true });

  const sendWebVital = (name, value) => {
    if (!window.gtag) return;
    const rounded = name === "CLS" ? Math.round(value * 1000) : Math.round(value);
    window.gtag("event", "web_vital", {
      event_category: "Web Vitals",
      event_label: name,
      value: rounded,
      non_interaction: true
    });
  };

  let clsValue = 0;
  let lcpEntry;
  const reportVitals = () => {
    if (reportVitals.hasReported) return;
    reportVitals.hasReported = true;
    if (lcpEntry) {
      sendWebVital("LCP", lcpEntry.startTime);
    }
    if (clsValue) {
      sendWebVital("CLS", clsValue);
    }
  };
  reportVitals.hasReported = false;

  if ("PerformanceObserver" in window) {
    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        if (entries.length) {
          lcpEntry = entries[entries.length - 1];
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      /* no-op */
    }

    try {
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch {
      /* no-op */
    }

    try {
      const fidObserver = new PerformanceObserver((entryList) => {
        const entry = entryList.getEntries()[0];
        if (!entry) return;
        const fid = entry.processingStart - entry.startTime;
        sendWebVital("FID", fid);
      });
      fidObserver.observe({ type: "first-input", buffered: true });
    } catch {
      /* no-op */
    }
  }

  window.addEventListener("pagehide", reportVitals, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      reportVitals();
    }
  });
})();
