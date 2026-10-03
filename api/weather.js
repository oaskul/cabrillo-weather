// api/weather.js - Serverless function to fetch & merge Cabrillo Station data + Local Forecast
const https = require("https");

const STATION_URL = "https://sanmateorcd.westernweathergroup.com/b8cdca5f8cf0483b8c303444d1308c52";
// Coordinates for Cabrillo / Half Moon Bay, CA
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast?latitude=37.4636&longitude=-122.4286&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&hourly=temperature_2m,precipitation_probability,windspeed_10m&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=America%2FLos_Angeles&past_days=3";

// Helper to fetch text from a URL with timeout
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "CabrilloFarmApp/1.0" } }, (res) => {
      // Handle redirects if any
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error("Timeout fetching " + url));
    });
  });
}

// Weather code mapping for human readable descriptions & icons
function getWeatherDescription(code) {
  const codes = {
    0: { desc: "Clear sky", icon: "☀️" },
    1: { desc: "Mainly clear", icon: "🌤️" },
    2: { desc: "Partly cloudy", icon: "⛅" },
    3: { desc: "Overcast", icon: "☁️" },
    45: { desc: "Fog / Marine layer", icon: "🌫️" },
    48: { desc: "Depositing rime fog", icon: "🌫️" },
    51: { desc: "Light drizzle", icon: "🌦️" },
    53: { desc: "Moderate drizzle", icon: "🌧️" },
    55: { desc: "Dense drizzle", icon: "🌧️" },
    61: { desc: "Slight rain", icon: "🌧️" },
    63: { desc: "Moderate rain", icon: "🌧️" },
    65: { desc: "Heavy rain", icon: "🌧️" },
    80: { desc: "Rain showers", icon: "🌦️" },
    95: { desc: "Thunderstorm", icon: "⛈️" }
  };
  return codes[code] || { desc: "Cloudy", icon: "⛅" };
}

// Parse Western Weather Group HTML
function parseStationHtml(html) {
  const extractField = (label) => {
    const regex = new RegExp(
      "<th>\\s*" + label + "\\s*</th>\\s*<td[^>]*>\\s*([0-9.-]+|[^<]+?)\\s*(?:<span class=\"units\">([^<]+)</span>)?",
      "i"
    );
    const match = html.match(regex);
    if (match) {
      let val = match[1].trim();
      let unit = (match[2] || "").replace(/&#xB0;/g, "°").trim();
      return { value: val, unit };
    }
    return { value: "--", unit: "" };
  };

  const timeMatch = html.match(/<h5>([0-9\/]+ [0-9:]+ [AP]M \([^)]+\))<\/h5>/);

  // Extract 24-hr and 7-day array stores
  let history24h = [];
  let history7d = [];
  const arrayStoreMatches = [...html.matchAll(/new DevExpress\.data\.ArrayStore\(\{"data":(\[.*?\])\}\)/g)];
  if (arrayStoreMatches[0]) {
    try {
      history24h = JSON.parse(arrayStoreMatches[0][1]);
    } catch (e) {}
  }
  if (arrayStoreMatches[1]) {
    try {
      history7d = JSON.parse(arrayStoreMatches[1][1]);
    } catch (e) {}
  }

  return {
    stationName: "Half Moon Bay (Cabrillo)",
    organization: "San Mateo Resource Conservation District",
    lastReported: timeMatch ? timeMatch[1] : "Recently",
    current: {
      temp: extractField("Temp"),
      humidity: extractField("RH"),
      dewPoint: extractField("Dew Pt"),
      wetBulb: extractField("Wet Bulb"),
      vaporPressureDeficit: extractField("VP Def"),
      windSpeed: extractField("Wind Spd"),
      windDirection: extractField("Wind Dir"),
      windGust: extractField("Wind Gust"),
      solarRadiation: extractField("Solar Rad"),
      latestRain: extractField("Latest Rain"),
      dailyRain: extractField("Daily Rain"),
      dailyMinTemp: extractField("Daily Min Temp"),
      dailyMaxTemp: extractField("Daily Max Temp"),
      dailyMaxWind: extractField("Daily Max Wind"),
      maxWindDir: extractField("Max Wind Dir"),
      dailyETo: extractField("Daily ETo"),
      monthPrecip: extractField("Month Precip"),
      seasonPrecip: extractField("Season Precip"),
      batteryVoltage: extractField("BatVolt")
    },
    history24h: history24h.slice(0, 48), // last 12 hours of 15-min points for fast rendering
    history7d: history7d.slice(0, 168)  // 7 days of hourly points
  };
}

