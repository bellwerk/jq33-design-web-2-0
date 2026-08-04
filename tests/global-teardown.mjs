export default async function globalTeardown(config) {
  const externalServer =
    process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1" ||
    process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";
  if (externalServer) return;

  const baseURL = config.projects?.[0]?.use?.baseURL;
  if (!baseURL) return;
  const parsed = new URL(baseURL);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) return;

  const shutdownUrl = new URL("/__jq33-playwright-shutdown__", parsed);
  const response = await fetch(shutdownUrl, {
    method: "POST",
    headers: { Connection: "close" },
    signal: AbortSignal.timeout(2_000),
  });
  if (response.status !== 204) {
    throw new Error(
      `Managed Playwright server refused deterministic shutdown (${response.status})`,
    );
  }
}
