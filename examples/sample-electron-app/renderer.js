const input = document.querySelector("#message-input");
const saveButton = document.querySelector("#save-button");
const detailsButton = document.querySelector("#details-button");
const status = document.querySelector("#status");
const savedMessage = document.querySelector("#saved-message");
const details = document.querySelector("#details");

saveButton.addEventListener("click", () => {
  const message = input.value.trim();
  status.textContent = "Status: saved";
  savedMessage.textContent = message;
});

detailsButton.addEventListener("click", () => {
  details.hidden = false;
});
