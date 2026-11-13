"use strict";

const NodeHelper = require("node_helper");
const { getShipments } = require("./lib/tracking");

module.exports = NodeHelper.create({
  start() {
    this.caches = new Map();
    this.inFlight = new Set();
  },

  async socketNotificationReceived(notification, payload) {
    if (notification !== "GMAIL_TRACKING_FETCH" || !payload || typeof payload.id !== "string") return;
    const id = payload.id;
    if (this.inFlight.has(id)) return;
    this.inFlight.add(id);
    try {
      if (typeof payload.query !== "string" || !payload.query.trim() ||
          !Number.isInteger(payload.maxMessages) || payload.maxMessages < 1 || payload.maxMessages > 100 ||
          typeof payload.model !== "string" || !/^[a-zA-Z0-9._-]+$/.test(payload.model)) {
        throw new Error("Invalid configuration: check query, maxMessages (1-100), and model.");
      }
      if (!this.caches.has(id)) this.caches.set(id, new Map());
      const shipments = await getShipments({
        query: payload.query,
        maxMessages: payload.maxMessages,
        model: payload.model
      }, this.caches.get(id));
      this.sendSocketNotification("GMAIL_TRACKING_RESULT", {
        id,
        shipments: shipments.map(({ carrier, trackingNumber, expectedDeliveryDate, status }) =>
          ({ carrier, trackingNumber, expectedDeliveryDate, status }))
      });
    } catch (error) {
      console.error(`[MMM-GmailTracking] ${error.message}`);
      this.sendSocketNotification("GMAIL_TRACKING_RESULT", { id, error: error.message });
    } finally {
      this.inFlight.delete(id);
    }
  }
});
