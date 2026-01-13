#!/usr/bin/env node

/**
 * RWS Water Data Test Script
 * Test Rijkswaterstaat WaterWebservices API voor getijden
 *
 * Gebruik: node test-rws.js
 */

// API Base URL (nieuwe API)
const API_BASE = 'https://ddapi20-waterwebservices.rijkswaterstaat.nl';

// Locaties voor windsurf spots
const SPOT_LOCATIONS = {
    'ijmuiden': 'IJmuiden',
    'hoek-van-holland': 'Hoek van Holland',
    'vlissingen': 'Vlissingen',
    'scheveningen': 'Scheveningen'
};

// Helper: mooi printen
function log(title, data) {
    console.log('\n' + '='.repeat(60));
    console.log(title);
    console.log('='.repeat(60));
    if (data && typeof data === 'object') {
        console.log(JSON.stringify(data, null, 2));
    } else if (data) {
        console.log(data);
    }
}

// Helper: POST request naar RWS API
async function rwsPost(endpoint, body, silent = false) {
    const url = `${API_BASE}${endpoint}`;
    if (!silent) {
        console.log(`\nURL: ${url}`);
        console.log(`Request: ${JSON.stringify(body, null, 2)}`);
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const text = await response.text();
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    // Handle empty response
    if (!text || text.trim() === '') {
        return { empty: true };
    }

    return JSON.parse(text);
}

// ============================================
// STAP 1: Catalogus ophalen voor waterhoogte data
// ============================================
async function getCatalogus() {
    log('STAP 1: Catalogus ophalen voor waterhoogte (WATHTE)');

    const body = {
        CatalogusFilter: {
            Grootheden: true,
            Locaties: true,
            Parameters: true
        }
    };

    try {
        const data = await rwsPost('/METADATASERVICES/OphalenCatalogus', body);

        if (!data.LocatieLijst || !data.AquoMetadataLijst) {
            console.log('Onverwachte response structuur');
            return null;
        }

        console.log(`\nAantal locaties: ${data.LocatieLijst.length}`);
        console.log(`Aantal parameters: ${data.AquoMetadataLijst.length}`);

        // Zoek waterhoogte (WATHTE) parameters
        const wathteParams = data.AquoMetadataLijst.filter(m =>
            m.Grootheid?.Code === 'WATHTE'
        );

        console.log(`\nWaterhoogte (WATHTE) parameters: ${wathteParams.length}`);
        if (wathteParams.length > 0) {
            console.log('Voorbeeld:', JSON.stringify(wathteParams[0], null, 2));
        }

        // Zoek relevante kustlocaties
        const searchTerms = ['ijmuiden', 'hoekvanholland', 'vlissingen', 'scheveningen'];
        const kustLocaties = data.LocatieLijst.filter(loc => {
            const code = (loc.Code || '').toLowerCase();
            return searchTerms.some(term => code.startsWith(term) || code === term);
        });

        console.log(`\nRelevante kustlocaties: ${kustLocaties.length}`);
        kustLocaties.slice(0, 10).forEach(loc => {
            console.log(`  ${loc.Code}`);
        });

        return { locaties: kustLocaties, parameters: wathteParams, full: data };

    } catch (error) {
        console.error('Fout:', error.message);
        return null;
    }
}

// ============================================
// STAP 2: Zoek locatie+parameter combinaties
// ============================================
async function getLocationParameterCombos() {
    log('STAP 2: Zoek beschikbare locatie+parameter combinaties');

    // We moeten kijken welke parameters beschikbaar zijn per locatie
    // Dit doen we via de catalogus met specifiekere filter

    const locations = ['ijmuiden', 'hoekvanholland', 'vlissingen', 'scheveningen'];

    for (const loc of locations) {
        console.log(`\n--- Checking ${loc} ---`);

        const body = {
            CatalogusFilter: {
                Grootheden: true,
                Locaties: true
            }
        };

        try {
            const data = await rwsPost('/METADATASERVICES/OphalenCatalogus', body, true);

            // Zoek deze locatie
            const locInfo = data.LocatieLijst?.find(l =>
                l.Code?.toLowerCase() === loc || l.Code?.toLowerCase().startsWith(loc + '.')
            );

            if (locInfo) {
                console.log(`  Gevonden: ${locInfo.Code}`);

                // Nu check of er WATHTE data is voor deze locatie
                const checkBody = {
                    AquoMetadataLijst: [{
                        Grootheid: { Code: 'WATHTE' }
                    }],
                    LocatieLijst: [{ Code: locInfo.Code }],
                    Periode: {
                        Begindatumtijd: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
                        Einddatumtijd: new Date().toISOString()
                    }
                };

                const check = await rwsPost('/ONLINEWAARNEMINGENSERVICES/CheckWaarnemingenAanwezig', checkBody, true);
                console.log(`  WATHTE data beschikbaar: ${check.WaarnemingenAanwezig}`);
            } else {
                console.log(`  Niet gevonden in catalogus`);
            }

        } catch (error) {
            console.log(`  Fout: ${error.message.slice(0, 100)}`);
        }
    }
}

// ============================================
// STAP 3: Haal waterstanden op voor een locatie
// ============================================
async function getWaterstanden(locationCode) {
    log(`STAP 3: Waterstanden ophalen voor ${locationCode}`);

    // Periode: afgelopen week
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 2 * 24 * 3600 * 1000);

    // Request volgens ddlpy formaat
    const body = {
        AquoPlusWaarnemingMetadata: {
            AquoMetadata: {
                Compartiment: { Code: 'OW' },        // Oppervlaktewater
                Grootheid: { Code: 'WATHTE' },       // Waterhoogte
                Eenheid: { Code: 'cm' }              // Centimeter
            }
        },
        Locatie: { Code: locationCode },
        Periode: {
            Begindatumtijd: startDate.toISOString(),
            Einddatumtijd: endDate.toISOString()
        }
    };

    try {
        const data = await rwsPost('/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen', body);

        if (data.empty) {
            console.log('Lege response - probeer andere parameters');
            return null;
        }

        if (data.WaarnemingenLijst && data.WaarnemingenLijst.length > 0) {
            const metingen = data.WaarnemingenLijst[0].MetingenLijst || [];
            console.log(`\nAantal metingen: ${metingen.length}`);

            if (metingen.length > 0) {
                console.log('\nLaatste 5 metingen:');
                metingen.slice(-5).forEach(m => {
                    const tijd = new Date(m.Tijdstip).toLocaleString('nl-NL');
                    console.log(`  ${tijd}: ${m.Meetwaarde?.Waarde_Numeriek} cm`);
                });

                // Vind extremen
                const extremen = findExtremen(metingen);
                if (extremen.length > 0) {
                    console.log('\nHoog/Laagwater:');
                    extremen.slice(-6).forEach(e => {
                        const tijd = new Date(e.tijd).toLocaleString('nl-NL');
                        const type = e.type === 'high' ? '🌊 HW' : '⬇️  LW';
                        console.log(`  ${type}: ${e.waarde} cm @ ${tijd}`);
                    });
                }

                return metingen;
            }
        } else {
            console.log('Geen waarnemingen gevonden');
            console.log('Response:', JSON.stringify(data, null, 2).slice(0, 500));
        }

        return null;

    } catch (error) {
        console.error('Fout:', error.message);
        return null;
    }
}

