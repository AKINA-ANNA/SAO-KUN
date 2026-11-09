const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Preference order: attempt gemini-2.0-flash-exp:free; if unavailable on OpenRouter, fallback to gpt-4o-mini
const PREFERRED_MODEL = "google/gemini-2.0-flash-exp:free";
const FALLBACK_MODEL = "openai/gpt-4o-mini";

function parseJsonBody(body) {
    if (typeof body === "string") {
        try {
            return JSON.parse(body);
        } catch {
            return {};
        }
    }
    return body && typeof body === "object" ? body : {};
}

function buildSystemPrompt({ subject = "General", topic = "General", difficulty = "Medium", needsDiagram = "False", isDescriptive = false }) {
    const formattedNeedsDiagram = (needsDiagram === true || needsDiagram === "True" || String(needsDiagram).toLowerCase() === "true") ? "True" : "False";
    return `
You are an expert exam creator for a study platform. 
Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty} (Options: Easy, Medium, Advanced)
Needs Diagram: ${formattedNeedsDiagram} (True/False)
Format: ${isDescriptive ? "Descriptive / Multi-Step Problem" : "Multiple Choice Question (MCQ)"}

INSTRUCTIONS FOR ADVANCED DIFFICULTY:
If Advanced, you MUST NOT ask simple recall, definitions, or basic equations (e.g., no basic neutralization reactions). You MUST create a scenario that requires multi-step calculations, analyzing exceptions to rules, or combining two different concepts.

INSTRUCTIONS FOR DIAGRAMS:
If Needs Diagram is True, you CANNOT generate images. Instead, you MUST output a valid Mermaid.js graph code block starting with \`\`\`mermaid and ending with \`\`\`.
CRITICAL DIAGRAM ALIGNMENT RULE: The diagram MUST directly represent the exact scenario, components, apparatus, circuit, flowchart, or experimental setup described in the question. Every label, component, and value in the diagram must correspond to the question text so the diagram and question are 100% aligned and coherent.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

<thinking>
1. Analyze the requested difficulty.
2. If Advanced, figure out a complex twist, a common student misconception, or a multi-step problem to use. 
3. If Needs Diagram is True, plan the Mermaid.js code to represent a graph, flowchart, or experimental setup that strictly aligns with the question scenario.
</thinking>

**Question:** 
[Write the complex question here]

[If Needs Diagram is True, insert the \`\`\`mermaid code block here]

${isDescriptive ? `**Type:** Descriptive

**Answer:**
[Write the step-by-step solution, calculation steps, and key grading criteria here]

**Reaction OK:** [Short in-character praising line under 25 words]
**Reaction No:** [Short in-character constructive guidance line under 25 words]` : `**Type:** MCQ

**Options:**
A) [Option A text]
B) [Option B text]
C) [Option C text]
D) [Option D text]

**Correct:** [Single letter: A, B, C, or D]

**Answer:**
[Write the step-by-step solution and explanation here]

**Reaction OK:** [Short in-character reaction when student is correct, under 25 words]
**Reaction No:** [Short in-character reaction when student selects wrong option, under 25 words]`}`;
}

async function callOpenRouter(apiKey, payload) {
    const upstream = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.PUBLIC_SITE_URL || "https://study-as-otaku.vercel.app",
            "X-Title": "SAO Study App"
        },
        body: JSON.stringify(payload)
    });

    const text = await upstream.text();
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { error: { message: text || "Invalid response from OpenRouter." } };
    }
    return { status: upstream.status, ok: upstream.ok, data };
}

module.exports = async function handler(req, res) {
    // Enable CORS for Vercel and cross-origin
    if (res.setHeader) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        if (res.setHeader) res.setHeader("Allow", "POST");
        return res.status(405).json({ error: { message: "Method not allowed." } });
    }

    const apiKey = process.env.MY_SECRET_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: { message: "Server is missing MY_SECRET_API_KEY environment variable. Please configure it in your Vercel Project Settings." } });
    }

    try {
        const payload = parseJsonBody(req.body);

        let model = payload.model || FALLBACK_MODEL;
        let messages = payload.messages;

        // Only build the template when the caller did not supply its own messages.
        // The frontend sends precise, format-aware prompts (MCQ / descriptive / grading),
        // so overriding them here would break question types and AI marking.
        if (!Array.isArray(messages) || messages.length === 0) {
            const isDescriptive = !!payload.isDescriptive;
            const systemPrompt = buildSystemPrompt({
                subject: payload.subject || "General",
                topic: payload.topic || "General",
                difficulty: payload.difficulty || "Medium",
                needsDiagram: payload.needsDiagram,
                isDescriptive
            });

            const formatLabel = isDescriptive ? "Descriptive problem" : "MCQ";
            const userText = payload.prompt || `Create an exam ${formatLabel} on ${payload.subject || "General"}: ${payload.topic || "General"}.`;

            messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: userText }
            ];
        }

        const requestBody = {
            model,
            messages: messages || [{ role: "user", content: "Hello" }],
            temperature: typeof payload.temperature === "number" ? payload.temperature : 0.7,
            max_tokens: typeof payload.max_tokens === "number" ? payload.max_tokens : 1600
        };

        let result = await callOpenRouter(apiKey, requestBody);

        // If the preferred model failed (e.g. 404 / unavailable on OpenRouter), fallback to gpt-4o-mini
        if (!result.ok && model !== FALLBACK_MODEL) {
            console.warn(`Model ${model} returned error (${result.status}), falling back to ${FALLBACK_MODEL}`);
            requestBody.model = FALLBACK_MODEL;
            result = await callOpenRouter(apiKey, requestBody);
        }

        return res.status(result.status).json(result.data);
    } catch (error) {
        console.error("OpenRouter proxy error:", error);
        return res.status(502).json({ error: { message: error.message || "Could not reach the AI service." } });
    }
};
