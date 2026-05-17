export function renderAnnotationUi(sessionId: string, initialScreenshot?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Desktop Harness Annotation</title>
  <style>
    :root {
      color-scheme: light;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #14202b;
      background: #eef3f6;
    }
    body {
      margin: 0;
      padding: 24px;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 16px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
    }
    .toolbar,
    .panel {
      background: #ffffff;
      border: 1px solid #cfd8df;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 12px 28px rgb(20 32 43 / 10%);
    }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto;
      gap: 12px;
      align-items: end;
      margin-bottom: 16px;
    }
    label {
      display: grid;
      gap: 6px;
      font-weight: 700;
    }
    select,
    textarea,
    input {
      font: inherit;
      border: 1px solid #9fb0bd;
      border-radius: 6px;
      padding: 10px 12px;
    }
    textarea {
      min-height: 96px;
      resize: vertical;
    }
    button {
      border: 0;
      border-radius: 6px;
      padding: 12px 18px;
      font: inherit;
      font-weight: 800;
      color: #ffffff;
      background: #167386;
      cursor: pointer;
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 16px;
    }
    .canvas-wrap {
      overflow: auto;
      max-height: 72vh;
      background: #111820;
      border-radius: 8px;
      padding: 12px;
    }
    canvas {
      display: block;
      max-width: 100%;
      height: auto;
      background: #ffffff;
      cursor: crosshair;
    }
    .stack {
      display: grid;
      gap: 12px;
    }
    pre {
      white-space: pre-wrap;
      overflow: auto;
      max-height: 220px;
      padding: 12px;
      background: #f5f8fa;
      border: 1px solid #d8e1e7;
      border-radius: 6px;
      font-size: 13px;
    }
    .status {
      min-height: 22px;
      font-weight: 700;
    }
    @media (max-width: 900px) {
      body {
        padding: 12px;
      }
      .toolbar,
      .layout {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Visual Annotation Handoff</h1>
      <div>Session <code>${escapeHtml(sessionId)}</code></div>
    </header>
    <section class="toolbar">
      <label>
        Screenshot
        <select id="screenshotSelect"></select>
      </label>
      <button id="reloadButton" type="button">Reload screenshots</button>
    </section>
    <section class="layout">
      <div class="canvas-wrap">
        <canvas id="canvas"></canvas>
      </div>
      <aside class="panel stack">
        <label>
          Note
          <textarea id="note" placeholder="Describe the exact issue in this marked area."></textarea>
        </label>
        <label>
          Color
          <input id="color" type="color" value="#ff0000">
        </label>
        <button id="saveButton" type="button" disabled>Save annotation</button>
        <div id="status" class="status"></div>
        <label>
          Visual handoff
          <pre id="handoff"></pre>
        </label>
      </aside>
    </section>
  </main>
  <script>
    const sessionId = ${JSON.stringify(sessionId)};
    const initialScreenshot = ${JSON.stringify(initialScreenshot ?? "")};
    const select = document.getElementById("screenshotSelect");
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const note = document.getElementById("note");
    const color = document.getElementById("color");
    const saveButton = document.getElementById("saveButton");
    const statusEl = document.getElementById("status");
    const handoff = document.getElementById("handoff");
    const image = new Image();
    let screenshots = [];
    let currentFileName = "";
    let start = null;
    let rectangle = null;

    async function requestJson(url, options) {
      const response = await fetch(url, options);
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(data.error?.message || "Request failed");
      }
      return data;
    }

    function setStatus(message) {
      statusEl.textContent = message;
    }

    async function loadScreenshots() {
      const data = await requestJson("./screenshots");
      screenshots = data.screenshots || [];
      select.replaceChildren();
      for (const screenshot of screenshots) {
        const option = document.createElement("option");
        option.value = screenshot.fileName;
        option.textContent = screenshot.label
          ? screenshot.fileName + " (" + screenshot.label + ")"
          : screenshot.fileName;
        select.appendChild(option);
      }
      const preferred = screenshots.find((item) => item.fileName === initialScreenshot);
      if (preferred) {
        select.value = preferred.fileName;
      }
      if (select.value) {
        await loadScreenshot(select.value);
      }
    }

    async function loadScreenshot(fileName) {
      currentFileName = fileName;
      rectangle = null;
      saveButton.disabled = true;
      image.src = "./screenshots/" + encodeURIComponent(fileName) + "?cache=" + Date.now();
      await image.decode();
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      draw();
      await refreshHandoff();
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      if (!rectangle) {
        return;
      }
      ctx.save();
      ctx.strokeStyle = color.value;
      ctx.lineWidth = 4;
      ctx.fillStyle = color.value + "22";
      ctx.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
      ctx.strokeRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
      ctx.restore();
    }

    function eventPoint(event) {
      const bounds = canvas.getBoundingClientRect();
      return {
        x: Math.round((event.clientX - bounds.left) * (canvas.width / bounds.width)),
        y: Math.round((event.clientY - bounds.top) * (canvas.height / bounds.height))
      };
    }

    canvas.addEventListener("pointerdown", (event) => {
      start = eventPoint(event);
      rectangle = { x: start.x, y: start.y, width: 0, height: 0 };
      canvas.setPointerCapture(event.pointerId);
      draw();
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!start) {
        return;
      }
      const point = eventPoint(event);
      rectangle = {
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y)
      };
      saveButton.disabled = rectangle.width < 1 || rectangle.height < 1;
      draw();
    });

    canvas.addEventListener("pointerup", (event) => {
      if (start) {
        canvas.releasePointerCapture(event.pointerId);
      }
      start = null;
      saveButton.disabled = !rectangle || rectangle.width < 1 || rectangle.height < 1;
      draw();
    });

    color.addEventListener("input", draw);
    select.addEventListener("change", () => loadScreenshot(select.value).catch(showError));
    document.getElementById("reloadButton").addEventListener("click", () => loadScreenshots().catch(showError));

    saveButton.addEventListener("click", async () => {
      try {
        if (!rectangle) {
          throw new Error("Draw a rectangle first.");
        }
        if (!note.value.trim()) {
          throw new Error("Write a note before saving.");
        }
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = rectangle.width;
        cropCanvas.height = rectangle.height;
        cropCanvas
          .getContext("2d")
          .drawImage(
            image,
            rectangle.x,
            rectangle.y,
            rectangle.width,
            rectangle.height,
            0,
            0,
            rectangle.width,
            rectangle.height
          );
        const payload = {
          screenshotFileName: currentFileName,
          type: "rectangle",
          x: rectangle.x,
          y: rectangle.y,
          width: rectangle.width,
          height: rectangle.height,
          note: note.value,
          color: color.value,
          cropPngBase64: cropCanvas.toDataURL("image/png")
        };
        const result = await requestJson("./annotations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        setStatus("Saved " + result.annotation.id);
        await refreshHandoff();
      } catch (error) {
        showError(error);
      }
    });

    async function refreshHandoff() {
      const data = await requestJson("./visual-handoff");
      handoff.textContent = data.text || "";
    }

    function showError(error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }

    loadScreenshots().catch(showError);
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