// ============================================
// STAP 4: Probeer astronomisch getij
// ============================================
async function getAstronomischGetij(locationCode) {
    log(`STAP 4: Astronomisch getij voor ${locationCode}`);

    // Voorspelling: komende 2 dagen
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 2 * 24 * 3600 * 1000);

    // Astronomisch getij heeft speciale hoedanigheid
    const body = {
        AquoPlusWaarnemingMetadata: {
            AquoMetadata: {
                Compartiment: { Code: 'OW' },
                Grootheid: { Code: 'WATHTE' },
                Hoedanigheid: { Code: 'NAP' }  // Referentie NAP
            }
        },
        Locatie: { Code: locationCode },
        Periode: {
            Begindatumtijd: startDate.toISOString(),
            Einddatumtijd: endDate.toISOString()
        }
    };

    try {
        const data = await rwsPost('/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen', body);

        if (data.empty) {
            console.log('Lege response');
            return null;
        }

        if (data.WaarnemingenLijst && data.WaarnemingenLijst.length > 0) {
            const metingen = data.WaarnemingenLijst[0].MetingenLijst || [];
            console.log(`\nAantal meetpunten: ${metingen.length}`);

            if (metingen.length > 0) {
                const extremen = findExtremen(metingen);
                console.log(`\nGevonden extremen: ${extremen.length}`);
                extremen.slice(0, 8).forEach(e => {
                    const tijd = new Date(e.tijd).toLocaleString('nl-NL');
                    const type = e.type === 'high' ? '🌊 HW' : '⬇️  LW';
                    console.log(`  ${type}: ${e.waarde} cm @ ${tijd}`);
                });
            }
        }

        return data;

    } catch (error) {
        console.error('Fout:', error.message);
        return null;
    }
}

