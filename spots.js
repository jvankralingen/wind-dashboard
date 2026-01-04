// Windsurf Spots Database
// buienradarId verwijst naar het dichtstbijzijnde KNMI meetstation

// Gear configuratie - windsnelheid in knopen
// Zeil specs: S2Maui Dragon - mast, imcs, luff, boom, downhaul, head, battens
const GEAR_CONFIG = {
    sails: [
        {
            size: 5.2,
            maxWind: 21,
            brand: 'S2Maui Dragon',
            specs: { mast: 400, imcs: 19, luff: 409, boom: 171, downhaul: 9, head: 'Fixed', battens: 4 }
        },
        {
            size: 4.6,
            maxWind: 26,
            brand: 'S2Maui Dragon',
            specs: { mast: 370, imcs: 17, luff: 383, boom: 162, downhaul: 13, head: 'Fixed', battens: 4 }
        },
        {
            size: 4.2,
            maxWind: 28,
            brand: 'S2Maui Dragon',
            specs: { mast: '340/370', imcs: '15/17', luff: 364, boom: 155, downhaul: '25/5', head: '1/11', battens: 4 }
        },
        {
            size: 3.8,
            maxWind: 30,
            brand: 'S2Maui Dragon',
            specs: { mast: '340/370', imcs: '15/17', luff: 348, boom: 147, downhaul: '9/5', head: '1/27', battens: 4 }
        },
        {
            size: 3.4,
            maxWind: Infinity,
            brand: 'S2Maui Dragon',
            specs: { mast: 340, imcs: 15, luff: 341, boom: 141, downhaul: 5, head: 4, battens: 4 }
        }
    ],
    boards: [
        { name: 'Flikka 99L', brand: 'Flikka', model: 'Compact Wave', liters: 99, maxWind: 21 },
        { name: 'Goya 85L', brand: 'Goya', model: 'Nitro 2', liters: 85, maxWind: Infinity }
    ]
};

// Bepaal aanbevolen gear op basis van windsnelheid (in knopen)
function getGearAdvice(windKnots) {
    if (windKnots < 15) {
        return { sail: null, board: null, message: 'Te weinig wind' };
    }

    const sail = GEAR_CONFIG.sails.find(s => windKnots < s.maxWind);
    const board = GEAR_CONFIG.boards.find(b => windKnots < b.maxWind);

    return {
        sail: sail ? sail.size : GEAR_CONFIG.sails[GEAR_CONFIG.sails.length - 1].size,
        board: board ? board.name : GEAR_CONFIG.boards[GEAR_CONFIG.boards.length - 1].name,
        message: null
    };
}

// Maak gear functies globaal beschikbaar
window.GEAR_CONFIG = GEAR_CONFIG;
window.getGearAdvice = getGearAdvice;

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
