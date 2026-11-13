# MMM-GmailTracking

If you like my work, consider buying me a coffee.

<a href="https://ko-fi.com/ajmartin_dev"><img height="36" src="https://storage.ko-fi.com/cdn/kofi6.png?v=6" alt="Buy Me a Coffee at ko-fi.com" /></a>

A [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) module that searches Gmail for shipment emails and asks Gemini to extract the carrier, tracking number, expected delivery date, and delivery status. It uses the official Gmail API, not web scraping. It does **not** query carriers or provide live tracking: fields are based on the emails, and unavailable or unsupported information is shown as unknown. In particular, "shipped" or "out for delivery" does not by itself mean a package is on time.

## Privacy and security

- The module requests **read-only access to the entire Gmail account**. Search results are not modified or marked read.
- For each matching message, the module retrieves its body and sends its Gmail snippet, excerpts around shipping-related terms, and up to 30 links to Google's Gemini API. These can contain names, addresses, order details, private tracking links, or other sensitive information. Review [Gemini API data usage](https://ai.google.dev/gemini-api/terms) before enabling it. Model output may be inaccurate; verify important deliveries with the carrier.
- Gemini calls may incur charges. The default checks up to 15 messages every 30 minutes; unchanged messages are cached in memory until the helper restarts or they leave the search results. The module does not automatically open tracking links.
- The MagicMirror display and its web interface can expose tracking information to anyone who can see or access them. Secure your MagicMirror installation and network.
- OAuth credentials, refresh tokens, and API keys must never be committed or placed in MagicMirror's module configuration. The default `.credentials/` directory and `.env` files are ignored by Git. Keep any credentials stored elsewhere outside public repositories, with restrictive permissions.

## Requirements

- MagicMirror², running Node.js 18 or later.
- A Google Cloud project with the Gmail API enabled, and an OAuth consent screen configured for your account.
- A Google OAuth **Desktop app** client JSON file.
- A [Gemini API key](https://ai.google.dev/gemini-api/docs/api-key) and access to the configured model.

For an external Google OAuth app in testing, add your Gmail account as a test user. Google may expire testing-mode refresh tokens after seven days; rerun authorization when needed. Gmail's read-only scope is restricted and public distribution can require Google verification.

## Setup

1. Copy or clone this project to `MagicMirror/modules/MMM-GmailTracking`. There are no npm dependencies to install.
2. Enable the [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com), configure the OAuth consent screen, create a **Desktop app** OAuth client, and download its JSON file. From the module directory, create the private credentials directory:

   ```sh
   mkdir -p .credentials
   chmod 700 .credentials
   ```

   Save the downloaded file as `.credentials/client.json`, then run `chmod 600 .credentials/client.json`.
3. From the module directory, run `npm run auth` on the machine that can open the browser. Open the printed URL, sign in with the Gmail account to monitor, and authorize read-only access. The local callback listens on `127.0.0.1`; the resulting refresh token is saved in `.credentials/token.json` with owner-only permissions. For a headless mirror, authorize on another trusted machine and securely copy the client and token files to the mirror.
4. Set `GEMINI_API_KEY` in the environment of the process that starts MagicMirror (for example in your service manager's environment configuration). **Do not** put it in `config.js`. If using custom credential paths, set `GMAIL_OAUTH_CLIENT` and/or `GMAIL_OAUTH_TOKEN` to absolute file paths in both the authorization and MagicMirror process environments.
5. Add the module to MagicMirror's `config/config.js`:

   ```js
   {
     module: "MMM-GmailTracking",
     position: "top_right",
     header: "Deliveries",
     config: {
       updateInterval: 30 * 60 * 1000,
       maxMessages: 15,
       maxShipments: 10
     }
   }
   ```

6. Restart MagicMirror. Errors are displayed on the mirror; check its logs for details. To revoke access, remove the app from your Google account's third-party connections and delete the local token file.

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `query` | `newer_than:60d {shipped "out for delivery" "tracking number" "delivery update" UPS FedEx USPS DHL}` | Gmail search query. Tune it to include relevant shipping emails and exclude unrelated mail. |
| `updateInterval` | `1800000` | Milliseconds between completed updates; minimum 60000. |
| `maxMessages` | `15` | Maximum matching messages to examine per update, from 1 to 100. Only the first search page is used. |
| `maxShipments` | `10` | Maximum shipments displayed. |
| `model` | `gemini-3.5-flash-lite` | Gemini API model name available to your API key. |

Emails with the same tracking number are deduplicated, keeping the most recent matching message by Gmail's internal timestamp. Messages with only a tracking link can be shown with an unavailable tracking number; only links present in the email evidence are accepted. Tracking numbers must also appear in the evidence. Dates without an unambiguous year are not guessed. The module displays the latest matching email evidence, not a complete shipment history.

## Development

Run `npm test` using Node.js 18 or newer. Tests use mock API responses and do not require credentials or network access. Run `npm run lint` to check the JavaScript files with ESLint.

## License

This project is licensed under the [MIT License](LICENSE).