// ============================================
// STAP 5: Test met diverse parameter combinaties
// ============================================
async function testParameterCombos(locationCode) {
    log(`STAP 5: Test parameter combinaties voor ${locationCode}`);

    const combos = [
        { Grootheid: { Code: 'WATHTE' } },
        { Grootheid: { Code: 'WATHTE' }, Compartiment: { Code: 'OW' } },
        { Grootheid: { Code: 'WATHTE' }, Eenheid: { Code: 'cm' } },
        { Grootheid: { Code: 'WATHTEVERWACHT' } },
        { Grootheid: { Code: 'WATHTEASTRO' } }
    ];

    const startDate = new Date(Date.now() - 24 * 3600 * 1000);
    const endDate = new Date();

    for (const aquoMeta of combos) {
        console.log(`\nProbeer: ${JSON.stringify(aquoMeta)}`);

        const body = {
            AquoPlusWaarnemingMetadata: {
                AquoMetadata: aquoMeta
            },
            Locatie: { Code: locationCode },
            Periode: {
                Begindatumtijd: startDate.toISOString(),
                Einddatumtijd: endDate.toISOString()
            }
        };

        try {
            const data = await rwsPost('/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen', body, true);

            if (data.empty) {
                console.log('  -> Lege response');
            } else if (data.WaarnemingenLijst?.length > 0) {
                const metingen = data.WaarnemingenLijst[0].MetingenLijst || [];
                console.log(`  -> ${metingen.length} metingen gevonden!`);
                if (metingen.length > 0) {
                    const laatste = metingen[metingen.length - 1];
                    console.log(`     Laatste: ${new Date(laatste.Tijdstip).toLocaleString('nl-NL')}: ${laatste.Meetwaarde?.Waarde_Numeriek} cm`);
                }
            } else {
                console.log('  -> Geen data');
            }

        } catch (error) {
            console.log(`  -> Fout: ${error.message.slice(0, 80)}`);
        }
    }
}

// Helper: vind hoog/laagwater in metingen
function findExtremen(metingen) {
    const extremen = [];

    for (let i = 1; i < metingen.length - 1; i++) {
        const prev = metingen[i - 1].Meetwaarde?.Waarde_Numeriek;
        const curr = metingen[i].Meetwaarde?.Waarde_Numeriek;
        const next = metingen[i + 1].Meetwaarde?.Waarde_Numeriek;

        if (prev === undefined || curr === undefined || next === undefined) continue;

        if (curr > prev && curr > next) {
            extremen.push({ tijd: metingen[i].Tijdstip, waarde: curr, type: 'high' });
        } else if (curr < prev && curr < next) {
            extremen.push({ tijd: metingen[i].Tijdstip, waarde: curr, type: 'low' });
        }
    }

    return extremen;
}

// ============================================
// MAIN
// ============================================
async function main() {
    console.log('\n🌊 RWS WaterWebservices API Test');
    console.log('================================\n');
    console.log(`API: ${API_BASE}`);

    // Stap 1: Catalogus ophalen
    const catalogus = await getCatalogus();

    // Stap 2: Zoek locatie+parameter combinaties
    await getLocationParameterCombos();

    // Stap 3: Haal waterstanden op voor locaties met data
    await getWaterstanden('hoekvanholland');
    await getWaterstanden('vlissingen');
    await getWaterstanden('scheveningen');

    // Stap 4: Astronomisch getij
    await getAstronomischGetij('hoekvanholland');

    // Stap 5: Test parameter combinaties
    await testParameterCombos('hoekvanholland');

    console.log('\n' + '='.repeat(60));
    console.log('Tests voltooid!');
    console.log('='.repeat(60) + '\n');
}

// Run
main().catch(console.error);
