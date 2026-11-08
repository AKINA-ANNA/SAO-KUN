const TAVILY_URL = "https://api.tavily.com/search";

function parseBody(body) {
    if (typeof body === "string") {
        try {
            return JSON.parse(body);
        } catch {
            return null;
        }
    }
    return body || null;
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: { message: "Method not allowed." } });
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: { message: "Server is missing TAVILY_API_KEY." } });
    }

    const payload = parseBody(req.body);
    if (!payload || typeof payload.query !== "string" || !payload.query.trim()) {
        return res.status(400).json({ error: { message: "A non-empty query is required." } });
    }

    try {
        const upstream = await fetch(TAVILY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, api_key: apiKey })
        });

        const text = await upstream.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = { error: { message: text || "Invalid response from Tavily." } };
        }

        return res.status(upstream.status).json(data);
    } catch (error) {
        console.error("Tavily proxy error:", error);
        return res.status(502).json({ error: { message: "Could not reach the search service." } });
    }
};
