// Windsurf Spots Database

// Default gear configuratie - windsnelheid in knopen
const DEFAULT_GEAR_CONFIG = {
    sails: [
        { size: 7.0, maxWind: 18, name: '7.0' },
        { size: 6.0, maxWind: 22, name: '6.0' },
        { size: 5.2, maxWind: 26, name: '5.2' },
        { size: 4.5, maxWind: 30, name: '4.5' },
        { size: 4.0, maxWind: Infinity, name: '4.0' }
    ],
    boards: [
        { name: 'Freeride 130L', liters: 130, maxWind: 18 },
        { name: 'Freewave 105L', liters: 105, maxWind: 24 },
        { name: 'Wave 85L', liters: 85, maxWind: Infinity }
    ]
};

// Gear configuratie laden uit localStorage of default gebruiken
function loadGearConfig() {
    try {
        const saved = localStorage.getItem('gearConfig');
        if (saved) {
            const config = JSON.parse(saved);
            // Zorg dat maxWind Infinity correct wordt behandeld
            config.sails = config.sails.map(s => ({
                ...s,
                maxWind: s.maxWind === null || s.maxWind === 'Infinity' ? Infinity : s.maxWind
            }));
            config.boards = config.boards.map(b => ({
                ...b,
                maxWind: b.maxWind === null || b.maxWind === 'Infinity' ? Infinity : b.maxWind
            }));
            return config;
        }
    } catch (e) {
        console.error('Fout bij laden gear config:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_GEAR_CONFIG));
}

// Gear configuratie opslaan in localStorage
function saveGearConfig(config) {
    try {
        // Converteer Infinity naar null voor JSON
        const toSave = {
            sails: config.sails.map(s => ({
                ...s,
                maxWind: s.maxWind === Infinity ? null : s.maxWind
            })),
            boards: config.boards.map(b => ({
                ...b,
                maxWind: b.maxWind === Infinity ? null : b.maxWind
            }))
        };
        localStorage.setItem('gearConfig', JSON.stringify(toSave));
    } catch (e) {
        console.error('Fout bij opslaan gear config:', e);
    }
}

// Huidige gear config (wordt geladen bij init)
let GEAR_CONFIG = loadGearConfig();

// Sorteer gear op maxWind (kleinste eerst, Infinity laatste)
function sortGear() {
    GEAR_CONFIG.sails.sort((a, b) => {
        if (a.maxWind === Infinity) return 1;
        if (b.maxWind === Infinity) return -1;
        return a.maxWind - b.maxWind;
    });
    GEAR_CONFIG.boards.sort((a, b) => {
        if (a.maxWind === Infinity) return 1;
        if (b.maxWind === Infinity) return -1;
        return a.maxWind - b.maxWind;
    });
}

// Bepaal aanbevolen gear op basis van windsnelheid (in knopen)
function getGearAdvice(windKnots) {
    if (windKnots < 12 || GEAR_CONFIG.sails.length === 0) {
        return { sail: null, board: null, message: 'Te weinig wind' };
    }

    sortGear();

    const sail = GEAR_CONFIG.sails.find(s => windKnots < s.maxWind);
    const board = GEAR_CONFIG.boards.find(b => windKnots < b.maxWind);

    return {
        sail: sail ? sail.size : (GEAR_CONFIG.sails.length > 0 ? GEAR_CONFIG.sails[GEAR_CONFIG.sails.length - 1].size : null),
        board: board ? board.name : (GEAR_CONFIG.boards.length > 0 ? GEAR_CONFIG.boards[GEAR_CONFIG.boards.length - 1].name : null),
        message: null
    };
}

// Maak gear functies globaal beschikbaar
window.GEAR_CONFIG = GEAR_CONFIG;
window.DEFAULT_GEAR_CONFIG = DEFAULT_GEAR_CONFIG;
window.getGearAdvice = getGearAdvice;
window.loadGearConfig = loadGearConfig;
window.saveGearConfig = saveGearConfig;
window.sortGear = sortGear;

const SPOTS = [
    {
        id: 'wijk-aan-zee',
        name: 'Wijk aan Zee',
        location: 'Noord-Holland',
        lat: 52.4963,
        lon: 4.6025,
        actueleWindId: '6225', // Meetstation IJmuiden - actuelewind.nl
        tideLocation: 'IJmuiden-Netherlands', // tide-forecast.com locatie
        type: 'strand',
        bestWind: ['NW', 'W', 'ZW'],
        description: 'Breed zandstrand, goed voor beginners bij weinig wind',
        parkeren: 'Betaald parkeren bij strand'
    },
    {
        id: 'ijmuiden',
        name: 'IJmuiden',
        location: 'Noord-Holland',
        lat: 52.4647,
        lon: 4.5917,
        actueleWindId: '6225', // Meetstation IJmuiden - actuelewind.nl
        tideLocation: 'IJmuiden-Netherlands',
        type: 'strand',
        bestWind: ['NW', 'W', 'ZW'],
        description: 'Populaire spot bij zuidpier, let op stroming bij havenmond',
        parkeren: 'Gratis parkeren mogelijk'
    },
    {
        id: 'hoek-van-holland',
        name: 'Hoek van Holland',
        location: 'Zuid-Holland',
        lat: 51.9775,
        lon: 4.1231,
        actueleWindId: '6330', // Meetstation Hoek van Holland - actuelewind.nl
        tideLocation: 'Hoek-van-Holland-Netherlands',
        type: 'strand',
        bestWind: ['ZW', 'W', 'NW'],
        description: 'Groot strand, goede golven bij westenwind',
        parkeren: 'Betaald parkeren'
    },
    {
        id: 'maasvlakte',
        name: 'Maasvlakte 2',
        location: 'Zuid-Holland',
        lat: 51.9483,
        lon: 4.0333,
        actueleWindId: '6330', // Meetstation Hoek van Holland - actuelewind.nl
        tideLocation: 'Hoek-van-Holland-Netherlands',
        type: 'strand',
        bestWind: ['ZW', 'W', 'NW', 'N'],
        description: 'Nieuw strand, vaak rustig, goede condities',
        parkeren: 'Gratis parkeren'
    },
    {
        id: 'ouddorp',
        name: 'Ouddorp',
        location: 'Zuid-Holland',
        lat: 51.8167,
        lon: 3.9167,
        actueleWindId: '6310', // Meetstation Vlissingen - actuelewind.nl
        tideLocation: 'Brouwershaven-Netherlands',
        type: 'strand',
        bestWind: ['ZW', 'W', 'NW'],
        description: 'Brouwersdam nabij, keuze uit zee of binnenwater',
        parkeren: 'Betaald parkeren in seizoen'
    },
    {
        id: 'domburg',
        name: 'Domburg',
        location: 'Zeeland',
        lat: 51.5642,
        lon: 3.4989,
        actueleWindId: '6310', // Meetstation Vlissingen - actuelewind.nl
        tideLocation: 'Vlissingen-Netherlands',
        type: 'strand',
        bestWind: ['NW', 'W', 'ZW'],
        description: 'Mooie spot in Zeeland, kan druk zijn in zomer',
        parkeren: 'Betaald parkeren'
    }
];

// Haversine formule voor afstandsberekening (in km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius van de aarde in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Geschatte rijtijd (simpele schatting: 60km/h gemiddeld)
function estimateDriveTime(distanceKm) {
    const hours = distanceKm / 60;
    if (hours < 1) {
        return `${Math.round(hours * 60)} min`;
    }
    return `${Math.floor(hours)}u ${Math.round((hours % 1) * 60)}min`;
}

// Wind/golf data ophalen voor een spot
async function fetchSpotData(spot) {
    const windUrl = `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m&timezone=Europe%2FAmsterdam`;
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${spot.lat}&longitude=${spot.lon}&hourly=wave_height,wave_direction,wave_period&timezone=Europe%2FAmsterdam`;

    try {
        const [windResponse, marineResponse] = await Promise.all([
            fetch(windUrl),
            fetch(marineUrl)
        ]);

        const windData = await windResponse.json();
        const marineData = await marineResponse.json();

        return {
            spot: spot,
            wind: windData,
            marine: marineData
        };
    } catch (error) {
        console.error(`Fout bij ophalen data voor ${spot.name}:`, error);
        return null;
    }
}

// Data ophalen voor alle spots
async function fetchAllSpotsData() {
    const promises = SPOTS.map(spot => fetchSpotData(spot));
    const results = await Promise.all(promises);
    return results.filter(r => r !== null);
}

// Condities op een bepaald tijdstip ophalen
function getConditionsAtTime(spotData, hoursFromNow = 0) {
    const now = new Date();
    const targetTime = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
    const targetHour = targetTime.toISOString().slice(0, 13);

    const windTimes = spotData.wind.hourly.time;
    let index = windTimes.findIndex(t => t.startsWith(targetHour));

    if (index === -1) {
        // Fallback: vind dichtstbijzijnde
        index = 0;
    }

    const windSpeed = spotData.wind.hourly.wind_speed_10m[index];
    const windGusts = spotData.wind.hourly.wind_gusts_10m[index];
    const windDir = spotData.wind.hourly.wind_direction_10m[index];

    let waveHeight = null;
    let wavePeriod = null;
    if (spotData.marine && spotData.marine.hourly) {
        waveHeight = spotData.marine.hourly.wave_height[index];
        wavePeriod = spotData.marine.hourly.wave_period[index];
    }

    return {
        time: targetTime,
        windSpeedKmh: windSpeed,
        windSpeedKnots: windSpeed / 1.852,
        windGusts: windGusts,
        windGustsKnots: windGusts / 1.852,
        windDirection: windDir,
        windDirectionName: getDirectionName(windDir),
        waveHeight: waveHeight,
        wavePeriod: wavePeriod,
        beaufort: getBeaufortFromKmh(windSpeed)
    };
}

// Helper: windrichting naam
function getDirectionName(degrees) {
    const directions = ['N', 'NNO', 'NO', 'ONO', 'O', 'OZO', 'ZO', 'ZZO', 'Z', 'ZZW', 'ZW', 'WZW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

// Helper: Beaufort van km/h
function getBeaufortFromKmh(kmh) {
    const limits = [1, 5, 11, 19, 28, 38, 49, 61, 74, 88, 102, 117];
    for (let i = 0; i < limits.length; i++) {
        if (kmh <= limits[i]) return i;
    }
    return 12;
}

// Score berekenen voor windsurf condities
function calculateWindsurfScore(conditions, spot) {
    let score = 0;

    // Wind score (ideaal 15-25 knopen voor windsurfen)
    const knots = conditions.windSpeedKnots;
    if (knots >= 12 && knots <= 30) {
        if (knots >= 15 && knots <= 25) {
            score += 40; // Perfecte wind
        } else if (knots >= 12 && knots < 15) {
            score += 25; // Licht maar planeerbaar
        } else {
            score += 30; // Sterk maar goed
        }
    } else if (knots >= 8 && knots < 12) {
        score += 10; // Marginaal
    }

    // Wind richting score
    if (spot.bestWind.includes(conditions.windDirectionName)) {
        score += 30;
    } else if (spot.bestWind.some(dir => conditions.windDirectionName.includes(dir.charAt(0)))) {
        score += 15;
    }

    // Consistentie (verschil wind vs vlagen)
    const gustFactor = conditions.windGusts / conditions.windSpeedKmh;
    if (gustFactor < 1.3) {
        score += 20; // Stabiele wind
    } else if (gustFactor < 1.5) {
        score += 10; // Redelijk stabiel
    }

    // Golf score (voor wave riding, optioneel)
    if (conditions.waveHeight !== null) {
        if (conditions.waveHeight >= 0.5 && conditions.waveHeight <= 2.0) {
            score += 10;
        }
    }

    return Math.min(100, score);
}

// Export voor gebruik in andere files
window.SPOTS = SPOTS;
window.calculateDistance = calculateDistance;
window.estimateDriveTime = estimateDriveTime;
window.fetchSpotData = fetchSpotData;
window.fetchAllSpotsData = fetchAllSpotsData;
window.getConditionsAtTime = getConditionsAtTime;
window.calculateWindsurfScore = calculateWindsurfScore;
