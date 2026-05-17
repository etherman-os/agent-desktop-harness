import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

const demoBugMode = parseDemoBugMode(window.location.search);
const isRepairDemoMode = demoBugMode === "overlap" || demoBugMode === "fixed";
const demoCardClasses = [
  "demo-card",
  isRepairDemoMode ? "repair-demo" : undefined,
  demoBugMode === "overlap" ? "repair-demo-overlap" : undefined,
  demoBugMode === "fixed" ? "repair-demo-fixed" : undefined
]
  .filter(Boolean)
  .join(" ");

app.innerHTML = `
  <section class="demo-shell" aria-label="Agent Desktop Harness Demo">
    <div class="${demoCardClasses}">
      <div class="badge" data-testid="status">Status: idle</div>
      <h1>Agent Desktop Harness Demo</h1>
      <p class="summary">
        A stable local GUI target for isolated desktop smoke verification.
      </p>
      <label class="field-label" for="message-input">Message</label>
      <input
        id="message-input"
        class="message-input"
        type="text"
        placeholder="Type a message"
        autocomplete="off"
        autofocus
      />
      <div class="actions">
        <button id="save-button" class="primary-button" type="button">
          Save message
        </button>
        <button id="details-button" class="secondary-button" type="button">
          Open details
        </button>
      </div>
      <p id="saved-message" class="saved-message" aria-live="polite">
        No message saved yet.
      </p>
      <div id="details-panel" class="details-panel" hidden>
        Details panel is open
      </div>
      ${
        isRepairDemoMode
          ? `<div class="overlap-badge" data-testid="overlap-badge">Overlapping badge</div>`
          : ""
      }
    </div>
  </section>
`;

const statusBadge = document.querySelector<HTMLDivElement>("[data-testid='status']");
const input = document.querySelector<HTMLInputElement>("#message-input");
const saveButton = document.querySelector<HTMLButtonElement>("#save-button");
const detailsButton = document.querySelector<HTMLButtonElement>("#details-button");
const savedMessage = document.querySelector<HTMLParagraphElement>("#saved-message");
const detailsPanel = document.querySelector<HTMLDivElement>("#details-panel");

if (!statusBadge || !input || !saveButton || !detailsButton || !savedMessage || !detailsPanel) {
  throw new Error("Demo UI controls were not initialized.");
}

if (isRepairDemoMode) {
  input.value = "annotation repair demo message";
  statusBadge.textContent = "Status: saved";
  savedMessage.textContent = "annotation repair demo message";
  detailsPanel.hidden = false;
}

saveButton.addEventListener("click", () => {
  const message = input.value.trim();
  statusBadge.textContent = "Status: saved";
  savedMessage.textContent = message.length > 0 ? message : "Saved an empty message.";
});

detailsButton.addEventListener("click", () => {
  detailsPanel.hidden = false;
});

function parseDemoBugMode(search: string): "overlap" | "fixed" | undefined {
  const value = new URLSearchParams(search).get("demoBug");
  if (value === "overlap" || value === "fixed") {
    return value;
  }
  return undefined;
}
