/* global Module */

Module.register("MMM-GmailTracking", {
  defaults: {
    updateInterval: 30 * 60 * 1000,
    query: 'newer_than:60d {shipped "out for delivery" "tracking number" "delivery update" UPS FedEx USPS DHL}',
    maxMessages: 15,
    maxShipments: 10,
    model: "gemini-3.5-flash-lite"
  },

  start() {
    this.shipments = [];
    this.error = "";
    this.loaded = false;
    if (!Number.isFinite(this.config.updateInterval) || this.config.updateInterval < 60000 ||
        !Number.isInteger(this.config.maxShipments) || this.config.maxShipments < 1) {
      this.loaded = true;
      this.error = "Invalid configuration: updateInterval must be at least 60000 ms and maxShipments must be a positive integer.";
      return;
    }
    this.requestUpdate();
  },

  getStyles() {
    return ["MMM-GmailTracking.css"];
  },

  requestUpdate() {
    this.sendSocketNotification("GMAIL_TRACKING_FETCH", {
      id: this.identifier,
      query: this.config.query,
      maxMessages: this.config.maxMessages,
      model: this.config.model
    });
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "GMAIL_TRACKING_RESULT" || !payload || payload.id !== this.identifier) return;
    this.loaded = true;
    this.error = payload.error || "";
    if (!this.error) this.shipments = payload.shipments;
    this.updateDom();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.requestUpdate(), this.config.updateInterval);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "gmail-tracking";
    if (!this.loaded) {
      wrapper.textContent = "Loading shipment updates...";
      return wrapper;
    }
    if (this.error) {
      const error = document.createElement("div");
      error.className = "gmail-tracking-error";
      error.textContent = `Shipment update failed: ${this.error}${this.shipments.length ? " (showing previous results)" : ""}`;
      wrapper.appendChild(error);
    }
    if (!this.shipments.length && !this.error) {
      wrapper.textContent = "No shipment updates found.";
      return wrapper;
    }
    for (const shipment of this.shipments.slice(0, this.config.maxShipments)) {
      const row = document.createElement("div");
      row.className = "gmail-tracking-shipment";
      const title = document.createElement("div");
      title.className = "bright";
      title.textContent = shipment.carrier;
      const tracking = document.createElement("div");
      tracking.textContent = shipment.trackingNumber || "Tracking number unavailable";
      const delivery = document.createElement("div");
      delivery.textContent = `Expected: ${shipment.expectedDeliveryDate || "Unknown"} | Status: ${shipment.status}`;
      row.append(title, tracking, delivery);
      wrapper.appendChild(row);
    }
    return wrapper;
  }
});
