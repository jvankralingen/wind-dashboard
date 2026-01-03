// Wind Assistent Chat
// Slim vraag-antwoord systeem voor spot aanbevelingen

let spotsData = null;
let userLocation = null;
let isLoading = false;

// Chat UI elementen
const chatToggle = document.getElementById('chatToggle');
const chatPanel = document.getElementById('chatPanel');
const chatClose = document.getElementById('chatClose');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');

// Chat panel open/close
chatToggle.addEventListener('click', () => {
    chatPanel.classList.add('open');
    chatToggle.style.display = 'none';
    loadSpotsDataIfNeeded();
});

chatClose.addEventListener('click', () => {
    chatPanel.classList.remove('open');
    chatToggle.style.display = 'flex';
});

// Verstuur bericht
chatSend.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Probeer locatie te krijgen
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            userLocation = {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude
            };
            console.log('Locatie gevonden:', userLocation);
        },
        (err) => {
            console.log('Geen locatie toegang:', err);
            // Default locatie: Amsterdam
            userLocation = { lat: 52.3676, lon: 4.9041 };
        }
    );
} else {
    userLocation = { lat: 52.3676, lon: 4.9041 };
}

// Spots data laden
async function loadSpotsDataIfNeeded() {
    if (spotsData) return;

    showLoading('Spots data laden...');

    try {
        spotsData = await fetchAllSpotsData();
        hideLoading();
        console.log('Spots data geladen:', spotsData);
    } catch (error) {
        hideLoading();
        addMessage('assistant', 'Sorry, er ging iets mis bij het laden van de spots data. Probeer het later opnieuw.');
    }
}

// Bericht versturen
async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isLoading) return;

    chatInput.value = '';
    addMessage('user', text);

    await loadSpotsDataIfNeeded();

    showLoading('Analyseren...');

    // Kleine delay voor UX
    await new Promise(r => setTimeout(r, 500));

    const response = await processQuestion(text);
    hideLoading();
    addMessage('assistant', response);
}

// Vraag verwerken
async function processQuestion(question) {
    const q = question.toLowerCase();

    // Parse tijdsindicatie
    let hoursFromNow = 0;
    const timeMatch = q.match(/over\s+(\d+)\s*(uur|u)/);
    if (timeMatch) {
        hoursFromNow = parseInt(timeMatch[1]);
    } else if (q.includes('morgen')) {
        hoursFromNow = 24;
    } else if (q.includes('vanavond')) {
        const now = new Date();
        hoursFromNow = Math.max(0, 18 - now.getHours());
    } else if (q.includes('vanmiddag')) {
        const now = new Date();
        hoursFromNow = Math.max(0, 14 - now.getHours());
    }

    // Parse afstand/rijtijd beperking
    let maxDistanceKm = Infinity;
    const distMatch = q.match(/(\d+)\s*(km|kilometer)/);
    const timeDistMatch = q.match(/(\d+)\s*(uur|u|minuten|min)\s*(rijden|rijafstand|reistijd)/);
    if (distMatch) {
        maxDistanceKm = parseInt(distMatch[1]);
    } else if (timeDistMatch) {
        const value = parseInt(timeDistMatch[1]);
        const unit = timeDistMatch[2];
        // Schat 60 km/u gemiddeld
        if (unit.startsWith('uur') || unit === 'u') {
            maxDistanceKm = value * 60;
        } else {
            maxDistanceKm = (value / 60) * 60;
        }
    }

    // Detecteer vraagtype
    if (q.includes('vergelijk') || (q.includes('en') && countSpotMentions(q) >= 2)) {
        return handleCompareSpots(q, hoursFromNow);
    }

    if (q.includes('beste') || q.includes('waar') || q.includes('welke') || q.includes('aanraden') || q.includes('advies')) {
        return handleBestSpot(q, hoursFromNow, maxDistanceKm);
    }

    if (q.includes('meeste wind') || q.includes('hardste wind') || q.includes('sterkste')) {
        return handleMostWind(hoursFromNow);
    }

    if (q.includes('minste wind') || q.includes('rustig') || q.includes('kalm')) {
        return handleLeastWind(hoursFromNow);
    }

    if (q.includes('golf') || q.includes('golven') || q.includes('waves')) {
        return handleWaveQuestion(hoursFromNow);
    }

    // Check voor specifieke spot
    const mentionedSpot = findMentionedSpot(q);
    if (mentionedSpot) {
        return handleSpotInfo(mentionedSpot, hoursFromNow);
    }

    // Overzicht van alle spots
    if (q.includes('overzicht') || q.includes('alle spots') || q.includes('condities')) {
        return handleOverview(hoursFromNow);
    }

    // Default: toon beste spot
    return handleBestSpot(q, hoursFromNow, maxDistanceKm);
}

// Tel spot mentions in vraag
function countSpotMentions(q) {
    let count = 0;
    SPOTS.forEach(spot => {
        if (q.includes(spot.name.toLowerCase()) || q.includes(spot.id)) {
            count++;
        }
    });
    return count;
}

