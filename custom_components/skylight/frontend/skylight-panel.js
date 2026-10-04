/* Skylight Family Display - full-screen panel (also usable as a Lovelace card:
 *   type: custom:skylight-panel
 * ). Plain web component, no build step. */

import { SkylightPanel } from "./src/panel.js?v=1.35.0";


if (!customElements.get("skylight-panel")) customElements.define("skylight-panel", SkylightPanel);
window.customCards = window.customCards || [];
if (!window.customCards.find((c) => c.type === "skylight-panel")) {
  window.customCards.push({ type: "skylight-panel", name: "Skylight Family Display", description: "Full Skylight-style family calendar, chores, meals, lists and photos." });
}
