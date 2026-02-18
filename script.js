// ============================================================
// AURUM — Gold Price Intelligence
// ============================================================

const API_BASE = "https://gold-api-u521.onrender.com"; // ← change to Render URL after deploy

let priceChart    = null;
let USD_INR_RATE  = 86.5; // fallback rate
let _lastData     = null;  // cached for currency re-render

// ── Fetch USD/INR rate ────────────────────────────────────────
async function fetchUsdInrRate() {
  try {
    const res  = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR");
    const data = await res.json();
    if (data.rates && data.rates.INR) USD_INR_RATE = data.rates.INR;
  } catch (e) {
    console.warn("USD/INR fetch failed, using fallback:", USD_INR_RATE);
  }
}

let currentCurrency = "INR"; // tracks active currency toggle

function toINR(usdPerOz) {
  const pricePerGram   = usdPerOz / 31.1035;
  const pricePer10gUSD = pricePerGram * 10;
  const baseINR        = pricePer10gUSD * USD_INR_RATE;
  const withGST        = baseINR * 1.03;
  return "₹" + withGST.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// USD = per troy oz (standard international unit)
function toUSD(usdPerOz) {
  return "$" + usdPerOz.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPrice(usdPerOz) {
  return currentCurrency === "INR" ? toINR(usdPerOz) : toUSD(usdPerOz);
}

// ── Fetch model info on load ─────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  await fetchUsdInrRate();
  try {
    const res  = await fetch(`${API_BASE}/`);
    const data = await res.json();
    document.getElementById("modelBadge").textContent =
      `Model v${data.model_version} · ${data.model_alias}`;
  } catch (e) {
    document.getElementById("modelBadge").textContent = "API offline";
  }
});

// ── Main predict ─────────────────────────────────────────────
async function fetchPredictions() {
  const btn        = document.getElementById("predictBtn");
  const loader     = document.getElementById("btnLoader");
  const statusBar  = document.getElementById("statusBar");
  const statusText = document.getElementById("statusText");
  const errorBox   = document.getElementById("errorBox");
  const errorText  = document.getElementById("errorText");
  const results    = document.getElementById("results");

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
    await renderResults(data);

  } catch (e) {
    clearInterval(stepInterval);
    errorBox.style.display  = "flex";
    errorText.textContent   = e.message || "Could not reach the API. Is the server running?";
  } finally {
    btn.disabled = false;
    loader.classList.remove("active");
    statusBar.style.display = "none";
  }
}

