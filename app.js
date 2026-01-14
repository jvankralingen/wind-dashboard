// Wind Dashboard App

// RWS Wind API - realtime meetstationdata van Rijkswaterstaat
const RWS_API_BASE = 'https://rws-api-bay.vercel.app/api';

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
    return `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m&daily=sunrise,sunset&timezone=Europe%2FAmsterdam&past_days=2`;
}

function getMarineApiUrl(spot) {
    return `https://marine-api.open-meteo.com/v1/marine?latitude=${spot.lat}&longitude=${spot.lon}&hourly=wave_height,wave_direction,wave_period&timezone=Europe%2FAmsterdam&past_days=2`;
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

    const degreesEl = document.getElementById('directionDegrees');
    if (degreesEl) {
        degreesEl.textContent = `${Math.round(degrees)}°`;
    }

    document.getElementById('directionText').textContent = getDirectionName(degrees);
}

// Golf info updaten (van Open-Meteo marine API)
function updateWaveInfo() {
    if (!marineData || !marineData.hourly) return;

    const waveHeight = marineData.hourly.wave_height[currentIndex];
    const wavePeriod = marineData.hourly.wave_period[currentIndex];
    const waveDirection = marineData.hourly.wave_direction ? marineData.hourly.wave_direction[currentIndex] : null;

    const heightEl = document.getElementById('waveHeight');
    const periodEl = document.getElementById('wavePeriod');
    const directionEl = document.getElementById('waveDirection');

    if (heightEl) {
        heightEl.textContent = waveHeight !== null ? waveHeight.toFixed(1) : '--';
    }
    if (periodEl) {
        periodEl.textContent = wavePeriod !== null ? Math.round(wavePeriod) : '--';
    }
    if (directionEl) {
        directionEl.textContent = waveDirection !== null ? getDirectionName(waveDirection) : '--';
    }
}

// Getijden info updaten
function updateTideInfo() {
    if (!tideData || !tideData.extremes || tideData.extremes.length === 0) {
        return;
    }

    const now = new Date();
    const extremes = tideData.extremes;

    // Vind de volgende twee getijden
    let nextTide = null;
    let afterTide = null;

    for (let i = 0; i < extremes.length; i++) {
        const tideTime = new Date(extremes[i].time);
        if (tideTime > now) {
            nextTide = extremes[i];
            if (i + 1 < extremes.length) {
                afterTide = extremes[i + 1];
            }
            break;
        }
    }

    // Update volgende getij
    const nextTimeEl = document.getElementById('nextTideTime');
    const nextTypeEl = document.getElementById('nextTideType');
    const nextIconEl = document.getElementById('tideIcon');

    if (nextTide && nextTimeEl) {
        const nextTime = new Date(nextTide.time);
        nextTimeEl.textContent = nextTime.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
        nextTypeEl.textContent = nextTide.type === 'high' ? 'HW' : 'LW';
        nextIconEl.textContent = nextTide.type === 'high' ? '↑' : '↓';
    }

    // Update getij daarna
    const afterTimeEl = document.getElementById('afterTideTime');
    const afterTypeEl = document.getElementById('afterTideType');
    const afterIconEl = document.getElementById('tideIconAfter');

    if (afterTide && afterTimeEl) {
        const afterTime = new Date(afterTide.time);
        afterTimeEl.textContent = afterTime.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
        afterTypeEl.textContent = afterTide.type === 'high' ? 'HW' : 'LW';
        afterIconEl.textContent = afterTide.type === 'high' ? '↑' : '↓';
    }
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

// Live meetstationdata via RWS API (Rijkswaterstaat)
let rwsWindData = null;
let rwsForecastData = null;
let liveStationData = null;

async function fetchRWSWindData() {
    if (!currentSpot || !currentSpot.rwsWindId) {
        console.log('Geen RWS wind locatie voor deze spot');
        return null;
    }

    try {
        const url = `${RWS_API_BASE}/wind/actueel?locatie=${currentSpot.rwsWindId}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.success && data.data && data.data.length > 0) {
            rwsWindData = data;
            console.log('RWS wind data opgehaald:', data.locatieNaam, data.count, 'metingen');
            return data;
        }
    } catch (error) {
        console.error('Fout bij ophalen RWS wind data:', error);
    }
    return null;
}

async function fetchRWSForecast() {
    if (!currentSpot || !currentSpot.rwsWindId) {
        return null;
    }

    try {
        const url = `${RWS_API_BASE}/wind/forecast?locatie=${currentSpot.rwsWindId}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.success && data.data && data.data.length > 0) {
            rwsForecastData = data;
            console.log('RWS forecast opgehaald:', data.count, 'punten');
            return data;
        }
    } catch (error) {
        console.error('Fout bij ophalen RWS forecast:', error);
    }
    return null;
}

