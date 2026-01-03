// Vercel Serverless Function voor getijden data
// Haalt data op van tide-forecast.com en stuurt JSON terug

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const { location } = req.query;

    if (!location) {
        return res.status(400).json({ error: 'Location parameter required' });
    }

    try {
        const url = `https://www.tide-forecast.com/locations/${location}/tides/latest`;
        const response = await fetch(url);

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch tide data' });
        }

        const html = await response.text();

        // Parse JSON uit de HTML (window.FCGON object)
        const match = html.match(/window\.FCGON\s*=\s*({.*?});/s);
        if (!match) {
            return res.status(404).json({ error: 'No tide data found' });
        }

        const fcgon = JSON.parse(match[1]);
        const extremes = [];

        // Extraheer hoog- en laagwater uit tideDays
        for (const day of fcgon.tideDays || []) {
            for (const tide of day.tides || []) {
                if (tide.type === 'high' || tide.type === 'low') {
                    extremes.push({
                        type: tide.type,
                        time: new Date(tide.timestamp * 1000).toISOString(),
                        height: tide.height
                    });
                }
            }
        }

        // Cache voor 6 uur
        res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate');

        return res.status(200).json({
            location: location,
            extremes: extremes,
            fetchedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Tide API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