// Vind genoemde spot
function findMentionedSpot(q) {
    for (const spot of SPOTS) {
        if (q.includes(spot.name.toLowerCase()) || q.includes(spot.id.replace(/-/g, ' '))) {
            return spot;
        }
    }
    return null;
}

// Handle: Beste spot vinden
function handleBestSpot(q, hoursFromNow, maxDistanceKm) {
    if (!spotsData || spotsData.length === 0) {
        return 'Sorry, ik kon geen spots data laden.';
    }

    const rankings = [];

    for (const data of spotsData) {
        const conditions = getConditionsAtTime(data, hoursFromNow);
        const score = calculateWindsurfScore(conditions, data.spot);

        let distance = Infinity;
        let driveTime = '';
        if (userLocation) {
            distance = calculateDistance(userLocation.lat, userLocation.lon, data.spot.lat, data.spot.lon);
            driveTime = estimateDriveTime(distance);
        }

        if (distance <= maxDistanceKm) {
            rankings.push({
                spot: data.spot,
                conditions,
                score,
                distance,
                driveTime
            });
        }
    }

    if (rankings.length === 0) {
        return `Geen spots gevonden binnen ${maxDistanceKm} km. Probeer een grotere afstand.`;
    }

    // Sorteer op score
    rankings.sort((a, b) => b.score - a.score);

    const best = rankings[0];
    const timeLabel = hoursFromNow === 0 ? 'nu' : `over ${hoursFromNow} uur`;

    let response = `<p><strong>${best.spot.name}</strong> is ${timeLabel} de beste keuze!</p>`;
    response += formatSpotCard(best.spot, best.conditions, best.score, best.driveTime);

    if (rankings.length > 1) {
        const second = rankings[1];
        response += `<p style="margin-top: 1rem; font-size: 0.85rem; color: var(--text-secondary)">`;
        response += `Alternatief: <strong>${second.spot.name}</strong> (score ${second.score}/100)`;
        response += `</p>`;
    }

    return response;
}

// Handle: Vergelijk spots
function handleCompareSpots(q, hoursFromNow) {
    const mentioned = SPOTS.filter(spot =>
        q.includes(spot.name.toLowerCase()) || q.includes(spot.id.replace(/-/g, ' '))
    );

    if (mentioned.length < 2) {
        return 'Noem minimaal 2 spots om te vergelijken, bijvoorbeeld: "Vergelijk IJmuiden en Wijk aan Zee"';
    }

    const timeLabel = hoursFromNow === 0 ? 'nu' : `over ${hoursFromNow} uur`;
    let response = `<p>Vergelijking ${timeLabel}:</p>`;

    const results = [];
    for (const spot of mentioned) {
        const data = spotsData.find(d => d.spot.id === spot.id);
        if (data) {
            const conditions = getConditionsAtTime(data, hoursFromNow);
            const score = calculateWindsurfScore(conditions, spot);
            results.push({ spot, conditions, score });
        }
    }

    results.sort((a, b) => b.score - a.score);

    for (const r of results) {
        response += formatSpotCard(r.spot, r.conditions, r.score);
    }

    const winner = results[0];
    response += `<p style="margin-top: 0.5rem"><strong>Winnaar: ${winner.spot.name}</strong></p>`;

    return response;
}

// Handle: Meeste wind
function handleMostWind(hoursFromNow) {
    const results = spotsData.map(data => {
        const conditions = getConditionsAtTime(data, hoursFromNow);
        return { spot: data.spot, conditions };
    });

    results.sort((a, b) => b.conditions.windSpeedKnots - a.conditions.windSpeedKnots);
    const top = results[0];

    const timeLabel = hoursFromNow === 0 ? 'nu' : `over ${hoursFromNow} uur`;
    let response = `<p><strong>${top.spot.name}</strong> heeft ${timeLabel} de meeste wind:</p>`;
    response += formatSpotCard(top.spot, top.conditions);

    return response;
}

// Handle: Minste wind
function handleLeastWind(hoursFromNow) {
    const results = spotsData.map(data => {
        const conditions = getConditionsAtTime(data, hoursFromNow);
        return { spot: data.spot, conditions };
    });

    results.sort((a, b) => a.conditions.windSpeedKnots - b.conditions.windSpeedKnots);
    const top = results[0];

    const timeLabel = hoursFromNow === 0 ? 'nu' : `over ${hoursFromNow} uur`;
    let response = `<p><strong>${top.spot.name}</strong> heeft ${timeLabel} de minste wind:</p>`;
    response += formatSpotCard(top.spot, top.conditions);

    return response;
}

