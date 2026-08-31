import { expect } from "@playwright/test";

const providerHost = "formspree.io";
const providerPath = /^\/f\/[A-Za-z0-9_-]+$/;

export function normalizeProviderEndpoint(value, label = "Form provider endpoint") {
  let endpoint;
  try {
    endpoint = new URL(String(value || ""));
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }

  expect(endpoint.protocol, `${label} must use HTTPS`).toBe("https:");
  expect(endpoint.hostname, `${label} must use the approved Formspree host`).toBe(
    providerHost,
  );
  expect(endpoint.port, `${label} must not override the HTTPS port`).toBe("");
  expect(endpoint.username, `${label} must not contain credentials`).toBe("");
  expect(endpoint.password, `${label} must not contain credentials`).toBe("");
  expect(endpoint.search, `${label} must not contain a query string`).toBe("");
  expect(endpoint.hash, `${label} must not contain a fragment`).toBe("");
  expect(endpoint.pathname, `${label} must target one exact /f/<id> endpoint`).toMatch(
    providerPath,
  );

  return endpoint.href;
}

export async function formDataEntries(form) {
  return form.evaluate((element) =>
    [...new FormData(element).entries()].map(([name, value]) => [
      name,
      typeof value === "string" ? value : value.name,
    ]),
  );
}

function multipartEntries(buffer, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (!boundaryMatch) throw new Error("Enhanced POST is missing a multipart boundary");
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const delimiter = `--${boundary}`;
  const source = buffer.toString("utf8");
  const entries = [];

  for (const rawPart of source.split(delimiter).slice(1)) {
    if (rawPart.startsWith("--")) break;
    const part = rawPart.replace(/^\r\n/, "").replace(/\r\n$/, "");
    if (!part) continue;
    const separator = part.indexOf("\r\n\r\n");
    if (separator === -1) throw new Error("Malformed multipart form field");
    const headers = part.slice(0, separator);
    const disposition = /content-disposition:\s*form-data;[^\r\n]*\bname="([^"]+)"/i.exec(
      headers,
    );
    if (!disposition) throw new Error("Multipart form field is missing its name");
    entries.push([disposition[1], part.slice(separator + 4)]);
  }

  return entries;
}

export function captureProviderRequest(request) {
  const headers = request.headers();
  const contentType = headers["content-type"] || "";
  const buffer = request.postDataBuffer();
  return {
    method: request.method(),
    url: request.url(),
    contentType,
    entries: buffer ? multipartEntries(buffer, contentType) : [],
  };
}

export function expectEnhancedRequestBoundToForm({
  request,
  formAction,
  expectedEntries,
  label = "Enhanced lead submission",
}) {
  const endpoint = normalizeProviderEndpoint(formAction, `${label} form action`);
  expect(request.method, `${label} must use POST`).toBe("POST");
  expect(normalizeProviderEndpoint(request.url, `${label} request URL`)).toBe(endpoint);
  expect(request.url, `${label} must POST to form.action without URL rewriting`).toBe(
    endpoint,
  );
  expect(request.contentType, `${label} must submit browser FormData`).toMatch(
    /^multipart\/form-data;\s*boundary=/i,
  );

  const expectedStableEntries = expectedEntries.filter(
    ([name]) => name !== "submission_id",
  );
  const actualStableEntries = request.entries.filter(
    ([name]) => name !== "submission_id",
  );
  expect(
    actualStableEntries,
    `${label} request fields must exactly match the submitted form fields`,
  ).toEqual(expectedStableEntries);

  const submissionIds = request.entries
    .filter(([name]) => name === "submission_id")
    .map(([, value]) => value);
  expect(submissionIds, `${label} must include exactly one idempotency tag`).toHaveLength(1);
  expect(
    submissionIds[0],
    `${label} idempotency tag must be a non-empty UUID or 128-bit hexadecimal value`,
  ).toMatch(/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);

  return submissionIds[0];
}
