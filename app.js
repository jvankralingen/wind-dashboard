// Wind Dashboard App

// Actuelewind.nl API via lokale proxy - realtime meetstationdata
const ACTUELEWIND_API_URL = '/api/wind';

// Getijden via lokale API proxy (haalt data van tide-forecast.com)
const TIDE_API_URL = '/api/tide';

// Huidige spot (default: ijmuiden)
let currentSpot = null;

// Huidige eenheid (kn = knopen, bft = beaufort, ms = m/s)
let currentUnit = 'kn';
let windData = null;
let marineData = null;
let tideData = null;
let currentIndex = 0;

// Beaufort schaal definities (in km/h)
const BEAUFORT_SCALE = [
    { max: 1, name: 'Stil', knots: 1 },
    { max: 5, name: 'Zwak', knots: 3 },
    { max: 11, name: 'Zwak', knots: 6 },
    { max: 19, name: 'Matig', knots: 10 },
    { max: 28, name: 'Matig', knots: 16 },
    { max: 38, name: 'Vrij krachtig', knots: 21 },
    { max: 49, name: 'Krachtig', knots: 27 },
    { max: 61, name: 'Hard', knots: 33 },
    { max: 74, name: 'Stormachtig', knots: 40 },
    { max: 88, name: 'Storm', knots: 47 },
    { max: 102, name: 'Zware storm', knots: 55 },
    { max: 117, name: 'Zeer zware storm', knots: 63 },
    { max: Infinity, name: 'Orkaan', knots: 72 }
];

// API URLs genereren voor een spot
function getWindApiUrl(spot) {
    return `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m&daily=sunrise,sunset&timezone=Europe%2FAmsterdam`;
}

function getMarineApiUrl(spot) {
    return `https://marine-api.open-meteo.com/v1/marine?latitude=${spot.lat}&longitude=${spot.lon}&hourly=wave_height,wave_direction,wave_period&timezone=Europe%2FAmsterdam`;
}

// Conversie functies
function kmhToKnots(kmh) {
    return kmh / 1.852;
}

function kmhToMs(kmh) {
    return kmh / 3.6;
}

function getBeaufort(speedKmh) {
    for (let i = 0; i < BEAUFORT_SCALE.length; i++) {
        if (speedKmh <= BEAUFORT_SCALE[i].max) {
            return i;
        }
    }
    return 12;
}

// Windsnelheid formatteren op basis van huidige eenheid
function formatWindSpeed(speedKmh, showUnit = true) {
    let value, unit;

    switch (currentUnit) {
        case 'kn':
            value = Math.round(kmhToKnots(speedKmh));
            unit = 'kn';
            break;
        case 'bft':
            value = getBeaufort(speedKmh);
            unit = 'Bft';
            break;
        case 'ms':
            value = Math.round(kmhToMs(speedKmh) * 10) / 10;
            unit = 'm/s';
            break;
        default:
            value = Math.round(speedKmh);
            unit = 'km/h';
    }

    return showUnit ? `${value} ${unit}` : value;
}

