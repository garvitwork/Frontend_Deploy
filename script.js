// ============================================================
// AURUM — Gold Price Intelligence
// ============================================================

const API_BASE = "https://gold-api-u521.onrender.com"; // ← change to Render URL after deploy

let priceChart = null;

// ── Fetch model info on load ─────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const res  = await fetch(`${API_BASE}/`);
    const data = await res.json();
    const badge = document.getElementById("modelBadge");
    badge.textContent = `Model v${data.model_version} · ${data.model_alias}`;
  } catch (e) {
    document.getElementById("modelBadge").textContent = "API offline";
  }
});

// ── Main predict ─────────────────────────────────────────────
async function fetchPredictions() {
  const btn      = document.getElementById("predictBtn");
  const loader   = document.getElementById("btnLoader");
  const statusBar = document.getElementById("statusBar");
  const statusText = document.getElementById("statusText");
  const errorBox  = document.getElementById("errorBox");
  const errorText = document.getElementById("errorText");
  const results   = document.getElementById("results");

  // Reset UI
  btn.disabled = true;
  loader.classList.add("active");
  errorBox.style.display  = "none";
  results.style.display   = "none";
  statusBar.style.display = "flex";

  const steps = [
    "Fetching gold spot price…",
    "Fetching Fed funds rate…",
    "Fetching USD/INR rate…",
    "Building feature vectors…",
    "Running model inference…",
  ];

  let stepIdx = 0;
  statusText.textContent = steps[stepIdx];
  const stepInterval = setInterval(() => {
    stepIdx = (stepIdx + 1) % steps.length;
    statusText.textContent = steps[stepIdx];
  }, 1800);

  try {
    const res = await fetch(`${API_BASE}/predict`, { method: "POST" });

    clearInterval(stepInterval);

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    renderResults(data);

  } catch (e) {
    clearInterval(stepInterval);
    statusBar.style.display = "none";
    errorBox.style.display  = "flex";
    errorText.textContent   = e.message || "Could not reach the API. Is the server running?";
  } finally {
    btn.disabled = false;
    loader.classList.remove("active");
    statusBar.style.display = "none";
  }
}

// ── Render ───────────────────────────────────────────────────
function renderResults(data) {
  const predictions = data.predictions;

  // Summary strip
  const lastDay = predictions[predictions.length - 1];
  document.getElementById("latestPrice").textContent =
    `$${lastDay.gold_price_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document.getElementById("dataDate").textContent    = lastDay.date;
  document.getElementById("modelVersion").textContent = `v${data.model_version} · ${data.model_alias}`;
  document.getElementById("predictedAt").textContent  =
    new Date(data.predicted_at).toLocaleString("en-IN", { hour12: true });

  // Cards
  const grid = document.getElementById("cardsGrid");
  grid.innerHTML = "";

  predictions.forEach((p, i) => {
    const isUp      = p.prediction === "UP";
    const confFloat = p.probability * 100;

    const card = document.createElement("div");
    card.className = `card ${isUp ? "up" : "down"}`;
    card.innerHTML = `
      <div class="card-day">DAY ${p.day}</div>
      <div class="card-date">${formatDate(p.date)}</div>
      <div class="card-price">$${p.gold_price_usd.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
      <div class="card-arrow">${isUp ? "↑" : "↓"}</div>
      <div class="card-direction">${p.prediction}</div>
      <div class="card-conf-bar">
        <div class="card-conf-fill" data-width="${confFloat.toFixed(1)}"></div>
      </div>
      <div class="card-conf-text">${p.confidence} confidence</div>
    `;

    grid.appendChild(card);

    // Staggered animation
    setTimeout(() => {
      card.classList.add("visible");
      // Animate confidence bar
      const fill = card.querySelector(".card-conf-fill");
      setTimeout(() => {
        fill.style.width = fill.dataset.width + "%";
      }, 100);
    }, i * 80);
  });

  // Chart
  renderChart(predictions);

  // MLflow link
  const link = document.getElementById("mlflowLink");
  link.href = data.mlflow_url;

  // Show results
  document.getElementById("results").style.display = "block";
  document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Chart ────────────────────────────────────────────────────
function renderChart(predictions) {
  const labels = predictions.map(p => formatDate(p.date));
  const prices = predictions.map(p => p.gold_price_usd);
  const colors = predictions.map(p => p.prediction === "UP" ? "#4CAF82" : "#E05252");

  const ctx = document.getElementById("priceChart").getContext("2d");

  if (priceChart) priceChart.destroy();

  priceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Gold Price (USD)",
        data: prices,
        borderColor: "#C9A84C",
        borderWidth: 1.5,
        pointBackgroundColor: colors,
        pointBorderColor: colors,
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 160);
          gradient.addColorStop(0, "rgba(201,168,76,0.12)");
          gradient.addColorStop(1, "rgba(201,168,76,0)");
          return gradient;
        },
        tension: 0.35,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#161616",
          borderColor: "rgba(201,168,76,0.2)",
          borderWidth: 1,
          titleColor: "#7A6130",
          bodyColor: "#F0EAD6",
          titleFont: { family: "'JetBrains Mono', monospace", size: 10 },
          bodyFont:  { family: "'JetBrains Mono', monospace", size: 12 },
          padding: 12,
          callbacks: {
            label: (ctx) => ` $${ctx.parsed.y.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: {
            color: "#3A3530",
            font: { family: "'JetBrains Mono', monospace", size: 9 },
          },
          border: { color: "rgba(255,255,255,0.06)" },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: {
            color: "#3A3530",
            font: { family: "'JetBrains Mono', monospace", size: 9 },
            callback: (v) => `$${v.toLocaleString()}`,
          },
          border: { color: "rgba(255,255,255,0.06)" },
        },
      },
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