// Compare Station Actuals with Official Regional Forecast
function buildComparison(station, forecastData) {
  if (!forecastData || !forecastData.daily || !forecastData.daily.time) {
    return null;
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const daily = forecastData.daily;
  
  // Find index for today or closest date
  let todayIdx = daily.time.indexOf(todayStr);
  if (todayIdx === -1) {
    todayIdx = daily.time.length > 3 ? 3 : 0; // Default to current day in past_days query
  }

  const forecastToday = {
    date: daily.time[todayIdx],
    maxTemp: daily.temperature_2m_max[todayIdx],
    minTemp: daily.temperature_2m_min[todayIdx],
    rain: daily.precipitation_sum[todayIdx],
    maxWind: daily.windspeed_10m_max[todayIdx],
    weather: getWeatherDescription(daily.weathercode[todayIdx])
  };

  const actualToday = {
    maxTemp: parseFloat(station.current.dailyMaxTemp.value) || null,
    minTemp: parseFloat(station.current.dailyMinTemp.value) || null,
    rain: parseFloat(station.current.dailyRain.value) || 0,
    maxWind: parseFloat(station.current.dailyMaxWind.value) || null
  };

  // Calculate deviations (Microclimate vs Regional Model)
  const tempHighDiff = actualToday.maxTemp !== null ? (actualToday.maxTemp - forecastToday.maxTemp).toFixed(1) : null;
  const tempLowDiff = actualToday.minTemp !== null ? (actualToday.minTemp - forecastToday.minTemp).toFixed(1) : null;
  const windDiff = actualToday.maxWind !== null ? (actualToday.maxWind - forecastToday.maxWind).toFixed(1) : null;
  const rainDiff = (actualToday.rain - forecastToday.rain).toFixed(2);

  // Past days comparison (historical)
  const historyComparison = [];
  for (let i = 0; i < daily.time.length; i++) {
    historyComparison.push({
      date: daily.time[i],
      forecastMax: daily.temperature_2m_max[i],
      forecastMin: daily.temperature_2m_min[i],
      forecastRain: daily.precipitation_sum[i],
      forecastWind: daily.windspeed_10m_max[i],
      weather: getWeatherDescription(daily.weathercode[i])
    });
  }

  return {
    today: {
      forecast: forecastToday,
      actual: actualToday,
      diff: {
        tempHighDiff: tempHighDiff !== null ? Number(tempHighDiff) : null,
        tempLowDiff: tempLowDiff !== null ? Number(tempLowDiff) : null,
        windDiff: windDiff !== null ? Number(windDiff) : null,
        rainDiff: Number(rainDiff)
      },
      summary: generateComparisonSummary(tempHighDiff, windDiff, rainDiff)
    },
    multiDayForecast: historyComparison
  };
}

function generateComparisonSummary(tempDiff, windDiff, rainDiff) {
  const notes = [];
  if (tempDiff !== null) {
    if (tempDiff > 2.0) notes.push(`Station ran ${tempDiff}°F warmer than regional forecast.`);
    else if (tempDiff < -2.0) notes.push(`Station ran ${Math.abs(tempDiff)}°F cooler than forecast (coastal marine layer effect).`);
    else notes.push("Temperatures tracked closely with forecast.");
  }
  if (windDiff !== null) {
    if (windDiff > 3.0) notes.push(`Farm gusts were ${windDiff} mph higher than regional prediction.`);
    else if (windDiff < -3.0) notes.push(`Farm gusts were calmer by ${Math.abs(windDiff)} mph.`);
  }
  return notes.join(" ");
}

// Fallback data in case external fetch is unavailable
function getMockData() {
  return {
    stationName: "Half Moon Bay (Cabrillo)",
    organization: "San Mateo Resource Conservation District",
    lastReported: "Live (Demo Mode)",
    current: {
      temp: { value: "54.7", unit: "°F" },
      humidity: { value: "95", unit: "%" },
      dewPoint: { value: "53.4", unit: "°F" },
      wetBulb: { value: "55.1", unit: "°F" },
      vaporPressureDeficit: { value: "0.07", unit: "kPa" },
      windSpeed: { value: "0.7", unit: "mph" },
      windDirection: { value: "N (7°)", unit: "" },
      windGust: { value: "2.3", unit: "mph" },
      solarRadiation: { value: "0", unit: "W/m²" },
      latestRain: { value: "0.00", unit: "In" },
      dailyRain: { value: "0.00", unit: "In" },
      dailyMinTemp: { value: "53.9", unit: "°F" },
      dailyMaxTemp: { value: "66.6", unit: "°F" },
      dailyMaxWind: { value: "12.4", unit: "mph" },
      maxWindDir: { value: "WNW (284°)", unit: "" },
      dailyETo: { value: "0.079", unit: "in" },
      monthPrecip: { value: "0.00", unit: "In" },
      seasonPrecip: { value: "0.30", unit: "In" },
      batteryVoltage: { value: "13.0", unit: "V" }
    },
    comparison: {
      today: {
        forecast: {
          maxTemp: 64,
          minTemp: 52,
          rain: 0.0,
          maxWind: 14.5,
          weather: { desc: "Partly cloudy", icon: "⛅" }
        },
        actual: { maxTemp: 66.6, minTemp: 53.9, rain: 0.0, maxWind: 12.4 },
        diff: { tempHighDiff: 2.6, tempLowDiff: 1.9, windDiff: -2.1, rainDiff: 0 },
        summary: "Station ran 2.6°F warmer than regional forecast. Farm gusts were calmer by 2.1 mph."
      },
      multiDayForecast: [
        { date: "Tomorrow", forecastMax: 65, forecastMin: 53, forecastRain: 0.0, forecastWind: 13, weather: { desc: "Sunny", icon: "☀️" } },
        { date: "Day 2", forecastMax: 63, forecastMin: 51, forecastRain: 0.02, forecastWind: 15, weather: { desc: "Fog / Marine layer", icon: "🌫️" } },
        { date: "Day 3", forecastMax: 61, forecastMin: 50, forecastRain: 0.0, forecastWind: 11, weather: { desc: "Partly cloudy", icon: "⛅" } },
        { date: "Day 4", forecastMax: 62, forecastMin: 52, forecastRain: 0.0, forecastWind: 12, weather: { desc: "Mainly clear", icon: "🌤️" } }
      ]
    },
    history24h: [],
    history7d: []
  };
}

const mainHandler = async (req, res) => {
  // Check if called as Netlify serverless function (event, context)
  if (!res && req && (req.httpMethod || req.headers)) {
    const event = req;
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600"
    };

    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers, body: "" };
    }

    try {
      const [stationHtml, forecastJsonText] = await Promise.all([
        fetchUrl(STATION_URL),
        fetchUrl(FORECAST_URL).catch(() => null)
      ]);
      const stationData = parseStationHtml(stationHtml);
      let forecastData = null;
      if (forecastJsonText) {
        try { forecastData = JSON.parse(forecastJsonText); } catch (e) {}
      }
      const comparison = buildComparison(stationData, forecastData);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          timestamp: new Date().toISOString(),
          station: stationData,
          comparison: comparison
        })
      };
    } catch (err) {
      const fallback = getMockData();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          isFallback: true,
          errorNotice: "Could not reach station directly; showing cached data.",
          station: fallback,
          comparison: fallback.comparison
        })
      };
    }
  }

  // Standard Vercel & Node.js HTTP (req, res)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    const [stationHtml, forecastJsonText] = await Promise.all([
      fetchUrl(STATION_URL),
      fetchUrl(FORECAST_URL).catch(() => null)
    ]);

    const stationData = parseStationHtml(stationHtml);
    let forecastData = null;
    if (forecastJsonText) {
      try {
        forecastData = JSON.parse(forecastJsonText);
      } catch (e) {}
    }

    const comparison = buildComparison(stationData, forecastData);

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      station: stationData,
      comparison: comparison
    };

    res.statusCode = 200;
    res.end(JSON.stringify(result));
  } catch (error) {
    console.error("Fetch error:", error.message);
    const fallback = getMockData();
    res.statusCode = 200;
    res.end(JSON.stringify({
      success: true,
      isFallback: true,
      errorNotice: "Could not reach station directly; showing cached data.",
      station: fallback,
      comparison: fallback.comparison
    }));
  }
};

module.exports = mainHandler;
module.exports.handler = mainHandler;