// Windrichting namen
function getDirectionName(degrees) {
    const directions = ['N', 'NNO', 'NO', 'ONO', 'O', 'OZO', 'ZO', 'ZZO', 'Z', 'ZZW', 'ZW', 'WZW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

// Huidige uur index vinden
function getCurrentHourIndex(times) {
    const now = new Date();

    // Gebruik lokale tijd (Amsterdam) voor vergelijking met API data
    // API geeft tijd in Europe/Amsterdam formaat: "2026-01-03T15:00"
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const currentHour = `${year}-${month}-${day}T${hour}`;

    for (let i = 0; i < times.length; i++) {
        if (times[i].startsWith(currentHour)) {
            return i;
        }
    }

    // Fallback: vind dichtstbijzijnde uur
    const nowTime = now.getTime();
    let closestIndex = 0;
    let closestDiff = Infinity;

    times.forEach((time, index) => {
        const diff = Math.abs(new Date(time).getTime() - nowTime);
        if (diff < closestDiff) {
            closestDiff = diff;
            closestIndex = index;
        }
    });

    return closestIndex;
}

// Windrichting updaten
function updateWindDirection(degrees) {
    const arrow = document.getElementById('directionArrow');
    if (arrow) {
        // Pijl wijst naar waar de wind naartoe gaat (degrees + 180)
        arrow.style.transform = `rotate(${degrees}deg)`;
    }
    document.getElementById('directionText').textContent = getDirectionName(degrees);
}

// Huidige eenheid label ophalen
function getCurrentUnitLabel() {
    switch (currentUnit) {
        case 'kn': return 'kn';
        case 'bft': return 'Bft';
        case 'ms': return 'm/s';
        default: return 'km/h';
    }
}

// Live meetstationdata via actuelewind.nl API
let actueleWindData = null;
let liveStationData = null;

async function fetchActueleWindData() {
    try {
        const response = await fetch(ACTUELEWIND_API_URL);
        const data = await response.json();

        if (data.stations) {
            actueleWindData = data.stations;
            console.log('Actuelewind.nl data opgehaald:', Object.keys(actueleWindData).length, 'stations');
            return actueleWindData;
        }
    } catch (error) {
        console.error('Fout bij ophalen actuelewind.nl data:', error);
    }
    return null;
}

// Haal meetstationdata op voor een specifieke spot
function getStationDataForSpot(spot) {
    if (!actueleWindData || !spot.actueleWindId) {
        return null;
    }

    const station = actueleWindData[spot.actueleWindId];
    if (station) {
        console.log(`Meetstation ${station.naam} gevonden voor ${spot.name}:`, {
            windsnelheidMS: station.windsnelheidMS + ' m/s',
            windstoten: station.windstotenMS + ' m/s',
            richting: station.windrichting,
            tijd: station.tijdstip
        });
        // Converteer naar format dat rest van app verwacht
        return {
            stationname: station.naam,
            windspeed: station.windsnelheidMS,
            windgusts: station.windstotenMS,
            winddirectiondegrees: station.windrichtingGR,
            winddirection: station.windrichting,
            windspeedBft: getBeaufort(station.windsnelheidMS * 3.6),
            temperature: station.temperatuurGC
        };
    }
    return null;
}

// Huidige condities updaten (met live KNMI meetstationdata indien beschikbaar)
function updateCurrentConditions() {
    if (!windData) return;

    let speedDisplay, gustsDisplay, direction;

    // Gebruik live KNMI meetstationdata van Buienradar indien beschikbaar
    liveStationData = getStationDataForSpot(currentSpot);

    if (liveStationData) {
        // Buienradar geeft windsnelheid in m/s, converteer naar gewenste eenheid
        const windSpeedMS = liveStationData.windspeed; // m/s
        const windGustsMS = liveStationData.windgusts; // m/s

        switch (currentUnit) {
            case 'kn':
                speedDisplay = (windSpeedMS * 1.94384).toFixed(1);
                gustsDisplay = windGustsMS ? (windGustsMS * 1.94384).toFixed(1) : '--';
                break;
            case 'ms':
                speedDisplay = windSpeedMS.toFixed(1);
                gustsDisplay = windGustsMS ? windGustsMS.toFixed(1) : '--';
                break;
            case 'bft':
                speedDisplay = liveStationData.windspeedBft;
                // Voor Beaufort vlagen: bereken Bft van m/s
                gustsDisplay = windGustsMS ? getBeaufort(windGustsMS * 3.6) : '--';
                break;
            default:
                speedDisplay = (windSpeedMS * 3.6).toFixed(1);
                gustsDisplay = windGustsMS ? (windGustsMS * 3.6).toFixed(1) : '--';
        }

        // Windrichting van meetstation (in graden)
        direction = liveStationData.winddirectiondegrees;

        console.log('Actuele condities van KNMI meetstation:', {
            station: liveStationData.stationname,
            windMS: windSpeedMS,
            windKnots: Math.round(windSpeedMS * 1.94384),
            gustsMS: windGustsMS,
            gustsKnots: windGustsMS ? Math.round(windGustsMS * 1.94384) : null,
            direction: direction,
            directionName: liveStationData.winddirection
        });

        document.getElementById('currentSpeed').textContent = speedDisplay;
        document.getElementById('currentGusts').textContent = gustsDisplay;
    } else {
        // Fallback naar Open-Meteo voorspellingsdata
        const speed = windData.hourly.wind_speed_10m[currentIndex];
        const gusts = windData.hourly.wind_gusts_10m[currentIndex];
        direction = windData.hourly.wind_direction_10m[currentIndex];

        document.getElementById('currentSpeed').textContent = formatWindSpeed(speed, false);
        document.getElementById('currentGusts').textContent = formatWindSpeed(gusts, false);

        console.log('Geen meetstationdata - gebruik Open-Meteo voorspelling');
    }

    document.getElementById('windUnit').textContent = getCurrentUnitLabel();
    document.getElementById('gustsUnit').textContent = getCurrentUnitLabel();
    updateWindDirection(direction);

    // Update gear advies
    updateGearAdvice();
}

// Huidige windsnelheid in knopen (voor gear advies)
let currentWindKnots = 0;

// Gear advies updaten op basis van huidige windsnelheid
function updateGearAdvice() {
    const gearAdviceEl = document.getElementById('gearAdvice');
    const gearSailEl = document.getElementById('gearSail');
    const gearBoardEl = document.getElementById('gearBoard');

    if (!gearAdviceEl || !window.getGearAdvice) return;

    // Bepaal windsnelheid in knopen
    currentWindKnots = 0;

    if (liveStationData && liveStationData.windspeed) {
        currentWindKnots = liveStationData.windspeed * 1.94384;
    } else if (windData) {
        const speedKmh = windData.hourly.wind_speed_10m[currentIndex];
        currentWindKnots = speedKmh / 1.852;
    }

    const advice = window.getGearAdvice(currentWindKnots);

    if (advice.message) {
        gearSailEl.textContent = advice.message;
        gearBoardEl.textContent = '';
        gearAdviceEl.classList.add('no-wind');
    } else {
        gearSailEl.textContent = `${advice.sail}m²`;
        gearBoardEl.textContent = advice.board;
        gearAdviceEl.classList.remove('no-wind');
    }
}

// Gear panel setup
function setupGearPanel() {
    const gearAdvice = document.getElementById('gearAdvice');
    const gearPanel = document.getElementById('gearPanel');
    const gearPanelClose = document.getElementById('gearPanelClose');
    const gearOverlay = document.getElementById('gearOverlay');

    if (!gearAdvice || !gearPanel) return;

    // Open gear panel bij klik op advies
    gearAdvice.addEventListener('click', () => {
        updateGearPanelContent();
        gearPanel.classList.add('open');
        gearOverlay.classList.add('open');
    });

    // Sluit gear panel
    function closeGearPanel() {
        gearPanel.classList.remove('open');
        gearOverlay.classList.remove('open');
    }

    gearPanelClose.addEventListener('click', closeGearPanel);
    gearOverlay.addEventListener('click', closeGearPanel);
}

// Gear panel inhoud updaten
function updateGearPanelContent() {
    const sailsTable = document.getElementById('sailsTable');
    const boardsTable = document.getElementById('boardsTable');

    if (!sailsTable || !boardsTable || !window.GEAR_CONFIG) return;

    const advice = window.getGearAdvice(currentWindKnots);

    // Zeilen tabel - sorteer van groot naar klein
    const sailsSorted = [...window.GEAR_CONFIG.sails].sort((a, b) => b.size - a.size);
    sailsTable.innerHTML = '';
    sailsSorted.forEach(sail => {
        const row = document.createElement('div');
        row.className = 'gear-row';
        if (advice.sail === sail.size) {
            row.classList.add('active');
        }

        const windRange = sail.maxWind === Infinity
            ? `${sail.maxWind === Infinity ? '30' : sail.maxWind}+ kn`
            : `tot ${sail.maxWind} kn`;

        row.innerHTML = `
            <div class="gear-row-main">
                <span class="gear-row-name">${sail.size}m²</span>
                <span class="gear-row-wind">${windRange}</span>
            </div>
        `;
        sailsTable.appendChild(row);
    });

    // Boards tabel - sorteer op maxWind (grootste board eerst)
    const boardsSorted = [...window.GEAR_CONFIG.boards].sort((a, b) => {
        if (a.maxWind === Infinity) return 1;
        if (b.maxWind === Infinity) return -1;
        return a.maxWind - b.maxWind;
    });
    boardsTable.innerHTML = '';
    boardsSorted.forEach(board => {
        const row = document.createElement('div');
        row.className = 'gear-row';
        if (advice.board === board.name) {
            row.classList.add('active');
        }

        const windRange = board.maxWind === Infinity
            ? `${board.maxWind === Infinity ? '21' : board.maxWind}+ kn`
            : `tot ${board.maxWind} kn`;

        row.innerHTML = `
            <div class="gear-row-main">
                <span class="gear-row-name">${board.name}</span>
                <span class="gear-row-wind">${windRange}</span>
            </div>
            ${board.liters ? `<div class="gear-row-specs"><span>${board.liters}L</span></div>` : ''}
        `;
        boardsTable.appendChild(row);
    });
}

// Getijden cache (6 uur geldig)
const TIDE_CACHE_KEY = 'tideCacheTF';
const TIDE_CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 uur in ms

// Gecachte getijdendata ophalen
function getTideCache() {
    try {
        const cached = localStorage.getItem(TIDE_CACHE_KEY);
        if (!cached) return null;

        const { timestamp, data } = JSON.parse(cached);
        const now = Date.now();

        if (now - timestamp > TIDE_CACHE_DURATION) {
            localStorage.removeItem(TIDE_CACHE_KEY);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Fout bij lezen tide cache:', error);
        return null;
    }
}

// Getijdendata opslaan in cache
function setTideCache(data) {
    try {
        const cacheData = {
            timestamp: Date.now(),
            data: data
        };
        localStorage.setItem(TIDE_CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
        console.error('Fout bij opslaan tide cache:', error);
    }
}

// Getijden ophalen via lokale API proxy
async function fetchTideDataForSpot(spot) {
    if (!spot.tideLocation) {
        console.log(`Geen tide locatie voor ${spot.name}`);
        return null;
    }

    try {
        const url = `${TIDE_API_URL}?location=${encodeURIComponent(spot.tideLocation)}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`Tide API fout voor ${spot.name}:`, response.status);
            return null;
        }

        const data = await response.json();

        if (data.extremes && data.extremes.length > 0) {
            console.log(`Getijden opgehaald voor ${spot.name}:`, data.extremes.length, 'extremen');
            return { data: data.extremes };
        }

        return null;

    } catch (error) {
        console.error(`Fout bij ophalen getijden voor ${spot.name}:`, error);
        return null;
    }
}

// Getijden ophalen voor alle spots (of uit cache)
async function fetchAllTideData() {
    // Check cache eerst
    const cached = getTideCache();
    if (cached) {
        console.log('Getijdendata uit cache geladen');
        return cached;
    }

    console.log('Getijdendata ophalen voor alle spots...');

    const tideDataBySpot = {};

    // Unieke tide locaties (voorkom dubbele fetches)
    const uniqueLocations = new Map();
    for (const spot of SPOTS) {
        if (spot.tideLocation && !uniqueLocations.has(spot.tideLocation)) {
            uniqueLocations.set(spot.tideLocation, spot);
        }
    }

    // Haal data op voor unieke locaties
    for (const [location, spot] of uniqueLocations) {
        const data = await fetchTideDataForSpot(spot);

        // Koppel aan alle spots met dezelfde locatie
        for (const s of SPOTS) {
            if (s.tideLocation === location) {
                tideDataBySpot[s.id] = data;
            }
        }

        // Delay om rate limiting te voorkomen
        await new Promise(r => setTimeout(r, 500));
    }

    // Sla op in cache
    setTideCache(tideDataBySpot);
    console.log('Getijdendata gecached voor 6 uur');

    return tideDataBySpot;
}

// Getijden voor huidige spot ophalen (uit gecachte data)
function getTideDataForSpot(spotId) {
    const cached = getTideCache();
    if (cached && cached[spotId]) {
        return cached[spotId];
    }
    return null;
}

// Getijden weergave updaten
function updateTideDisplay() {
    const tideDirection = document.getElementById('tideDirection');
    const tideTimes = document.getElementById('tideTimes');

    if (!currentSpot || !currentSpot.tideLocation) {
        tideDirection.textContent = '--';
        tideTimes.textContent = 'Geen data';
        return;
    }

    if (!tideData || !tideData.data || tideData.data.length === 0) {
        tideDirection.textContent = '--';
        tideTimes.textContent = 'Geen data';
        return;
    }

    const now = new Date();
    const extremes = tideData.data;

    // Vind vorige en volgende extremen
    let prevExtreme = null;
    let nextExtreme = null;
    let secondNextExtreme = null;

    for (const extreme of extremes) {
        const time = new Date(extreme.time);
        if (time <= now) {
            prevExtreme = extreme;
        } else if (!nextExtreme) {
            nextExtreme = extreme;
        } else if (!secondNextExtreme) {
            secondNextExtreme = extreme;
            break;
        }
    }

    if (!nextExtreme) {
        tideDirection.textContent = '--';
        tideTimes.textContent = 'Geen data';
        return;
    }

    // Bepaal richting: opkomend (naar HW) of afgaand (naar LW)
    const isRising = nextExtreme.type === 'high';
    const formatTime = (date) => new Date(date).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

    if (isRising) {
        // Opkomend: we gaan naar hoogwater
        tideDirection.textContent = '↑ opkomend';
        tideDirection.className = 'tide-direction rising';
        // Toon: HW tijd → LW tijd
        const hwTime = formatTime(nextExtreme.time);
        const lwTime = secondNextExtreme ? formatTime(secondNextExtreme.time) : '--:--';
        tideTimes.textContent = `HW ${hwTime} → LW ${lwTime}`;
    } else {
        // Afgaand: we gaan naar laagwater
        tideDirection.textContent = '↓ afgaand';
        tideDirection.className = 'tide-direction falling';
        // Toon: LW tijd → HW tijd
        const lwTime = formatTime(nextExtreme.time);
        const hwTime = secondNextExtreme ? formatTime(secondNextExtreme.time) : '--:--';
        tideTimes.textContent = `LW ${lwTime} → HW ${hwTime}`;
    }
}

// Golf condities updaten
function updateWaveConditions() {
    if (!marineData) return;

    const waveHeight = marineData.hourly.wave_height[currentIndex];
    const wavePeriod = marineData.hourly.wave_period[currentIndex];
    const waveDirection = marineData.hourly.wave_direction[currentIndex];

    document.getElementById('waveHeight').textContent = waveHeight !== null ? waveHeight.toFixed(1) : '--';
    document.getElementById('wavePeriod').textContent = wavePeriod !== null ? wavePeriod.toFixed(1) : '--';
    document.getElementById('waveDirection').textContent = waveDirection !== null ? getDirectionName(waveDirection) : '--';
}

// Samenvatting vandaag berekenen
function updateTodaySummary() {
    if (!windData) return;

    const today = new Date().toISOString().slice(0, 10);

    let todaySpeeds = [];
    let todayGusts = [];
    let todayWaves = [];

    windData.hourly.time.forEach((time, index) => {
        if (time.startsWith(today)) {
            todaySpeeds.push(windData.hourly.wind_speed_10m[index]);
            todayGusts.push(windData.hourly.wind_gusts_10m[index]);
        }
    });

    if (marineData) {
        marineData.hourly.time.forEach((time, index) => {
            if (time.startsWith(today) && marineData.hourly.wave_height[index] !== null) {
                todayWaves.push(marineData.hourly.wave_height[index]);
            }
        });
    }

    if (todaySpeeds.length === 0) {
        // Fallback naar komende 24 uur
        for (let i = currentIndex; i < currentIndex + 24 && i < windData.hourly.time.length; i++) {
            todaySpeeds.push(windData.hourly.wind_speed_10m[i]);
            todayGusts.push(windData.hourly.wind_gusts_10m[i]);
            if (marineData && marineData.hourly.wave_height[i] !== null) {
                todayWaves.push(marineData.hourly.wave_height[i]);
            }
        }
    }

    const avgSpeed = todaySpeeds.reduce((a, b) => a + b, 0) / todaySpeeds.length;
    const maxSpeed = Math.max(...todaySpeeds);
    const maxGusts = Math.max(...todayGusts);
    const maxWave = todayWaves.length > 0 ? Math.max(...todayWaves) : null;

    document.getElementById('avgSpeed').textContent = formatWindSpeed(avgSpeed);
    document.getElementById('maxSpeed').textContent = formatWindSpeed(maxSpeed);
    document.getElementById('maxGusts').textContent = formatWindSpeed(maxGusts);
    document.getElementById('maxWave').textContent = maxWave !== null ? `${maxWave.toFixed(1)} m` : '--';
}

// Grafiek maken
let forecastChart = null;

function createForecastChart() {
    if (!windData) return;

    const ctx = document.getElementById('forecastChart').getContext('2d');

    // Data voor daglicht uren
    const labels = [];
    const speeds = [];
    const gusts = [];
    const waves = [];

    // Bepaal sunrise/sunset voor vandaag en morgen
    const today = new Date();
    const todayDateStr = today.toISOString().slice(0, 10);

    let sunriseToday = null;
    let sunsetToday = null;
    let sunriseTomorrow = null;
    let sunsetTomorrow = null;

    if (windData.daily && windData.daily.sunrise && windData.daily.sunset) {
        const dailyTimes = windData.daily.time;
        for (let d = 0; d < dailyTimes.length; d++) {
            if (dailyTimes[d] === todayDateStr) {
                sunriseToday = new Date(windData.daily.sunrise[d]);
                sunsetToday = new Date(windData.daily.sunset[d]);
                if (d + 1 < dailyTimes.length) {
                    sunriseTomorrow = new Date(windData.daily.sunrise[d + 1]);
                    sunsetTomorrow = new Date(windData.daily.sunset[d + 1]);
                }
                break;
            }
        }
    }

    // Filter data tot alleen daglicht uren
    for (let i = currentIndex; i < currentIndex + 24 && i < windData.hourly.time.length; i++) {
        const time = new Date(windData.hourly.time[i]);

        // Check of dit uur binnen daglicht valt
        let isDaylight = true;
        const timeDate = time.toISOString().slice(0, 10);

        if (timeDate === todayDateStr && sunriseToday && sunsetToday) {
            isDaylight = time >= sunriseToday && time <= sunsetToday;
        } else if (sunriseTomorrow && sunsetTomorrow) {
            isDaylight = time >= sunriseTomorrow && time <= sunsetTomorrow;
        }

        if (!isDaylight) continue;

        labels.push(time.getHours() + ':00');

        const speedKmh = windData.hourly.wind_speed_10m[i];
        const gustsKmh = windData.hourly.wind_gusts_10m[i];

        // Converteer naar huidige eenheid
        const speedValue = parseFloat(formatWindSpeed(speedKmh, false));
        const gustsValue = parseFloat(formatWindSpeed(gustsKmh, false));
        speeds.push(speedValue);
        // Vlagen als extra bovenop wind (alleen het verschil)
        gusts.push(Math.max(0, gustsValue - speedValue));

        if (marineData && marineData.hourly.wave_height[i] !== null) {
            waves.push(marineData.hourly.wave_height[i]);
        } else {
            waves.push(null);
        }
    }

    if (forecastChart) {
        forecastChart.destroy();
    }

    const datasets = [
        {
            label: `Vlagen (${getCurrentUnitLabel()})`,
            data: gusts,
            backgroundColor: '#f97316',
            borderColor: '#ea580c',
            borderWidth: 1,
            borderRadius: { topLeft: 3, topRight: 3, bottomLeft: 0, bottomRight: 0 },
            stack: 'wind',
            yAxisID: 'y',
            order: 2
        },
        {
            label: `Wind (${getCurrentUnitLabel()})`,
            data: speeds,
            backgroundColor: '#22c55e',
            borderColor: '#16a34a',
            borderWidth: 1,
            borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 3, bottomRight: 3 },
            stack: 'wind',
            yAxisID: 'y',
            order: 1
        }
    ];

    // Voeg golven toe als lijn
    if (waves.some(w => w !== null)) {
        datasets.push({
            label: 'Golven (m)',
            data: waves,
            type: 'line',
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5,
            borderWidth: 2,
            yAxisID: 'y1',
            order: 0
        });
    }

    forecastChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#94a3b8',
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 11
                        }
                    }
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f8fafc',
                    bodyColor: '#f8fafc',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 12
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: {
                        color: 'rgba(148, 163, 184, 0.1)'
                    },
                    ticks: {
                        color: '#22c55e',
                        callback: function(value) {
                            return value + ' ' + getCurrentUnitLabel();
                        }
                    },
                    beginAtZero: true
                },
                y1: {
                    type: 'linear',
                    display: waves.some(w => w !== null),
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    ticks: {
                        color: '#38bdf8',
                        callback: function(value) {
                            return value + ' m';
                        }
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

// Weekvoorspelling maken
function createWeeklyForecast() {
    if (!windData) return;

    const container = document.getElementById('weeklyForecast');
    container.innerHTML = '';

    const dayNames = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Groepeer data per dag
    const dailyData = {};

    windData.hourly.time.forEach((time, index) => {
        const date = time.slice(0, 10); // YYYY-MM-DD
        const dateObj = new Date(date);

        // Skip verleden dagen
        if (dateObj < today) return;

        if (!dailyData[date]) {
            dailyData[date] = {
                date: dateObj,
                speeds: [],
                gusts: [],
                directions: [],
                waves: []
            };
        }

        dailyData[date].speeds.push(windData.hourly.wind_speed_10m[index]);
        dailyData[date].gusts.push(windData.hourly.wind_gusts_10m[index]);
        dailyData[date].directions.push(windData.hourly.wind_direction_10m[index]);

        if (marineData && marineData.hourly.wave_height[index] !== null) {
            dailyData[date].waves.push(marineData.hourly.wave_height[index]);
        }
    });

    // Converteer naar array en sorteer
    const days = Object.values(dailyData).slice(0, 7);

    days.forEach((day, index) => {
        const avgSpeed = day.speeds.reduce((a, b) => a + b, 0) / day.speeds.length;
        const maxSpeed = Math.max(...day.speeds);
        const minSpeed = Math.min(...day.speeds);
        const maxGusts = Math.max(...day.gusts);
        const maxWave = day.waves.length > 0 ? Math.max(...day.waves) : null;

        // Dominante windrichting (meest voorkomende)
        const directionCounts = {};
        day.directions.forEach(dir => {
            const name = getDirectionName(dir);
            directionCounts[name] = (directionCounts[name] || 0) + 1;
        });
        const dominantDirection = Object.entries(directionCounts)
            .sort((a, b) => b[1] - a[1])[0][0];

        const dayName = index === 0 ? 'Vandaag' : index === 1 ? 'Morgen' : dayNames[day.date.getDay()];
        const dateStr = day.date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });

        const item = document.createElement('div');
        item.className = 'weekly-day';

        let waveHtml = maxWave !== null
            ? `<div class="weekly-wave">🌊 ${maxWave.toFixed(1)}m</div>`
            : '';

        item.innerHTML = `
            <div class="weekly-day-info">
                <div class="weekly-day-name">${dayName}</div>
                <div class="weekly-day-date">${dateStr}</div>
            </div>
            <div class="weekly-wind">
                <div class="weekly-wind-speed">${formatWindSpeed(avgSpeed, false)}</div>
                <div class="weekly-wind-label">gem. ${getCurrentUnitLabel()}</div>
                <div class="weekly-wind-range">${formatWindSpeed(minSpeed, false)} - ${formatWindSpeed(maxSpeed, false)}</div>
            </div>
            <div class="weekly-details">
                <div class="weekly-direction">${dominantDirection}</div>
                <div class="weekly-gusts">⚡ max ${formatWindSpeed(maxGusts, false)}</div>
                ${waveHtml}
            </div>
        `;

        container.appendChild(item);
    });
}

// Uurlijkse weergave maken
function createHourlyDisplay() {
    if (!windData) return;

    const container = document.getElementById('hourlyScroll');
    container.innerHTML = '';

    for (let i = currentIndex; i < currentIndex + 24 && i < windData.hourly.time.length; i++) {
        const time = new Date(windData.hourly.time[i]);
        const speedKmh = windData.hourly.wind_speed_10m[i];
        const gustsKmh = windData.hourly.wind_gusts_10m[i];
        const direction = windData.hourly.wind_direction_10m[i];

        const speed = formatWindSpeed(speedKmh, false);
        const gusts = formatWindSpeed(gustsKmh, false);

        const item = document.createElement('div');
        item.className = `hourly-item${i === currentIndex ? ' current' : ''}`;

        let waveHtml = '';
        if (marineData && marineData.hourly.wave_height[i] !== null) {
            waveHtml = `<div class="hourly-wave">🌊 ${marineData.hourly.wave_height[i].toFixed(1)}m</div>`;
        }

        item.innerHTML = `
            <div class="hourly-time">${time.getHours()}:00</div>
            <div class="hourly-speed">${speed}</div>
            <div class="hourly-label">${getCurrentUnitLabel()}</div>
            <div class="hourly-gusts">⚡ ${gusts}</div>
            ${waveHtml}
            <div class="hourly-direction">
                <span class="hourly-arrow" style="transform: rotate(${direction}deg)">↓</span>
                ${getDirectionName(direction)}
            </div>
        `;

        container.appendChild(item);
    }
}

// Update tijd weergave
function updateTime() {
    const now = new Date();
    const options = {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
    };
    document.getElementById('updateTime').textContent =
        `Bijgewerkt: ${now.toLocaleDateString('nl-NL', options)}`;
}

// Alle weergaven updaten
function updateAllDisplays() {
    updateCurrentConditions();
    updateTideDisplay();
    updateWaveConditions();
    updateTodaySummary();
    createForecastChart();
    createHourlyDisplay();
    createWeeklyForecast();
}

// Unit switcher setup
function setupUnitSwitcher() {
    document.querySelectorAll('.unit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Actieve klasse updaten
            document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Eenheid wijzigen en display updaten
            currentUnit = btn.dataset.unit;
            localStorage.setItem('selectedUnit', currentUnit);
            updateAllDisplays();
        });
    });

    // Laad opgeslagen eenheid
    const savedUnit = localStorage.getItem('selectedUnit');
    if (savedUnit) {
        currentUnit = savedUnit;
        document.querySelectorAll('.unit-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.unit === savedUnit);
        });
    }
}

// Settings panel setup
function setupSettingsPanel() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsClose = document.getElementById('settingsClose');
    const settingsOverlay = document.getElementById('settingsOverlay');
    const spotList = document.getElementById('spotList');

    // Spot lijst vullen
    spotList.innerHTML = '';
    SPOTS.forEach(spot => {
        const item = document.createElement('button');
        item.className = `spot-list-item${spot.id === currentSpot.id ? ' active' : ''}`;
        item.dataset.spotId = spot.id;
        item.innerHTML = `
            <span>${spot.name}</span>
            <span class="spot-location">${spot.location}</span>
        `;
        item.addEventListener('click', () => {
            selectSpot(spot.id);
            closeSettings();
        });
        spotList.appendChild(item);
    });

    // Gear config UI setup
    setupGearConfig();

    // Open settings
    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.add('open');
        settingsOverlay.classList.add('open');
    });

    // Close settings
    function closeSettings() {
        settingsPanel.classList.remove('open');
        settingsOverlay.classList.remove('open');
    }

    settingsClose.addEventListener('click', closeSettings);
    settingsOverlay.addEventListener('click', closeSettings);
}

// Gear configuratie UI setup
function setupGearConfig() {
    renderSailsList();
    renderBoardsList();

    // Add sail button
    document.getElementById('addSailBtn').addEventListener('click', () => {
        GEAR_CONFIG.sails.push({ size: 5.0, maxWind: 25, name: 'Nieuw zeil' });
        saveGearConfig(GEAR_CONFIG);
        renderSailsList();
        updateGearAdvice();
    });

    // Add board button
    document.getElementById('addBoardBtn').addEventListener('click', () => {
        GEAR_CONFIG.boards.push({ name: 'Nieuw board', liters: 100, maxWind: 25 });
        saveGearConfig(GEAR_CONFIG);
        renderBoardsList();
        updateGearAdvice();
    });
}

// Sorteer zeilen van groot naar klein (voor settings weergave)
function sortSailsBySize() {
    GEAR_CONFIG.sails.sort((a, b) => b.size - a.size);
}

// Render zeilen lijst
function renderSailsList() {
    const container = document.getElementById('sailsList');
    container.innerHTML = '';

    // Sorteer van groot naar klein voor weergave
    sortSailsBySize();

    GEAR_CONFIG.sails.forEach((sail, index) => {
        const item = document.createElement('div');
        item.className = 'gear-config-item';
        item.innerHTML = `
            <input type="number" step="0.1" class="gear-size" value="${sail.size}" placeholder="m²" title="Zeilgrootte in m²">
            <span class="gear-label">m²</span>
            <span class="gear-label">tot</span>
            <input type="number" class="gear-wind" value="${sail.maxWind === Infinity ? '' : sail.maxWind}" placeholder="∞" title="Max wind in knopen (leeg = onbeperkt)">
            <span class="gear-label">kn</span>
            <button class="gear-delete" title="Verwijder">&times;</button>
        `;

        // Event listeners
        const sizeInput = item.querySelector('.gear-size');
        const windInput = item.querySelector('.gear-wind');
        const deleteBtn = item.querySelector('.gear-delete');

        sizeInput.addEventListener('change', () => {
            GEAR_CONFIG.sails[index].size = parseFloat(sizeInput.value) || 5.0;
            GEAR_CONFIG.sails[index].name = sizeInput.value;
            saveGearConfig(GEAR_CONFIG);
            renderSailsList(); // Hersorteer na wijziging
            updateGearAdvice();
        });

        windInput.addEventListener('change', () => {
            const val = windInput.value.trim();
            GEAR_CONFIG.sails[index].maxWind = val === '' ? Infinity : (parseInt(val) || 25);
            saveGearConfig(GEAR_CONFIG);
            updateGearAdvice();
        });

        deleteBtn.addEventListener('click', () => {
            GEAR_CONFIG.sails.splice(index, 1);
            saveGearConfig(GEAR_CONFIG);
            renderSailsList();
            updateGearAdvice();
        });

        container.appendChild(item);
    });
}

// Render boards lijst
function renderBoardsList() {
    const container = document.getElementById('boardsList');
    container.innerHTML = '';

    GEAR_CONFIG.boards.forEach((board, index) => {
        const item = document.createElement('div');
        item.className = 'gear-config-item';
        item.innerHTML = `
            <input type="text" class="gear-name" value="${board.name}" placeholder="Board naam">
            <span class="gear-label">tot</span>
            <input type="number" class="gear-wind" value="${board.maxWind === Infinity ? '' : board.maxWind}" placeholder="∞" title="Max wind in knopen (leeg = onbeperkt)">
            <span class="gear-label">kn</span>
            <button class="gear-delete" title="Verwijder">&times;</button>
        `;

        // Event listeners
        const nameInput = item.querySelector('.gear-name');
        const windInput = item.querySelector('.gear-wind');
        const deleteBtn = item.querySelector('.gear-delete');

        nameInput.addEventListener('change', () => {
            GEAR_CONFIG.boards[index].name = nameInput.value || 'Board';
            saveGearConfig(GEAR_CONFIG);
            updateGearAdvice();
        });

        windInput.addEventListener('change', () => {
            const val = windInput.value.trim();
            GEAR_CONFIG.boards[index].maxWind = val === '' ? Infinity : (parseInt(val) || 25);
            saveGearConfig(GEAR_CONFIG);
            updateGearAdvice();
        });

        deleteBtn.addEventListener('click', () => {
            GEAR_CONFIG.boards.splice(index, 1);
            saveGearConfig(GEAR_CONFIG);
            renderBoardsList();
            updateGearAdvice();
        });

        container.appendChild(item);
    });
}

// Spot dots navigatie setup
function setupSpotDots() {
    const dotsContainer = document.getElementById('spotDots');
    dotsContainer.innerHTML = '';

    SPOTS.forEach((spot, index) => {
        const dot = document.createElement('button');
        dot.className = `spot-dot${spot.id === currentSpot.id ? ' active' : ''}`;
        dot.dataset.spotId = spot.id;
        dot.setAttribute('aria-label', spot.name);
        dot.addEventListener('click', () => selectSpot(spot.id));
        dotsContainer.appendChild(dot);
    });
}

// Swipe navigatie setup
function setupSwipeNavigation() {
    const mainGrid = document.querySelector('.main-grid');
    let touchStartX = 0;
    let touchEndX = 0;
    const minSwipeDistance = 50;

    mainGrid.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    mainGrid.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const swipeDistance = touchEndX - touchStartX;

        if (Math.abs(swipeDistance) < minSwipeDistance) return;

        const currentIndex = SPOTS.findIndex(s => s.id === currentSpot.id);

        if (swipeDistance < 0) {
            // Swipe links - volgende spot
            const nextIndex = (currentIndex + 1) % SPOTS.length;
            selectSpot(SPOTS[nextIndex].id);
        } else {
            // Swipe rechts - vorige spot
            const prevIndex = (currentIndex - 1 + SPOTS.length) % SPOTS.length;
            selectSpot(SPOTS[prevIndex].id);
        }
    }
}

// Update spot dots active state
function updateSpotDots() {
    document.querySelectorAll('.spot-dot').forEach(dot => {
        dot.classList.toggle('active', dot.dataset.spotId === currentSpot.id);
    });

    // Update spot list in settings
    document.querySelectorAll('.spot-list-item').forEach(item => {
        item.classList.toggle('active', item.dataset.spotId === currentSpot.id);
    });
}

// Spot selecteren
async function selectSpot(spotId) {
    const spot = SPOTS.find(s => s.id === spotId);
    if (!spot) return;

    currentSpot = spot;

    // UI updaten
    document.getElementById('spotName').textContent = spot.name;
    updateSpotDots();

    // Opslaan in localStorage
    localStorage.setItem('selectedSpot', spotId);

    // Data ophalen voor nieuwe spot
    await fetchAndUpdateDashboard();
}

// Data ophalen en dashboard updaten
async function fetchAndUpdateDashboard() {
    if (!currentSpot) return;

    try {
        document.getElementById('updateTime').textContent = 'Laden...';

        // Wind, marine en actuelewind.nl API's parallel ophalen
        const [windResponse, marineResponse] = await Promise.all([
            fetch(getWindApiUrl(currentSpot)),
            fetch(getMarineApiUrl(currentSpot)),
            fetchActueleWindData()
        ]);

        windData = await windResponse.json();
        marineData = await marineResponse.json();

        // Getijden uit cache halen (wordt bij init voor alle spots opgehaald)
        tideData = getTideDataForSpot(currentSpot.id);

        currentIndex = getCurrentHourIndex(windData.hourly.time);

        updateAllDisplays();
        updateTime();

        console.log(`Dashboard bijgewerkt voor ${currentSpot.name}`, { currentIndex, windData, marineData, tideData, liveStationData });

    } catch (error) {
        console.error('Fout bij ophalen data:', error);
        document.getElementById('updateTime').textContent = 'Fout bij laden data';
    }
}

// Initialisatie
document.addEventListener('DOMContentLoaded', async () => {
    // Laad opgeslagen spot of default naar IJmuiden
    const savedSpotId = localStorage.getItem('selectedSpot') || 'ijmuiden';
    currentSpot = SPOTS.find(s => s.id === savedSpotId) || SPOTS[0];

    // Update spot naam in header
    document.getElementById('spotName').textContent = currentSpot.name;

    setupUnitSwitcher();
    setupSettingsPanel();
    setupSpotDots();
    setupSwipeNavigation();
    setupGearPanel();

    // Haal getijdendata voor alle spots op (of uit 24-uur cache)
    await fetchAllTideData();

    // Haal wind/wave data op voor huidige spot
    await fetchAndUpdateDashboard();

    // Elke 10 minuten wind/wave verversen (getijden blijven gecached)
    setInterval(fetchAndUpdateDashboard, 10 * 60 * 1000);
});