// Haal meetstationdata op voor een specifieke spot
function getStationDataForSpot(spot) {
    if (!rwsWindData || !rwsWindData.data || rwsWindData.data.length === 0) {
        return null;
    }

    // Pak de meest recente meting
    const latest = rwsWindData.data[rwsWindData.data.length - 1];

    console.log(`RWS meetstation ${rwsWindData.locatieNaam} voor ${spot.name}:`, {
        windsnelheidMS: latest.windsnelheid + ' m/s',
        richting: latest.windrichting + '°',
        tijd: latest.tijdstip
    });

    // Converteer naar format dat rest van app verwacht
    return {
        stationname: rwsWindData.locatieNaam,
        windspeed: latest.windsnelheid,
        windgusts: null, // RWS API geeft geen vlagen (voorlopig)
        winddirectiondegrees: latest.windrichting,
        winddirection: getDirectionName(latest.windrichting),
        windspeedBft: getBeaufort(latest.windsnelheid * 3.6),
        temperature: null // RWS API geeft geen temperatuur
    };
}

// Huidige condities updaten (met live RWS meetstationdata indien beschikbaar)
function updateCurrentConditions() {
    if (!windData) return;

    let speedDisplay, direction;

    // Gebruik live RWS meetstationdata indien beschikbaar
    liveStationData = getStationDataForSpot(currentSpot);

    if (liveStationData) {
        // RWS geeft windsnelheid in m/s, converteer naar gewenste eenheid
        const windSpeedMS = liveStationData.windspeed; // m/s

        switch (currentUnit) {
            case 'kn':
                speedDisplay = Math.round(windSpeedMS * 1.94384);
                break;
            case 'ms':
                speedDisplay = windSpeedMS.toFixed(1);
                break;
            case 'bft':
                speedDisplay = liveStationData.windspeedBft;
                break;
            default:
                speedDisplay = Math.round(windSpeedMS * 3.6);
        }

        // Windrichting van meetstation (in graden)
        direction = liveStationData.winddirectiondegrees;

        console.log('Actuele condities van RWS meetstation:', {
            station: liveStationData.stationname,
            windMS: windSpeedMS,
            windKnots: Math.round(windSpeedMS * 1.94384),
            direction: direction,
            directionName: liveStationData.winddirection
        });

        document.getElementById('currentSpeed').textContent = speedDisplay;
    } else {
        // Fallback naar Open-Meteo voorspellingsdata
        const speed = windData.hourly.wind_speed_10m[currentIndex];
        direction = windData.hourly.wind_direction_10m[currentIndex];

        document.getElementById('currentSpeed').textContent = formatWindSpeed(speed, false);

        console.log('Geen meetstationdata - gebruik Open-Meteo voorspelling');
    }

    document.getElementById('windUnit').textContent = getCurrentUnitLabel();

    // Update windrichting met graden
    updateWindDirection(direction);

    // Update golf info (van Open-Meteo marine API)
    updateWaveInfo();

    // Update getijden info
    updateTideInfo();

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

    // Data arrays
    const labels = [];
    const speeds = [];
    const waves = [];
    const barColors = [];

    const now = new Date();
    let nowIndex = -1;

    // Helper: maak label met dag indicator
    function makeLabel(time, prevTime) {
        const hour = time.getHours();
        if (!prevTime || time.toDateString() !== prevTime.toDateString()) {
            const dayNames = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
            return `${dayNames[time.getDay()]} ${hour}:00`;
        }
        return `${hour}:00`;
    }

    // Combineer Open-Meteo (verleden) + RWS forecast (toekomst)
    const allPoints = [];
    const minTime = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const maxTime = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Voeg Open-Meteo data toe (verleden + vandaag)
    if (windData && windData.hourly) {
        for (let i = 0; i < windData.hourly.time.length; i++) {
            const time = new Date(windData.hourly.time[i]);
            if (time >= minTime && time <= now) {
                // Open-Meteo is in km/h, converteer naar m/s voor consistentie
                const speedKmh = windData.hourly.wind_speed_10m[i];
                allPoints.push({
                    time: time,
                    windsnelheid: speedKmh / 3.6, // naar m/s
                    type: 'verleden'
                });
            }
        }
    }

    // Voeg RWS forecast data toe (toekomst), of fallback naar Open-Meteo
    if (rwsForecastData && rwsForecastData.data && rwsForecastData.data.length > 0) {
        for (const point of rwsForecastData.data) {
            const time = new Date(point.tijdstip);
            if (time > now && time <= maxTime) {
                allPoints.push({
                    time: time,
                    windsnelheid: point.windsnelheid, // al in m/s
                    type: 'forecast'
                });
            }
        }
    } else if (windData && windData.hourly) {
        // Fallback: gebruik Open-Meteo voor toekomst
        for (let i = 0; i < windData.hourly.time.length; i++) {
            const time = new Date(windData.hourly.time[i]);
            if (time > now && time <= maxTime) {
                const speedKmh = windData.hourly.wind_speed_10m[i];
                allPoints.push({
                    time: time,
                    windsnelheid: speedKmh / 3.6,
                    type: 'forecast'
                });
            }
        }
    }

    // Sorteer op tijd
    allPoints.sort((a, b) => a.time - b.time);

    // Filter duplicaten (houd per uur 1 punt)
    const filteredPoints = [];
    let lastHour = null;
    for (const point of allPoints) {
        const hourKey = point.time.toISOString().slice(0, 13);
        if (hourKey !== lastHour) {
            filteredPoints.push(point);
            lastHour = hourKey;
        }
    }

    // Bouw chart data
    let prevTime = null;
    for (let i = 0; i < filteredPoints.length; i++) {
        const point = filteredPoints[i];
        const time = point.time;

        labels.push(makeLabel(time, prevTime));
        prevTime = time;

        // RWS geeft windsnelheid in m/s
        const speedMS = point.windsnelheid;
        const speedKmh = speedMS * 3.6;
        const speedValue = parseFloat(formatWindSpeed(speedKmh, false));
        speeds.push(speedValue);

        // Vind "nu" index (dichtstbijzijnde punt)
        const isNow = nowIndex === -1 && time >= now;
        if (isNow) {
            nowIndex = i;
            // Markeer "nu" in het label
            labels[labels.length - 1] = 'NU';
        }

        // Kleur: verleden = gedimde kleur, NU = oranje highlight, toekomst = volle kleur
        const isPast = time < now;
        if (isNow) {
            barColors.push('#f59e0b'); // Oranje voor NU
        } else if (isPast) {
            barColors.push('rgba(34, 197, 94, 0.4)');
        } else {
            barColors.push('#22c55e');
        }

        // Golf data van Open-Meteo
        const timeDate = time.toISOString().slice(0, 10);
        const openMeteoIndex = windData.hourly.time.findIndex(t =>
            new Date(t).getHours() === time.getHours() &&
            new Date(t).toISOString().slice(0, 10) === timeDate
        );
        if (openMeteoIndex >= 0 && marineData && marineData.hourly.wave_height[openMeteoIndex] !== null) {
            waves.push(marineData.hourly.wave_height[openMeteoIndex]);
        } else {
            waves.push(null);
        }
    }

    if (forecastChart) {
        forecastChart.destroy();
    }

    const datasets = [];

    // Wind bars
    datasets.push({
        label: `Wind (${getCurrentUnitLabel()})`,
        data: speeds,
        backgroundColor: barColors,
        borderColor: barColors.map(c => {
            if (c === '#f59e0b') return '#d97706'; // Oranje border voor NU
            if (c === '#22c55e') return '#16a34a';
            return 'rgba(22, 163, 74, 0.4)';
        }),
        borderWidth: 1,
        borderRadius: 3,
        yAxisID: 'y',
        order: 1
    });

    // Golven lijn
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

    console.log('Chart data:', { points: filteredPoints.length, nowIndex });

    // Bereken breedte: 30px per bar, minimum container breedte
    const barWidth = 30;
    const chartWidth = Math.max(filteredPoints.length * barWidth, 600);
    const chartInner = document.getElementById('chartInner');
    const scrollContainer = document.getElementById('chartScrollContainer');

    // Bereken padding zodat eerste en laatste uur ook op 1/5 positie kunnen staan
    const containerWidth = scrollContainer ? scrollContainer.clientWidth : 400;
    const scrollPadding = Math.round(containerWidth / 5); // 1/5 van container breedte
    const scrollPaddingEnd = Math.round(containerWidth * 4 / 5); // 4/5 voor het eind

    if (chartInner) {
        chartInner.style.width = chartWidth + 'px';
        chartInner.style.marginLeft = scrollPadding + 'px';
        chartInner.style.marginRight = scrollPaddingEnd + 'px';
    }

    // Canvas afmetingen instellen
    const canvas = document.getElementById('forecastChart');
    canvas.width = chartWidth;
    canvas.height = 180;

    // Sla chart data op voor scroll-interactie
    window.chartDataPoints = filteredPoints;
    window.chartNowIndex = nowIndex;
    window.chartBarWidth = barWidth;
    window.chartActiveIndex = nowIndex; // Actieve index (begint bij nu)

    // Plugin voor achtergrondkader bij actieve bar
    const activeBarPlugin = {
        id: 'activeBar',
        beforeDraw: (chart) => {
            const activeIndex = window.chartActiveIndex;
            if (activeIndex < 0 || activeIndex >= chart.data.labels.length) return;

            const ctx = chart.ctx;
            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y;
            const meta = chart.getDatasetMeta(0);

            if (!meta.data[activeIndex]) return;

            // Bereken positie en breedte van de actieve bar
            const bar = meta.data[activeIndex];
            const barWidth = bar.width || 20;
            const padding = 4;

            // Teken achtergrondkader
            ctx.save();
            ctx.fillStyle = 'rgba(245, 158, 11, 0.15)'; // Oranje met lage opacity
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);

            const x = bar.x - barWidth / 2 - padding;
            const y = yAxis.top;
            const width = barWidth + padding * 2;
            const height = yAxis.bottom - yAxis.top;

            // Rounded rectangle
            const radius = 4;
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();

            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    };

    forecastChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        plugins: [activeBarPlugin],
        options: {
            responsive: false,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
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
                            size: 9
                        },
                        maxRotation: 45,
                        minRotation: 45
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

    // Scroll naar "nu" - door de margin staat nu op 1/5 van links
    if (scrollContainer && nowIndex >= 0) {
        setTimeout(() => {
            scrollContainer.scrollLeft = nowIndex * barWidth;
        }, 100);
    }

    // Scroll listener voor live update van samenvatting
    if (scrollContainer) {
        // Verwijder oude listener
        scrollContainer.removeEventListener('scroll', handleChartScroll);
        scrollContainer.addEventListener('scroll', handleChartScroll);
    }
}

