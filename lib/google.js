"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const credentialsDir = path.join(__dirname, "..", ".credentials");
const clientPath = () => process.env.GMAIL_OAUTH_CLIENT || path.join(credentialsDir, "client.json");
const tokenPath = () => process.env.GMAIL_OAUTH_TOKEN || path.join(credentialsDir, "token.json");

async function readJson(file, description) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${description}; see the setup instructions.`, { cause: error });
  }
}

async function readClient() {
  const data = await readJson(clientPath(), "OAuth client credentials");
  const client = data.installed;
  if (!client || typeof client.client_id !== "string" || typeof client.client_secret !== "string") {
    throw new Error("OAuth client credentials must be a Google Desktop app client JSON file.");
  }
  return client;
}

async function requestJson(url, options, description) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  } catch (error) {
    throw new Error(`${description} failed: network error or timeout.`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(`${description} failed (HTTP ${response.status}).`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${description} returned invalid JSON.`, { cause: error });
  }
}

async function getAccessToken() {
  const [client, token] = await Promise.all([
    readClient(),
    readJson(tokenPath(), "Gmail authorization token")
  ]);
  if (typeof token.refresh_token !== "string" || !token.refresh_token) {
    throw new Error("Gmail refresh token is missing; run npm run auth again.");
  }
  const data = await requestJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token"
    })
  }, "Gmail authorization");
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new Error("Gmail authorization returned no access token.");
  }
  return data.access_token;
}

module.exports = { clientPath, tokenPath, readClient, requestJson, getAccessToken };
