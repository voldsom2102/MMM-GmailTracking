"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { messageEvidence, normalizeShipment, extractShipments, getShipments } = require("../lib/tracking");

const encode = (text) => Buffer.from(text).toString("base64url");

test("extracts bounded evidence and decodes HTML tracking links", () => {
  const evidence = messageEvidence({
    snippet: "Your order shipped",
    payload: {
      parts: [
        { mimeType: "text/plain", body: { data: encode("Your package shipped. Tracking 123456789012. https://carrier.example/123456789012") } },
        { mimeType: "text/html", body: { data: encode('<a href="https://carrier.example/track?id=1&amp;x=2">Track</a>') } }
      ]
    }
  });
  assert.match(evidence.excerpts, /123456789012/);
  assert.deepEqual(evidence.links, ["https://carrier.example/track?id=1&x=2", "https://carrier.example/123456789012"]);
  assert.ok(evidence.excerpts.length <= 8000);
});

test("validates links, dates and status, without fabricating missing facts", () => {
  const evidence = { snippet: "Tracking 123", excerpts: "", links: ["https://carrier.example/track"] };
  assert.equal(normalizeShipment({ trackingLink: "https://invented.example" }, evidence), null);
  assert.deepEqual(normalizeShipment({
    carrier: "",
    trackingNumber: "123",
    trackingLink: "https://invented.example",
    expectedDeliveryDate: "2025-02-30",
    status: "shipped"
  }, evidence), {
    carrier: "Unknown", trackingNumber: "123", trackingLink: "", expectedDeliveryDate: "", status: "unknown"
  });
  assert.equal(normalizeShipment({ trackingLink: evidence.links[0], expectedDeliveryDate: "2025-02-28", status: "Delayed" }, evidence).status, "delayed");
  assert.equal(normalizeShipment({ trackingNumber: "456" }, evidence), null);
});

test("rejects malformed Gemini results", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }) });
  await assert.rejects(extractShipments({ snippet: "", excerpts: "", links: [] }, "key", "model"), /invalid or incomplete/);
});

test("surfaces API errors without exposing response bodies", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({ ok: false, status: 429 });
  await assert.rejects(extractShipments({ snippet: "", excerpts: "", links: [] }, "key", "model"), /Gemini request failed \(HTTP 429\)/);
});

test("loads Gmail updates, deduplicates results and caches successful extractions", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gmail-tracking-test-"));
  const previous = { client: process.env.GMAIL_OAUTH_CLIENT, token: process.env.GMAIL_OAUTH_TOKEN, key: process.env.GEMINI_API_KEY, fetch: global.fetch };
  t.after(async () => {
    for (const [name, value] of [["GMAIL_OAUTH_CLIENT", previous.client], ["GMAIL_OAUTH_TOKEN", previous.token], ["GEMINI_API_KEY", previous.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    global.fetch = previous.fetch;
    await fs.rm(dir, { recursive: true, force: true });
  });
  process.env.GMAIL_OAUTH_CLIENT = path.join(dir, "client.json");
  process.env.GMAIL_OAUTH_TOKEN = path.join(dir, "token.json");
  process.env.GEMINI_API_KEY = "test-key";
  await fs.writeFile(process.env.GMAIL_OAUTH_CLIENT, JSON.stringify({ installed: { client_id: "id", client_secret: "secret" } }));
  await fs.writeFile(process.env.GMAIL_OAUTH_TOKEN, JSON.stringify({ refresh_token: "refresh" }));
  let geminiCalls = 0;
  global.fetch = async (input, options) => {
    const url = String(input);
    let data;
    if (url.includes("oauth2.googleapis.com")) data = { access_token: "access" };
    else if (url.includes("generativelanguage.googleapis.com")) {
      geminiCalls++;
      const request = JSON.parse(options.body);
      const evidence = JSON.parse(request.contents[0].parts[0].text);
      assert.match(evidence.excerpts, /tracking 123/);
      const status = evidence.snippet === "new shipment" ? "delayed" : "on time";
      data = { candidates: [{ content: { parts: [{ text: JSON.stringify([{ carrier: "UPS", trackingNumber: "123", trackingLink: "", expectedDeliveryDate: "", status }]) }] } }] };
    } else if (url.includes("?format=full")) {
      const isNew = url.includes("/new?");
      data = { internalDate: isNew ? "2000" : "1000", snippet: isNew ? "new shipment" : "old shipment", payload: { mimeType: "text/plain", body: { data: encode("tracking 123") } } };
    } else data = { messages: [{ id: "old" }, { id: "new" }] };
    return { ok: true, json: async () => data };
  };
  const cache = new Map();
  const config = { query: "shipped", maxMessages: 2, model: "test-model" };
  const shipments = await getShipments(config, cache);
  assert.equal(shipments.length, 1);
  assert.equal(shipments[0].status, "delayed");
  assert.equal((await getShipments(config, cache)).length, 1);
  assert.equal(geminiCalls, 2);
});