// ── Render ───────────────────────────────────────────────────
async function renderResults(data) {
  // Refresh INR rate before rendering
  await fetchUsdInrRate();
  _lastData = data; // cache for currency toggle re-render

  const predictions = data.predictions;
  const lastDay     = predictions[predictions.length - 1];

  // Summary note changes by currency
  const isINR = currentCurrency === "INR";
  document.querySelector(".summary-note").textContent =
    isINR ? "Intl. spot · 24k · 10g · incl. GST" : "Intl. spot · 24k · per troy oz";

  // Summary strip
  document.getElementById("latestPrice").textContent   = formatPrice(lastDay.gold_price_usd);
  document.getElementById("dataDate").textContent       = lastDay.date;
  document.getElementById("modelVersion").textContent   = `v${data.model_version} · ${data.model_alias}`;
  // Ensure timestamp is parsed as UTC (append Z if missing)
  const rawTs = data.predicted_at;
  const utcTs = rawTs.endsWith("Z") || rawTs.includes("+") ? rawTs : rawTs + "Z";
  document.getElementById("predictedAt").textContent =
    new Date(utcTs).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: true,
      day:    "2-digit",
      month:  "2-digit",
      year:   "numeric",
      hour:   "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) + " IST";

  // Cards — price in INR
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
      <div class="card-price">${formatPrice(p.gold_price_usd)}</div>
      <div class="card-arrow">${isUp ? "↑" : "↓"}</div>
      <div class="card-direction">${p.prediction}</div>
      <div class="card-conf-bar">
        <div class="card-conf-fill" data-width="${confFloat.toFixed(1)}"></div>
      </div>
      <div class="card-conf-text">${p.confidence} confidence</div>
    `;

    grid.appendChild(card);

    setTimeout(() => {
      card.classList.add("visible");
      const fill = card.querySelector(".card-conf-fill");
      setTimeout(() => { fill.style.width = fill.dataset.width + "%"; }, 100);
    }, i * 80);
  });

  // Chart — prices in INR
  renderChart(predictions);

  // MLflow link
  document.getElementById("mlflowLink").href = data.mlflow_url;

  // Show results
  document.getElementById("results").style.display = "block";
  document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Chart ─────────────────────────────────────────────────────
function renderChart(predictions) {
  const isINR  = currentCurrency === "INR";
  const labels = predictions.map(p => formatDate(p.date));
  const prices = predictions.map(p =>
    isINR
      ? (p.gold_price_usd / 31.1035) * 10 * USD_INR_RATE * 1.03  // INR per 10g + GST
      : p.gold_price_usd                                            // USD per troy oz
  );
  const colors = predictions.map(p => p.prediction === "UP" ? "#4CAF82" : "#E05252");

  const ctx = document.getElementById("priceChart").getContext("2d");
  if (priceChart) priceChart.destroy();

  priceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: isINR ? "Gold Price (INR/10g)" : "Gold Price (USD/oz)",
        data: prices,
        borderColor: "#C9A84C",
        borderWidth: 1.5,
        pointBackgroundColor: colors,
        pointBorderColor: colors,
        pointRadius: 6,
        pointHoverRadius: 9,
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 200);
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
          titleColor: "#A07830",
          bodyColor: "#F0EAD6",
          titleFont: { family: "'JetBrains Mono', monospace", size: 12 },
          bodyFont:  { family: "'JetBrains Mono', monospace", size: 14 },
          padding: 16,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y;
              return isINR
                ? ` ₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : ` $${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/oz`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: { color: "#9A9080", font: { family: "'JetBrains Mono', monospace", size: 13 } },
          border: { color: "rgba(255,255,255,0.06)" },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: {
            color: "#9A9080",
            font: { family: "'JetBrains Mono', monospace", size: 13 },
            callback: (v) => isINR ? `₹${(v/1000).toFixed(0)}k` : `$${v.toFixed(0)}`,
          },
          border: { color: "rgba(255,255,255,0.06)" },
        },
      },
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// ── Currency Toggle ───────────────────────────────────────────
function setCurrency(currency) {
  if (currentCurrency === currency) return;
  currentCurrency = currency;

  // Update button active states
  document.getElementById("btnINR").classList.toggle("active", currency === "INR");
  document.getElementById("btnUSD").classList.toggle("active", currency === "USD");

  // Re-render if we have data
  if (_lastData) renderResults(_lastData);
}

// ── Wake Server ───────────────────────────────────────────────
async function wakeServer() {
  const wakeBtn    = document.getElementById("wakeBtn");
  const wakeStatus = document.getElementById("wakeStatus");

  wakeBtn.disabled = true;
  wakeStatus.className = "wake-status checking";
  wakeStatus.textContent = "⏳ Waking server…";

  const MAX_ATTEMPTS = 10;
  const INTERVAL_MS  = 3000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    wakeStatus.textContent = `⏳ Attempt ${attempt}/${MAX_ATTEMPTS}…`;
    try {
      const res = await fetch(`${API_BASE}/`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        wakeStatus.className = "wake-status awake";
        wakeStatus.textContent = "✓ Server is awake! Ready to predict.";
        wakeBtn.disabled = false;
        wakeBtn.textContent = "WAKE AGAIN";
        return;
      }
    } catch (e) {
      // Still waking up — keep trying
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, INTERVAL_MS));
    }
  }

  // Failed after all attempts
  wakeStatus.className = "wake-status failed";
  wakeStatus.textContent = "✗ Server unreachable. Try again.";
  wakeBtn.disabled = false;
}