// Debounce timer voor scroll reset
let scrollResetTimer = null;

// Handler voor chart scroll - update samenvatting met waardes van zichtbaar punt
function handleChartScroll() {
    const scrollContainer = document.getElementById('chartScrollContainer');
    const chartPoints = window.chartDataPoints;
    const barWidth = window.chartBarWidth || 30;
    const nowIndex = window.chartNowIndex;

    if (!scrollContainer || !chartPoints || chartPoints.length === 0) return;

    // Bereken welke bar op 1/5 van links staat (daar is de highlight)
    // Door de marginLeft op de chart is scrollLeft=0 al bij het eerste datapunt
    const scrollLeft = scrollContainer.scrollLeft;
    const activeIndex = Math.round(scrollLeft / barWidth);

    // Begrens tot geldige index
    const pointIndex = Math.max(0, Math.min(activeIndex, chartPoints.length - 1));
    const point = chartPoints[pointIndex];

    if (!point) return;

    // Update actieve index en herteken chart
    if (window.chartActiveIndex !== pointIndex) {
        window.chartActiveIndex = pointIndex;
        if (forecastChart) {
            forecastChart.draw();
        }
    }

    // Update titel en tijd
    const titleEl = document.getElementById('conditionsTitle');
    const timeEl = document.getElementById('conditionsTime');

    const isAtNow = pointIndex === nowIndex;

    if (isAtNow) {
        // Bij "nu" - toon normale weergave
        titleEl.textContent = 'Nu';
        titleEl.classList.add('now-active');
        timeEl.textContent = '';
        timeEl.classList.remove('scrolling');

        // Reset naar actuele waardes
        updateCurrentConditions();
    } else {
        titleEl.classList.remove('now-active');
        // Bij ander tijdstip - toon datum/tijd
        const time = point.time;
        const dayNames = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
        const dayName = dayNames[time.getDay()];
        const hours = time.getHours().toString().padStart(2, '0');

        titleEl.textContent = `${dayName} ${hours}:00`;
        timeEl.textContent = '';
        timeEl.classList.add('scrolling');

        // Update wind waarde
        const speedMS = point.windsnelheid;
        const speedKmh = speedMS * 3.6;
        document.getElementById('currentSpeed').textContent = formatWindSpeed(speedKmh, false);

        // Zoek bijbehorende wind richting in Open-Meteo data
        const timeStr = time.toISOString().slice(0, 13);
        if (windData && windData.hourly) {
            const idx = windData.hourly.time.findIndex(t => t.startsWith(timeStr.slice(0, 13)));
            if (idx >= 0) {
                const dir = windData.hourly.wind_direction_10m[idx];
                updateWindDirection(dir);

                // Update golf data als beschikbaar
                if (marineData && marineData.hourly) {
                    const waveHeight = marineData.hourly.wave_height[idx];
                    const wavePeriod = marineData.hourly.wave_period[idx];
                    const waveDir = marineData.hourly.wave_direction[idx];

                    if (waveHeight !== null) {
                        document.getElementById('waveHeight').textContent = waveHeight.toFixed(1);
                    }
                    if (wavePeriod !== null) {
                        document.getElementById('wavePeriod').textContent = Math.round(wavePeriod);
                    }
                    if (waveDir !== null) {
                        document.getElementById('waveDirection').textContent = getDirectionName(waveDir);
                    }
                }
            }
        }
    }

    // Reset naar "nu" na 3 seconden zonder scrollen
    clearTimeout(scrollResetTimer);
    scrollResetTimer = setTimeout(() => {
        const titleEl = document.getElementById('conditionsTitle');
        const timeEl = document.getElementById('conditionsTime');
        titleEl.textContent = 'Nu';
        timeEl.textContent = '';
        timeEl.classList.remove('scrolling');
        updateCurrentConditions();
    }, 3000);
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

    // Gebruik RWS forecast indien beschikbaar
    const useRWSForecast = rwsForecastData && rwsForecastData.data && rwsForecastData.data.length > 0;

    if (useRWSForecast) {
        // RWS forecast data gebruiken
        const now = new Date();
        let itemsAdded = 0;
        let isFirst = true;

        for (const point of rwsForecastData.data) {
            if (itemsAdded >= 24) break;

            const time = new Date(point.tijdstip);

            // Alleen toekomstige punten
            if (time < now) continue;

            // RWS geeft windsnelheid in m/s
            const speedMS = point.windsnelheid;
            const speedKmh = speedMS * 3.6;
            const direction = point.windrichting;

            const speed = formatWindSpeed(speedKmh, false);

            const item = document.createElement('div');
            item.className = `hourly-item${isFirst ? ' current' : ''}`;
            isFirst = false;

            // Golven uit Open-Meteo
            let waveHtml = '';
            const timeDate = time.toISOString().slice(0, 10);
            const openMeteoIndex = windData.hourly.time.findIndex(t =>
                new Date(t).getHours() === time.getHours() &&
                new Date(t).toISOString().slice(0, 10) === timeDate
            );
            if (openMeteoIndex >= 0 && marineData && marineData.hourly.wave_height[openMeteoIndex] !== null) {
                waveHtml = `<div class="hourly-wave">🌊 ${marineData.hourly.wave_height[openMeteoIndex].toFixed(1)}m</div>`;
            }

            item.innerHTML = `
                <div class="hourly-time">${time.getHours()}:00</div>
                <div class="hourly-speed">${speed}</div>
                <div class="hourly-label">${getCurrentUnitLabel()}</div>
                <div class="hourly-gusts">⚡ --</div>
                ${waveHtml}
                <div class="hourly-direction">
                    <span class="hourly-arrow" style="transform: rotate(${direction}deg)">↓</span>
                    ${getDirectionName(direction)}
                </div>
            `;

            container.appendChild(item);
            itemsAdded++;
        }
    } else {
        // Fallback: Open-Meteo data
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
    createForecastChart();
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

// Render zeilen lijst
function renderSailsList() {
    const container = document.getElementById('sailsList');
    container.innerHTML = '';

    // Sorteer de array zelf (groot naar klein) en sla op
    GEAR_CONFIG.sails.sort((a, b) => b.size - a.size);
    saveGearConfig(GEAR_CONFIG);

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

        // Event listeners met closure over huidige sail object
        const sizeInput = item.querySelector('.gear-size');
        const windInput = item.querySelector('.gear-wind');
        const deleteBtn = item.querySelector('.gear-delete');

        sizeInput.addEventListener('change', () => {
            sail.size = parseFloat(sizeInput.value) || 5.0;
            sail.name = sizeInput.value;
            saveGearConfig(GEAR_CONFIG);
            renderSailsList();
            updateGearAdvice();
        });

        windInput.addEventListener('change', () => {
            const val = windInput.value.trim();
            sail.maxWind = val === '' ? Infinity : (parseInt(val) || 25);
            saveGearConfig(GEAR_CONFIG);
            updateGearAdvice();
        });

        deleteBtn.addEventListener('click', () => {
            const idx = GEAR_CONFIG.sails.indexOf(sail);
            if (idx > -1) {
                GEAR_CONFIG.sails.splice(idx, 1);
                saveGearConfig(GEAR_CONFIG);
                renderSailsList();
                updateGearAdvice();
            }
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

        // Event listeners met closure over huidige board object
        const nameInput = item.querySelector('.gear-name');
        const windInput = item.querySelector('.gear-wind');
        const deleteBtn = item.querySelector('.gear-delete');

        nameInput.addEventListener('change', () => {
            board.name = nameInput.value || 'Board';
            saveGearConfig(GEAR_CONFIG);
            updateGearAdvice();
        });

        windInput.addEventListener('change', () => {
            const val = windInput.value.trim();
            board.maxWind = val === '' ? Infinity : (parseInt(val) || 25);
            saveGearConfig(GEAR_CONFIG);
            updateGearAdvice();
        });

        deleteBtn.addEventListener('click', () => {
            const idx = GEAR_CONFIG.boards.indexOf(board);
            if (idx > -1) {
                GEAR_CONFIG.boards.splice(idx, 1);
                saveGearConfig(GEAR_CONFIG);
                renderBoardsList();
                updateGearAdvice();
            }
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

        // Wind, marine en RWS API's parallel ophalen
        const [windResponse, marineResponse] = await Promise.all([
            fetch(getWindApiUrl(currentSpot)),
            fetch(getMarineApiUrl(currentSpot)),
            fetchRWSWindData(),
            fetchRWSForecast()
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