// Handle: Golf vraag
function handleWaveQuestion(hoursFromNow) {
    const results = spotsData.map(data => {
        const conditions = getConditionsAtTime(data, hoursFromNow);
        return { spot: data.spot, conditions };
    }).filter(r => r.conditions.waveHeight !== null);

    if (results.length === 0) {
        return 'Geen golfdata beschikbaar voor de spots.';
    }

    results.sort((a, b) => (b.conditions.waveHeight || 0) - (a.conditions.waveHeight || 0));
    const top = results[0];

    const timeLabel = hoursFromNow === 0 ? 'nu' : `over ${hoursFromNow} uur`;
    let response = `<p><strong>${top.spot.name}</strong> heeft ${timeLabel} de hoogste golven:</p>`;
    response += formatSpotCard(top.spot, top.conditions);

    return response;
}

// Handle: Specifieke spot info
function handleSpotInfo(spot, hoursFromNow) {
    const data = spotsData.find(d => d.spot.id === spot.id);
    if (!data) {
        return `Geen data gevonden voor ${spot.name}.`;
    }

    const conditions = getConditionsAtTime(data, hoursFromNow);
    const score = calculateKiteScore(conditions, spot);

    const timeLabel = hoursFromNow === 0 ? 'nu' : `over ${hoursFromNow} uur`;
    let response = `<p>Condities bij <strong>${spot.name}</strong> ${timeLabel}:</p>`;
    response += formatSpotCard(spot, conditions, score);
    response += `<p style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-secondary)">${spot.description}</p>`;

    return response;
}

// Handle: Overzicht
function handleOverview(hoursFromNow) {
    const timeLabel = hoursFromNow === 0 ? 'nu' : `over ${hoursFromNow} uur`;
    let response = `<p>Overzicht alle spots ${timeLabel}:</p>`;

    const results = spotsData.map(data => {
        const conditions = getConditionsAtTime(data, hoursFromNow);
        const score = calculateWindsurfScore(conditions, data.spot);
        return { spot: data.spot, conditions, score };
    });

    results.sort((a, b) => b.score - a.score);

    for (const r of results) {
        response += formatSpotCardCompact(r.spot, r.conditions, r.score);
    }

    return response;
}

// Format spot kaart
function formatSpotCard(spot, conditions, score = null, driveTime = null) {
    const scoreClass = score >= 60 ? 'good' : score >= 30 ? 'moderate' : 'poor';
    const scoreHtml = score !== null ? `<span class="score-badge ${scoreClass}">${score}/100</span>` : '';
    const driveHtml = driveTime ? `<span style="font-size: 0.8rem; color: var(--text-secondary)"> · ${driveTime}</span>` : '';

    return `
        <div class="spot-card">
            <div class="spot-name">${spot.name}${scoreHtml}${driveHtml}</div>
            <div class="spot-conditions">
                <div class="spot-stat">
                    <span class="spot-stat-label">Wind</span>
                    <span class="spot-stat-value">${Math.round(conditions.windSpeedKnots)} kn</span>
                </div>
                <div class="spot-stat">
                    <span class="spot-stat-label">Vlagen</span>
                    <span class="spot-stat-value">${Math.round(conditions.windGustsKnots)} kn</span>
                </div>
                <div class="spot-stat">
                    <span class="spot-stat-label">Richting</span>
                    <span class="spot-stat-value">${conditions.windDirectionName}</span>
                </div>
                <div class="spot-stat">
                    <span class="spot-stat-label">Golven</span>
                    <span class="spot-stat-value">${conditions.waveHeight !== null ? conditions.waveHeight.toFixed(1) + ' m' : '-'}</span>
                </div>
            </div>
        </div>
    `;
}

// Compact spot kaart voor overzicht
function formatSpotCardCompact(spot, conditions, score) {
    const scoreClass = score >= 60 ? 'good' : score >= 30 ? 'moderate' : 'poor';

    return `
        <div class="spot-card" style="padding: 0.5rem 0.75rem; margin-top: 0.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="spot-name" style="font-size: 0.85rem;">${spot.name}</span>
                <span class="score-badge ${scoreClass}">${score}</span>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
                ${Math.round(conditions.windSpeedKnots)} kn ${conditions.windDirectionName}
                ${conditions.waveHeight !== null ? ` · ${conditions.waveHeight.toFixed(1)}m` : ''}
            </div>
        </div>
    `;
}

// Bericht toevoegen aan chat
function addMessage(type, content) {
    const div = document.createElement('div');
    div.className = `chat-message ${type}`;
    div.innerHTML = type === 'user' ? `<p>${escapeHtml(content)}</p>` : content;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Loading indicator
function showLoading(text = 'Laden...') {
    isLoading = true;
    chatSend.disabled = true;

    const loading = document.createElement('div');
    loading.className = 'chat-loading';
    loading.id = 'chatLoading';
    loading.textContent = text;
    chatMessages.appendChild(loading);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideLoading() {
    isLoading = false;
    chatSend.disabled = false;

    const loading = document.getElementById('chatLoading');
    if (loading) loading.remove();
}

// HTML escapen
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
