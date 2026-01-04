// Vercel serverless function voor actuelewind.nl data
// Haalt realtime meetstationdata op

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // 5 min cache

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const url = `https://actuelewind.nl/getActualSpotData6.php?t=web&p=null&ss=1920&${Date.now()}`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'WindDashboard/1.0',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`actuelewind.nl responded with ${response.status}`);
        }

        const data = await response.json();

        // Extraheer alleen wind data en simplificeer de response
        const stations = {};

        if (data.wind) {
            for (const [stationCode, stationData] of Object.entries(data.wind)) {
                if (stationData.winddata && stationData.winddata.length > 0) {
                    const latest = stationData.winddata[0];
                    stations[stationCode] = {
                        stationcode: stationCode,
                        naam: stationData.windspot?.stationnaam || '',
                        regio: stationData.windspot?.regio || '',
                        tijdstip: latest.tijdstip,
                        windsnelheidMS: parseFloat(latest.windsnelheidMS) || 0,
                        windstotenMS: parseFloat(latest.windstotenMS) || 0,
                        windrichtingGR: parseFloat(latest.windrichtingGR) || 0,
                        windrichting: latest.windrichting || '',
                        temperatuurGC: parseFloat(latest.temperatuurGC) || null
                    };
                }
            }
        }

        return res.status(200).json({
            stations,
            fetchedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error fetching actuelewind data:', error);
        return res.status(500).json({
            error: 'Failed to fetch wind data',
            message: error.message
        });
    }
}
