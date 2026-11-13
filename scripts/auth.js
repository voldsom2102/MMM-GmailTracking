"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { readClient, requestJson, tokenPath } = require("../lib/google");

async function main() {
  const client = await readClient();
  const state = crypto.randomBytes(32).toString("hex");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const server = http.createServer();

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const redirectUri = `http://127.0.0.1:${server.address().port}/oauth2callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });

  console.log("Open this URL in a browser on this machine and authorize Gmail access:");
  console.log(authUrl.toString());

  try {
    const code = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Authorization timed out.")), 300000);
      server.on("request", (req, res) => {
        const url = new URL(req.url, redirectUri);
        if (url.pathname !== "/oauth2callback") {
          res.writeHead(404).end("Not found");
          return;
        }
        if (url.searchParams.get("state") !== state) {
          res.writeHead(400).end("Invalid authorization state.");
          return;
        }
        clearTimeout(timeout);
        if (url.searchParams.has("error") || !url.searchParams.get("code")) {
          res.writeHead(400).end("Authorization failed. Return to the terminal.");
          reject(new Error("Gmail authorization was denied or did not return a code."));
          return;
        }
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" })
          .end("Authorization received. You can close this window and return to the terminal.");
        resolve(url.searchParams.get("code"));
      });
    });

    const token = await requestJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: client.client_id,
        client_secret: client.client_secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier
      })
    }, "OAuth token exchange");
    if (typeof token.refresh_token !== "string" || !token.refresh_token) {
      throw new Error("Google did not return a refresh token. Revoke the app's access and try again.");
    }
    const file = tokenPath();
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(file, JSON.stringify({ refresh_token: token.refresh_token }, null, 2), { mode: 0o600 });
    await fs.chmod(file, 0o600);
    console.log("Gmail authorization saved.");
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
