const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["coverage/**", "node_modules/**"]
  },
  js.configs.recommended,
  {
    files: ["MMM-GmailTracking.js"],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    files: ["eslint.config.js", "node_helper.js", "lib/**/*.js", "scripts/**/*.js", "test/**/*.js"],
    languageOptions: {
      globals: globals.node
    }
  }
];
