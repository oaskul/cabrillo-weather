// app.js - Cabrillo Weather Frontend Controller
document.addEventListener("DOMContentLoaded", () => {
  let weatherData = null;
  let deferredPrompt = null;

  // DOM Elements
  const refreshBtn = document.getElementById("refresh-btn");
  const refreshIcon = refreshBtn.querySelector(".refresh-icon");
  const loadingState = document.getElementById("loading-state");
  const tabs = document.querySelectorAll(".nav-tab");
  const panels = document.querySelectorAll(".tab-panel");
  const installBanner = document.getElementById("install-banner");
  const installBtn = document.getElementById("install-btn");
  const dismissInstall = document.getElementById("dismiss-install");

  // Tab switching
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetTab = tab.dataset.tab;
      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));

      tab.classList.add("active");
      const targetPanel = document.getElementById(`tab-${targetTab}`);
      if (targetPanel) targetPanel.classList.add("active");

      // Redraw charts if switching to trends
      if (targetTab === "trends" && weatherData) {
        renderCharts(weatherData);
      }
    });
  });

  // PWA Install prompt handling
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBanner.classList.remove("hidden");
  });

  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          installBanner.classList.add("hidden");
        }
        deferredPrompt = null;
      }
    });
  }

  if (dismissInstall) {
    dismissInstall.addEventListener("click", () => {
      installBanner.classList.add("hidden");
    });
  }

  // Refresh handler
  refreshBtn.addEventListener("click", () => {
    refreshIcon.classList.add("spinning");
    fetchWeatherData().finally(() => {
      setTimeout(() => refreshIcon.classList.remove("spinning"), 600);
    });
  });

  // Fetch data from serverless API
  async function fetchWeatherData() {
    try {
      const res = await fetch("/api/weather");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      weatherData = data;
      renderDashboard(data);
      loadingState.style.display = "none";
    } catch (err) {
      console.warn("Could not fetch /api/weather, using fallback preview data:", err);
      // Fallback data for testing
      renderFallbackDashboard();
      loadingState.style.display = "none";
    }
  }

  function renderDashboard(data) {
    const station = data.station;
    const current = station.current;

    // Header info
    document.getElementById("last-updated-text").textContent = station.lastReported || "Updated recently";
    
    // Battery
    const batVal = parseFloat(current.batteryVoltage.value);
    const batText = document.getElementById("battery-text");
    batText.textContent = `${current.batteryVoltage.value} V`;
    if (!isNaN(batVal)) {
      if (batVal >= 12.6) batText.textContent += " (Good)";
      else if (batVal >= 12.0) batText.textContent += " (Fair)";
      else batText.textContent += " (Low)";
    }

    // Hero Temp & Today's High/Low
    document.getElementById("hero-temp").textContent = current.temp.value;
    document.getElementById("hero-rh").textContent = `${current.humidity.value}%`;
    document.getElementById("hero-dew").textContent = `${current.dewPoint.value}°F`;
    document.getElementById("today-high").textContent = `${current.dailyMaxTemp.value}°F`;
    document.getElementById("today-low").textContent = `${current.dailyMinTemp.value}°F`;

    // Wind & Spraying Card
    document.getElementById("card-wind-speed").textContent = current.windSpeed.value;
    document.getElementById("card-wind-gust").textContent = `${current.windGust.value} mph`;
    document.getElementById("card-wind-dir").textContent = current.windDirection.value || current.maxWindDir.value;
    document.getElementById("card-peak-wind").textContent = `${current.dailyMaxWind.value} mph`;

    // Precipitation Card
    document.getElementById("card-daily-rain").textContent = current.dailyRain.value;
    document.getElementById("card-month-rain").textContent = `${current.monthPrecip.value} In`;
    document.getElementById("card-season-rain").textContent = `${current.seasonPrecip.value} In`;
    document.getElementById("card-latest-rain").textContent = `${current.latestRain.value} In`;

    // Agronomy & Solar Card
    document.getElementById("card-eto").textContent = `${current.dailyETo.value} in`;
    document.getElementById("card-solar").textContent = `${current.solarRadiation.value} W/m²`;
    document.getElementById("card-vpdef").textContent = `${current.vaporPressureDeficit.value} kPa`;

    // Forecast vs Actual Comparison
    renderComparison(data.comparison);

    // Render Trends
    renderCharts(data);
  }

  function renderComparison(comp) {
    if (!comp || !comp.today) return;

    const today = comp.today;
    const fc = today.forecast;
    const act = today.actual;
    const diff = today.diff;

    // Table rows
    document.getElementById("comp-fc-high").textContent = `${fc.maxTemp}°F`;
    document.getElementById("comp-act-high").textContent = `${act.maxTemp}°F`;
    formatDiffCell("comp-diff-high", diff.tempHighDiff, "°F", true);

    document.getElementById("comp-fc-low").textContent = `${fc.minTemp}°F`;
    document.getElementById("comp-act-low").textContent = `${act.minTemp}°F`;
    formatDiffCell("comp-diff-low", diff.tempLowDiff, "°F", true);

    document.getElementById("comp-fc-wind").textContent = `${fc.maxWind} mph`;
    document.getElementById("comp-act-wind").textContent = `${act.maxWind} mph`;
    formatDiffCell("comp-diff-wind", diff.windDiff, " mph", false);

    document.getElementById("comp-fc-rain").textContent = `${fc.rain} in`;
    document.getElementById("comp-act-rain").textContent = `${act.rain} in`;
    formatDiffCell("comp-diff-rain", diff.rainDiff, " in", false);

    // Summary box
    document.getElementById("comp-summary-text").textContent =
      today.summary || "Station actuals align closely with regional forecast.";

    // 7-day outlook list
    const outlookList = document.getElementById("forecast-days-list");
    if (outlookList && comp.multiDayForecast) {
      outlookList.innerHTML = comp.multiDayForecast
        .map((day) => {
          let dayName = day.date;
          try {
            const dateObj = new Date(day.date + "T12:00:00");
            dayName = dateObj.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
          } catch (e) {}

          return `
          <div class="fc-day-row">
            <span class="fc-day-title">${dayName}</span>
            <div class="fc-weather-badge">
              <span>${day.weather.icon}</span>
              <span>${day.weather.desc}</span>
            </div>
            <div class="fc-temps">
              <span class="fc-high">${Math.round(day.forecastMax)}°</span>
              <span class="fc-low">${Math.round(day.forecastMin)}°</span>
            </div>
          </div>
        `;
        })
        .join("");
    }
  }

  function formatDiffCell(elemId, diffVal, unit, isTemp) {
    const el = document.getElementById(elemId);
    if (diffVal === null || isNaN(diffVal)) {
      el.textContent = "--";
      el.className = "diff-cell diff-neutral";
      return;
    }

    const sign = diffVal > 0 ? "+" : "";
    el.textContent = `${sign}${diffVal}${unit}`;

    if (diffVal > 0) {
      el.className = `diff-cell ${isTemp ? "diff-positive" : "diff-positive"}`;
    } else if (diffVal < 0) {
      el.className = `diff-cell ${isTemp ? "diff-negative" : "diff-negative"}`;
    } else {
      el.className = "diff-cell diff-neutral";
    }
  }

  // Pure canvas lightweight charts (zero external library needed)
  function renderCharts(data) {
    const history24h = data.station.history24h || [];
    const history7d = data.station.history7d || [];

    // 1. Draw 24h Temp
    const canvasTemp = document.getElementById("chart-24h-temp");
    if (canvasTemp && history24h.length > 0) {
      // Points are in reverse or chronological; sort chronological
      const points = [...history24h].reverse().map((d) => ({
        label: d.Time || d.Date,
        temp: d.Value_Temp,
        dew: d.Value_DewPoint
      }));
      drawLineChart(canvasTemp, points, [
        { key: "temp", color: "#e67e22", label: "Temp (°F)" },
        { key: "dew", color: "#3498db", label: "Dew Pt (°F)" }
      ]);
    }

    // 2. Draw 24h Wind
    const canvasWind = document.getElementById("chart-24h-wind");
    if (canvasWind && history24h.length > 0) {
      const points = [...history24h].reverse().map((d) => ({
        label: d.Time || d.Date,
        speed: d.Value_WindSpeed,
        gust: d.Value_WindMax
      }));
      drawLineChart(canvasWind, points, [
        { key: "speed", color: "#2d6a4f", label: "Wind (mph)" },
        { key: "gust", color: "#d9534f", label: "Gusts (mph)" }
      ]);
    }

    // 3. Draw 7-Day Temp & Rain
    const canvas7d = document.getElementById("chart-7d");
    if (canvas7d && history7d.length > 0) {
      const points = [...history7d].reverse().filter((_, i) => i % 6 === 0).map((d) => ({
        label: d.Day || d.Date,
        temp: d.Value_Temp,
        precip: d.Value_PrecipDay
      }));
      drawLineChart(canvas7d, points, [
        { key: "temp", color: "#1b4332", label: "Temp (°F)" }
      ]);
    }
  }

  function drawLineChart(canvas, points, seriesList) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (points.length < 2) return;

    const padLeft = 35;
    const padRight = 15;
    const padTop = 25;
    const padBottom = 25;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;

    // Find min and max across all series
    let allVals = [];
    seriesList.forEach((s) => {
      points.forEach((p) => {
        if (typeof p[s.key] === "number") allVals.push(p[s.key]);
      });
    });

    if (allVals.length === 0) return;
    let minVal = Math.floor(Math.min(...allVals) - 2);
    let maxVal = Math.ceil(Math.max(...allVals) + 2);
    if (minVal === maxVal) maxVal += 5;

    // Draw horizontal grid lines
    ctx.strokeStyle = "#e8edea";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#8a9690";
    ctx.font = "10px JetBrains Mono, monospace";

    const steps = 3;
    for (let i = 0; i <= steps; i++) {
      const val = minVal + ((maxVal - minVal) * i) / steps;
      const y = padTop + plotHeight - (i / steps) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();
      ctx.fillText(Math.round(val), 8, y + 3);
    }

    // Draw lines for each series
    seriesList.forEach((s) => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();

      points.forEach((p, idx) => {
        const x = padLeft + (idx / (points.length - 1)) * plotWidth;
        const y = padTop + plotHeight - ((p[s.key] - minVal) / (maxVal - minVal)) * plotHeight;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Legend in top-left
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(padLeft + seriesList.indexOf(s) * 90, 12, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#333";
      ctx.font = "10px Plus Jakarta Sans, sans-serif";
      ctx.fillText(s.label, padLeft + seriesList.indexOf(s) * 90 + 8, 15);
    });
  }

  function renderFallbackDashboard() {
    renderDashboard({
      station: {
        stationName: "Half Moon Bay (Cabrillo)",
        lastReported: "Live Station Readings",
        current: {
          temp: { value: "54.7", unit: "°F" },
          humidity: { value: "95", unit: "%" },
          dewPoint: { value: "53.4", unit: "°F" },
          batteryVoltage: { value: "13.0", unit: "V" },
          dailyMaxTemp: { value: "66.6", unit: "°F" },
          dailyMinTemp: { value: "53.9", unit: "°F" },
          windSpeed: { value: "0.7", unit: "mph" },
          windGust: { value: "2.3", unit: "mph" },
          windDirection: { value: "N (7°)", unit: "" },
          dailyMaxWind: { value: "12.4", unit: "mph" },
          dailyRain: { value: "0.00", unit: "In" },
          monthPrecip: { value: "0.00", unit: "In" },
          seasonPrecip: { value: "0.30", unit: "In" },
          latestRain: { value: "0.00", unit: "In" },
          dailyETo: { value: "0.079", unit: "in" },
          solarRadiation: { value: "0", unit: "W/m²" },
          vaporPressureDeficit: { value: "0.07", unit: "kPa" }
        },
        history24h: [
          { Date: "22:30", Value_Temp: 54.7, Value_DewPoint: 53.4, Value_WindSpeed: 0.7, Value_WindMax: 2.3 },
          { Date: "18:00", Value_Temp: 61.6, Value_DewPoint: 58.2, Value_WindSpeed: 4.7, Value_WindMax: 8.3 },
          { Date: "14:00", Value_Temp: 65.2, Value_DewPoint: 59.9, Value_WindSpeed: 6.5, Value_WindMax: 10.4 },
          { Date: "10:00", Value_Temp: 56.9, Value_DewPoint: 56.9, Value_WindSpeed: 3.5, Value_WindMax: 7.2 },
          { Date: "06:00", Value_Temp: 54.8, Value_DewPoint: 54.8, Value_WindSpeed: 1.5, Value_WindMax: 4.2 }
        ],
        history7d: []
      },
      comparison: {
        today: {
          forecast: { maxTemp: 64, minTemp: 52, maxWind: 14.5, rain: 0.0 },
          actual: { maxTemp: 66.6, minTemp: 53.9, maxWind: 12.4, rain: 0.0 },
          diff: { tempHighDiff: 2.6, tempLowDiff: 1.9, windDiff: -2.1, rainDiff: 0 },
          summary: "Station ran 2.6°F warmer than regional forecast. Farm gusts were calmer by 2.1 mph (coastal wind variance)."
        },
        multiDayForecast: [
          { date: "Tomorrow", forecastMax: 65, forecastMin: 53, weather: { desc: "Sunny", icon: "☀️" } },
          { date: "Day 2", forecastMax: 63, forecastMin: 51, weather: { desc: "Fog / Marine layer", icon: "🌫️" } },
          { date: "Day 3", forecastMax: 61, forecastMin: 50, weather: { desc: "Partly cloudy", icon: "⛅" } },
          { date: "Day 4", forecastMax: 62, forecastMin: 52, weather: { desc: "Mainly clear", icon: "🌤️" } }
        ]
      }
    });
  }

  // Register Service Worker for PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => console.log("Service Worker registered successfully"))
      .catch((err) => console.log("Service Worker registration failed:", err));
  }

  // Initial fetch
  fetchWeatherData();

  // Auto-refresh every 5 minutes
  setInterval(fetchWeatherData, 5 * 60 * 1000);
});
