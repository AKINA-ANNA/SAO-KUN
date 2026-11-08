const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: { message: "Method not allowed." } });
    }

    const apiKey = process.env.MY_SECRET_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: { message: "Server is missing MY_SECRET_API_KEY." } });
    }

    try {
        const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});

        const upstream = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": process.env.PUBLIC_SITE_URL || "http://localhost:3000",
                "X-Title": "ITG Study App"
            },
            body
        });

        const text = await upstream.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = { error: { message: text || "Invalid response from OpenRouter." } };
        }

        return res.status(upstream.status).json(data);
    } catch (error) {
        console.error("OpenRouter proxy error:", error);
        return res.status(502).json({ error: { message: "Could not reach the AI service." } });
    }
};
