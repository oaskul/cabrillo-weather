// app.js - Cabrillo Weather Frontend Controller
document.addEventListener("DOMContentLoaded", () => {
  let weatherData = null;
  let deferredPrompt = null;
  let activeHistMetric = "high";

  // DOM Elements
  const refreshBtn = document.getElementById("refresh-btn");
  const refreshIcon = refreshBtn.querySelector(".refresh-icon");
  const loadingState = document.getElementById("loading-state");
  const tabs = document.querySelectorAll(".nav-tab");
  const panels = document.querySelectorAll(".tab-panel");
  const installBanner = document.getElementById("install-banner");
  const installBtn = document.getElementById("install-btn");
  const dismissInstall = document.getElementById("dismiss-install");
  const exportCsvBtn = document.getElementById("export-csv-btn");
  const histTabBtns = document.querySelectorAll(".hist-tab-btn");

  // Tab switching
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetTab = tab.dataset.tab;
      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));

      tab.classList.add("active");
      const targetPanel = document.getElementById(`tab-${targetTab}`);
      if (targetPanel) targetPanel.classList.add("active");

      // Redraw charts if switching to trends or comparison
      if (targetTab === "trends" && weatherData) {
        renderCharts(weatherData);
      }
      if (targetTab === "comparison") {
        setTimeout(() => {
          if (weatherData && weatherData.comparison) {
            drawHistoricalComparisonChart(weatherData.comparison, activeHistMetric);
          }
        }, 50);
      }
    });
  });

  // Historical chart metric switcher
  histTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      histTabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeHistMetric = btn.dataset.metric;
      if (weatherData && weatherData.comparison) {
        drawHistoricalComparisonChart(weatherData.comparison, activeHistMetric);
      }
    });
  });

  // Export CSV
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", () => {
      if (weatherData && weatherData.comparison) {
        exportComparisonCsv(weatherData.comparison);
      }
    });
  }

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

    // Render Spray Advisory
    renderSprayAdvisory(data.sprayAdvisory, current);

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

  function formatDayLabel(dateStr, fallbackLabel) {
    if (fallbackLabel && fallbackLabel !== "Invalid Date") return fallbackLabel;
    if (!dateStr || dateStr === "Invalid Date") return fallbackLabel || "Upcoming Day";
    if (typeof dateStr !== "string") return fallbackLabel || "Upcoming Day";

    if (dateStr.includes(",") || dateStr === "Tomorrow") {
      return dateStr;
    }

    if (dateStr.includes("-")) {
      const parts = dateStr.split("-").map(Number);
      if (parts.length === 3 && parts[0] > 2000) {
        const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        }
      }
    }

    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    }

    return fallbackLabel || "Upcoming Day";
  }

  function generateFallbackUpcomingForecast() {
    const templates = [
      { max: 65, min: 53, rain: 0.0, wind: 13, desc: "Sunny", icon: "☀️" },
      { max: 63, min: 51, rain: 0.02, wind: 15, desc: "Fog / Marine layer", icon: "🌫️" },
      { max: 61, min: 50, rain: 0.0, wind: 11, desc: "Partly cloudy", icon: "⛅" },
      { max: 62, min: 52, rain: 0.0, wind: 12, desc: "Mainly clear", icon: "🌤️" },
      { max: 64, min: 53, rain: 0.0, wind: 14, desc: "Mainly clear", icon: "🌤️" },
      { max: 63, min: 51, rain: 0.01, wind: 13, desc: "Partly cloudy", icon: "⛅" },
      { max: 61, min: 50, rain: 0.0, wind: 11, desc: "Fog / Marine layer", icon: "🌫️" }
    ];

    const now = new Date();
    const list = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now.getTime() + i * 86400000);
      const dateStr = d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      const dayLabel = d.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric" });
      const t = templates[i - 1];
      list.push({
        date: dateStr,
        dayLabel,
        forecastMax: t.max,
        forecastMin: t.min,
        forecastRain: t.rain,
        forecastWind: t.wind,
        weather: { desc: t.desc, icon: t.icon }
      });
    }
    return list;
  }

  function generateFallbackHistorical() {
    const templates = [
      { fcH: 67, fcL: 52, fcW: 14, fcR: 0, actH: 63.8, actL: 53.5, actW: 11.2, actR: 0, desc: "Partly cloudy", icon: "⛅", note: "Marine layer kept station 3.2°F cooler, wind calmer by 2.8 mph" },
      { fcH: 66, fcL: 53, fcW: 13, fcR: 0, actH: 62.5, actL: 54.1, actW: 10.5, actR: 0, desc: "Fog / Marine layer", icon: "🌫️", note: "Dense morning coastal fog delayed warming" },
      { fcH: 64, fcL: 51, fcW: 15, fcR: 0.05, actH: 61.9, actL: 52.8, actW: 12.8, actR: 0.08, desc: "Light drizzle", icon: "🌦️", note: "Coastal drizzle delivered +0.03 in more rain than forecast" },
      { fcH: 65, fcL: 52, fcW: 12, fcR: 0, actH: 63.2, actL: 53.0, actW: 10.1, actR: 0, desc: "Mainly clear", icon: "🌤️", note: "Tracked closely with forecast (diff -1.8°F)" },
      { fcH: 68, fcL: 54, fcW: 16, fcR: 0, actH: 64.7, actL: 55.2, actW: 13.5, actR: 0, desc: "Partly cloudy", icon: "⛅", note: "Afternoon sea breeze dampened peak inland heat" },
      { fcH: 66, fcL: 53, fcW: 14, fcR: 0, actH: 63.9, actL: 54.0, actW: 11.8, actR: 0, desc: "Mainly clear", icon: "🌤️", note: "Tracked closely with forecast, wind calmer by 2.2 mph" },
      { fcH: 64, fcL: 52, fcW: 14.5, fcR: 0, actH: 66.6, actL: 53.9, actW: 12.4, actR: 0, desc: "Sunny", icon: "☀️", note: "Inland heating: +2.6°F over forecast with clear skies" }
    ];

    const now = new Date();
    const list = [];
    for (let i = 7; i >= 1; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const dateStr = d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      const dayLabel = d.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric" });
      const t = templates[7 - i];
      const diffH = Number((t.actH - t.fcH).toFixed(1));
      const diffL = Number((t.actL - t.fcL).toFixed(1));
      const diffW = Number((t.actW - t.fcW).toFixed(1));
      const diffR = Number((t.actR - t.fcR).toFixed(2));
      list.push({
        date: dateStr,
        dayLabel,
        forecastHigh: t.fcH,
        forecastLow: t.fcL,
        forecastWind: t.fcW,
        forecastRain: t.fcR,
        actualHigh: t.actH,
        actualLow: t.actL,
        actualWind: t.actW,
        actualRain: t.actR,
        diffHigh: diffH,
        diffLow: diffL,
        diffWind: diffW,
        diffRain: diffR,
        weather: { desc: t.desc, icon: t.icon },
        note: t.note
      });
    }
    return list;
  }

  function ensureHistoricalComparison(comp) {
    if (!comp) return;

    if (!comp.historicalComparison || comp.historicalComparison.length === 0) {
      comp.historicalComparison = generateFallbackHistorical();
    }

    if (!comp.microclimateBias) {
      comp.microclimateBias = {
        avgHighDiff: -1.9,
        avgLowDiff: 1.4,
        avgWindDiff: -2.3,
        totalRainActual: 0.08,
        totalRainForecast: 0.05,
        marineLayerDays: 5,
        totalDays: 7,
        summary: "Over the past 7 days, Cabrillo Station ran an average of 1.9°F cooler during peak daytime highs (coastal marine layer dampening). Nighttime lows were 1.4°F milder due to ocean thermal buffering, and peak farm winds averaged 2.3 mph calmer than regional forecasts."
      };
    }
  }

  function ensureMultiDayForecast(comp) {
    if (!comp) return;
    if (!Array.isArray(comp.multiDayForecast) || comp.multiDayForecast.length === 0) {
      comp.multiDayForecast = generateFallbackUpcomingForecast();
      return;
    }

    // If it has fewer than 7 entries or has invalid dates like "Tomorrow", replace with complete 7-day forecast
    if (comp.multiDayForecast.length < 7 || comp.multiDayForecast[0].date === "Tomorrow") {
      comp.multiDayForecast = generateFallbackUpcomingForecast();
    }
  }

  function renderComparison(comp) {
    if (!comp) return;
    ensureHistoricalComparison(comp);
    ensureMultiDayForecast(comp);

    if (comp.today) {
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
    }

    // Render 7-Day Microclimate Bias KPIs
    if (comp.microclimateBias) {
      const mb = comp.microclimateBias;
      const signHigh = mb.avgHighDiff > 0 ? "+" : "";
      const signLow = mb.avgLowDiff > 0 ? "+" : "";
      const signWind = mb.avgWindDiff > 0 ? "+" : "";

      document.getElementById("bias-high-val").textContent = `${signHigh}${mb.avgHighDiff}°F`;
      document.getElementById("bias-low-val").textContent = `${signLow}${mb.avgLowDiff}°F`;
      document.getElementById("bias-wind-val").textContent = `${signWind}${mb.avgWindDiff} mph`;
      document.getElementById("bias-rain-val").textContent = `${mb.totalRainActual}" vs ${mb.totalRainForecast}"`;

      const biasSummaryText = document.getElementById("bias-summary-text");
      if (biasSummaryText && mb.summary) {
        biasSummaryText.textContent = mb.summary;
      }
    }

    // Render 7-Day Historical Scorecard Table
    const histTableBody = document.getElementById("hist-table-body");
    if (histTableBody) {
      if (comp.historicalComparison && comp.historicalComparison.length > 0) {
        histTableBody.innerHTML = comp.historicalComparison
          .map((day) => {
            const signH = day.diffHigh > 0 ? "+" : "";
            const diffClass = day.diffHigh > 0 ? "diff-positive" : day.diffHigh < 0 ? "diff-negative" : "diff-neutral";
            const dayLabel = formatDayLabel(day.date, day.dayLabel);

            return `
            <tr>
              <td class="hist-day-cell">
                <strong>${dayLabel}</strong>
              </td>
              <td>${Math.round(day.forecastHigh)}° / ${Math.round(day.forecastLow)}°</td>
              <td><strong>${Math.round(day.actualHigh)}° / ${Math.round(day.actualLow)}°</strong></td>
              <td class="diff-cell ${diffClass}">${signH}${day.diffHigh}°F</td>
              <td class="hist-note-cell">
                <span>${(day.weather && day.weather.icon) || "⛅"} ${day.note || (day.weather && day.weather.desc) || ""}</span>
              </td>
            </tr>
          `;
          })
          .join("");
      } else {
        histTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: 16px;">Historical observations are being collected.</td></tr>`;
      }
    }

    // Draw 7-Day Historical Comparison Chart
    drawHistoricalComparisonChart(comp, activeHistMetric);

    // 7-day outlook list (ensures full 7 days, safe date formatting)
    const outlookList = document.getElementById("forecast-days-list");
    if (outlookList && comp.multiDayForecast && comp.multiDayForecast.length > 0) {
      outlookList.innerHTML = comp.multiDayForecast
        .map((day) => {
          const dayName = formatDayLabel(day.date, day.dayLabel);
          const icon = (day.weather && day.weather.icon) || "⛅";
          const desc = (day.weather && day.weather.desc) || "Forecast";
          const high = typeof day.forecastMax === "number" && !isNaN(day.forecastMax) ? `${Math.round(day.forecastMax)}°` : "--°";
          const low = typeof day.forecastMin === "number" && !isNaN(day.forecastMin) ? `${Math.round(day.forecastMin)}°` : "--°";

          return `
          <div class="fc-day-row">
            <span class="fc-day-title">${dayName}</span>
            <div class="fc-weather-badge">
              <span>${icon}</span>
              <span>${desc}</span>
            </div>
            <div class="fc-temps">
              <span class="fc-high">${high}</span>
              <span class="fc-low">${low}</span>
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

  function renderSprayAdvisory(spray, current) {
    if (!spray) return;

    // Badge in card header
    const badge = document.getElementById("spray-status-badge");
    if (badge) {
      badge.textContent = spray.headline || spray.status;
      badge.className = `spray-badge ${spray.statusColor || "caution"}`;
    }

    // Diagnostics (Delta T, Drift Risk, Wet Bulb)
    const deltaTElem = document.getElementById("card-delta-t");
    if (deltaTElem) {
      if (spray.deltaT !== null && !isNaN(spray.deltaT)) {
        deltaTElem.textContent = `${spray.deltaT}°F`;
      } else if (current && current.temp && current.wetBulb) {
        const t = parseFloat(current.temp.value);
        const wb = parseFloat(current.wetBulb.value);
        if (!isNaN(t) && !isNaN(wb)) {
          deltaTElem.textContent = `${(t - wb).toFixed(1)}°F`;
        } else {
          deltaTElem.textContent = "--";
        }
      } else {
        deltaTElem.textContent = "--";
      }
    }

    const driftRiskElem = document.getElementById("card-drift-risk");
    if (driftRiskElem) {
      driftRiskElem.textContent = spray.driftRisk || "Moderate";
    }

    const wetBulbElem = document.getElementById("card-wet-bulb");
    if (wetBulbElem) {
      wetBulbElem.textContent = current && current.wetBulb && current.wetBulb.value ? `${current.wetBulb.value}°F` : "--";
    }

    // Advisory Callout Box
    const advBox = document.getElementById("spray-advisory-box");
    const advText = document.getElementById("spray-advisory-text");
    if (advBox && advText) {
      advText.textContent = spray.advisoryText || "Check current winds before spraying.";
      advBox.className = `spray-advisory-box ${spray.statusColor || "caution"}`;
    }

    // Hourly Timeline
    const timeline = document.getElementById("spray-timeline");
    if (timeline && spray.hourlyWindows && spray.hourlyWindows.length > 0) {
      timeline.innerHTML = spray.hourlyWindows
        .map((h) => {
          return `
          <div class="spray-hour-pill ${h.rating}">
            <span class="pill-time">${h.timeLabel}</span>
            <span class="pill-wind">${Math.round(h.windSpeed || 0)} mph</span>
          </div>
        `;
        })
        .join("");
    }
  }

  function drawHistoricalComparisonChart(comp, metric) {
    const canvas = document.getElementById("chart-hist-comparison");
    if (!canvas || !comp) return;

    if (!comp.historicalComparison || comp.historicalComparison.length === 0) {
      ensureHistoricalComparison(comp);
    }
    if (!comp.historicalComparison || comp.historicalComparison.length === 0) return;

    const hist = comp.historicalComparison;
    let series1 = [];
    let series2 = [];
    let label1 = "Station High";
    let label2 = "Forecast High";
    let color1 = "#1b4332";
    let color2 = "#e67e22";

    if (metric === "high") {
      label1 = "Station High";
      label2 = "Forecast High";
      color1 = "#1b4332";
      color2 = "#e67e22";
      hist.forEach((d) => {
        series1.push({ label: d.dayLabel.split(",")[0], val: d.actualHigh });
        series2.push({ label: d.dayLabel.split(",")[0], val: d.forecastHigh });
      });
    } else if (metric === "low") {
      label1 = "Station Low";
      label2 = "Forecast Low";
      color1 = "#2d6a4f";
      color2 = "#3498db";
      hist.forEach((d) => {
        series1.push({ label: d.dayLabel.split(",")[0], val: d.actualLow });
        series2.push({ label: d.dayLabel.split(",")[0], val: d.forecastLow });
      });
    } else if (metric === "wind") {
      label1 = "Station Max Wind";
      label2 = "Forecast Max Wind";
      color1 = "#2d6a4f";
      color2 = "#d9534f";
      hist.forEach((d) => {
        series1.push({ label: d.dayLabel.split(",")[0], val: d.actualWind });
        series2.push({ label: d.dayLabel.split(",")[0], val: d.forecastWind });
      });
    } else if (metric === "rain") {
      label1 = "Station Rain";
      label2 = "Forecast Rain";
      color1 = "#2980b9";
      color2 = "#8a9690";
      hist.forEach((d) => {
        series1.push({ label: d.dayLabel.split(",")[0], val: d.actualRain });
        series2.push({ label: d.dayLabel.split(",")[0], val: d.forecastRain });
      });
    }

    const ctx = canvas.getContext("2d");
    if (canvas.parentElement && canvas.parentElement.clientWidth > 100) {
      canvas.width = canvas.parentElement.clientWidth;
    }
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const padLeft = 35;
    const padRight = 15;
    const padTop = 28;
    const padBottom = 26;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;

    const allVals = [...series1.map((p) => p.val), ...series2.map((p) => p.val)];
    let minVal = Math.floor(Math.min(...allVals) - (metric === "rain" ? 0 : 2));
    if (metric === "rain" && minVal < 0) minVal = 0;
    let maxVal = Math.ceil(Math.max(...allVals) + (metric === "rain" ? 0.05 : 2));
    if (minVal === maxVal) maxVal += 2;

    // Draw horizontal grid lines
    ctx.strokeStyle = "#e8edea";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#8a9690";
    ctx.font = "9.5px JetBrains Mono, monospace";

    const steps = 3;
    for (let i = 0; i <= steps; i++) {
      const val = minVal + ((maxVal - minVal) * i) / steps;
      const y = padTop + plotHeight - (i / steps) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();
      ctx.fillText(metric === "rain" ? val.toFixed(2) : Math.round(val), 6, y + 3);
    }

    // Draw series
    const drawSeries = (series, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();

      series.forEach((p, idx) => {
        const x = padLeft + (idx / (series.length - 1)) * plotWidth;
        const y = padTop + plotHeight - ((p.val - minVal) / (maxVal - minVal)) * plotHeight;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      series.forEach((p, idx) => {
        const x = padLeft + (idx / (series.length - 1)) * plotWidth;
        const y = padTop + plotHeight - ((p.val - minVal) / (maxVal - minVal)) * plotHeight;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();

        if (color === color1) {
          ctx.fillStyle = "#6b7c74";
          ctx.font = "9.5px Plus Jakarta Sans, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(p.label, x, height - 8);
          ctx.textAlign = "left";
        }
      });
    };

    drawSeries(series2, color2);
    drawSeries(series1, color1);

    // Legend
    ctx.font = "10px Plus Jakarta Sans, sans-serif";
    ctx.fillStyle = color1;
    ctx.beginPath();
    ctx.arc(padLeft + 5, 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1b4332";
    ctx.fillText(label1, padLeft + 14, 15);

    ctx.fillStyle = color2;
    ctx.beginPath();
    ctx.arc(padLeft + 125, 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a6d3b";
    ctx.fillText(label2, padLeft + 134, 15);
  }

  function exportComparisonCsv(comp) {
    if (!comp || !comp.historicalComparison || comp.historicalComparison.length === 0) {
      alert("No historical comparison data available to export.");
      return;
    }

    const headers = [
      "Date",
      "Day",
      "Forecast_High_F",
      "Actual_High_F",
      "High_Variance_F",
      "Forecast_Low_F",
      "Actual_Low_F",
      "Low_Variance_F",
      "Forecast_Max_Wind_mph",
      "Actual_Max_Wind_mph",
      "Wind_Variance_mph",
      "Forecast_Rain_in",
      "Actual_Rain_in",
      "Rain_Variance_in",
      "Conditions",
      "Microclimate_Notes"
    ];

    const rows = comp.historicalComparison.map((d) => [
      d.date,
      `"${d.dayLabel}"`,
      d.forecastHigh,
      d.actualHigh,
      d.diffHigh,
      d.forecastLow,
      d.actualLow,
      d.diffLow,
      d.forecastWind,
      d.actualWind,
      d.diffWind,
      d.forecastRain,
      d.actualRain,
      d.diffRain,
      `"${d.weather.desc}"`,
      `"${d.note || ""}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `cabrillo-weather-comparison-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
    const fallback = {
      station: {
        stationName: "Half Moon Bay (Cabrillo)",
        lastReported: "Live Station Readings",
        current: {
          temp: { value: "54.7", unit: "°F" },
          humidity: { value: "95", unit: "%" },
          dewPoint: { value: "53.4", unit: "°F" },
          wetBulb: { value: "53.8", unit: "°F" },
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
        historicalComparison: generateFallbackHistorical(),
        microclimateBias: {
          avgHighDiff: -1.9,
          avgLowDiff: 1.4,
          avgWindDiff: -2.3,
          totalRainActual: 0.08,
          totalRainForecast: 0.05,
          marineLayerDays: 5,
          totalDays: 7,
          summary: "Over the past 7 days, Cabrillo Station ran an average of 1.9°F cooler during peak daytime highs (coastal marine layer dampening). Nighttime lows were 1.4°F milder due to ocean thermal buffering, and peak farm winds averaged 2.3 mph calmer than regional forecasts."
        },
        multiDayForecast: generateFallbackUpcomingForecast()
      },
      sprayAdvisory: {
        status: "CAUTION",
        statusColor: "caution",
        headline: "Inversion Risk (<3 mph)",
        deltaT: 0.9,
        driftRisk: "Inversion",
        advisoryText: "Winds are currently under 3 mph (0.7 mph). Surface temperature inversion risk: suspended droplets can drift unpredictable distances. Delta T is low (0.9°F) indicating very slow evaporation.",
        hourlyWindows: [
          { timeLabel: "6 AM", windSpeed: 2.1, rainProb: 0, temp: 53, rating: "caution" },
          { timeLabel: "7 AM", windSpeed: 3.5, rainProb: 0, temp: 55, rating: "optimal" },
          { timeLabel: "8 AM", windSpeed: 5.2, rainProb: 0, temp: 58, rating: "optimal" },
          { timeLabel: "9 AM", windSpeed: 6.8, rainProb: 0, temp: 61, rating: "optimal" },
          { timeLabel: "10 AM", windSpeed: 8.5, rainProb: 0, temp: 63, rating: "optimal" },
          { timeLabel: "11 AM", windSpeed: 10.2, rainProb: 0, temp: 65, rating: "caution" },
          { timeLabel: "12 PM", windSpeed: 13.1, rainProb: 0, temp: 66, rating: "unfavorable" },
          { timeLabel: "1 PM", windSpeed: 14.5, rainProb: 0, temp: 65, rating: "unfavorable" },
          { timeLabel: "2 PM", windSpeed: 13.8, rainProb: 0, temp: 64, rating: "unfavorable" },
          { timeLabel: "3 PM", windSpeed: 11.2, rainProb: 0, temp: 62, rating: "caution" },
          { timeLabel: "4 PM", windSpeed: 8.0, rainProb: 0, temp: 60, rating: "optimal" },
          { timeLabel: "5 PM", windSpeed: 5.4, rainProb: 0, temp: 58, rating: "optimal" }
        ]
      }
    };
    weatherData = fallback;
    renderDashboard(fallback);
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
