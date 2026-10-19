/* Lyding Strike family display - full-screen panel (also usable as a Lovelace card:
 *   type: custom:skylight-panel
 * ). Plain web component, no build step. */

import { SkylightPanel } from "./src/panel.js?v=1.57.5";


if (!customElements.get("skylight-panel")) customElements.define("skylight-panel", SkylightPanel);
window.customCards = window.customCards || [];
if (!window.customCards.find((c) => c.type === "skylight-panel")) {
  window.customCards.push({ type: "skylight-panel", name: "Lyding Strike", description: "Full-screen family calendar, chores, meals, lists and photos." });
}
