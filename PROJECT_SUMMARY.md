# Cabrillo Weather - Project Summary & Status

## Overview
A Progressive Web App (PWA) built for the Cabrillo Weather Station (Half Moon Bay, CA) operated by the San Mateo Resource Conservation District via Western Weather Group.

## Source Data & URLs
- **Live Station Source:** `https://sanmateorcd.westernweathergroup.com/b8cdca5f8cf0483b8c303444d1308c52` (Station ID: `CBR`)
- **Regional Forecast API:** Open-Meteo & NOAA/NWS coordinates `37.4636, -122.4286` (Half Moon Bay, CA)

## Key Features Implemented
1. **Current Field Conditions:** Large sunlight-readable display for Temp, Dew Point, Humidity, Today's Max/Min.
2. **Wind & Spraying Card:** Wind speed, peak gusts, direction, daily peak wind.
3. **Precipitation Tracker:** Rain today, month total, season accumulation.
4. **Agronomy Metrics:** Daily ETo (Evapotranspiration), Solar Radiation ($W/m^2$), Vapor Pressure Deficit (VPD).
5. **Microclimate vs. Regional Forecast Comparison:** Compares station actuals against regional forecasts for temperature, wind, and rain variance.
6. **7-Day Regional Outlook:** Daily high/low and weather conditions for Half Moon Bay.
7. **24h & 7d Canvas Charts:** Temperature, dew point, wind, and past week trends.
8. **Station Battery Indicator:** Monitors solar battery voltage (13.0V = Good).
9. **Progressive Web App (PWA):** `manifest.json`, `sw.js` (offline caching), and custom farm icons (`icon-192.png`, `icon-512.png`, `icon.svg`).

## Project Structure
- `api/weather.js` - Universal serverless API handler (compatible with Vercel & Netlify)
- `public/index.html` - Mobile dashboard UI
- `public/styles.css` - High-contrast agricultural theme
- `public/app.js` - Frontend controller, live polling, canvas charts, install prompt
- `public/manifest.json` - PWA manifest
- `public/sw.js` - Service worker
- `public/icons/` - App icons
- `server.js` - Built-in zero-dependency local dev server (`node server.js`)
- `vercel.json` & `netlify.toml` - Deployment configs
- `README.md` - Deployment and installation guide

## Next Steps
- Push to GitHub: `git remote add origin <github-repo-url>` && `git push -u origin main`
- Connect GitHub repo to Vercel or Netlify for free automated hosting
