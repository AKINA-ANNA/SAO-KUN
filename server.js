const http = require("http");
const fs = require("fs");
const path = require("path");

// Load .env or .env.local if present
function loadEnv() {
    [".env", ".env.local"].forEach(envFile => {
        const fullPath = path.join(__dirname, envFile);
        if (fs.existsSync(fullPath)) {
            const lines = fs.readFileSync(fullPath, "utf8").split("\n");
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) continue;
                const eqIdx = trimmed.indexOf("=");
                if (eqIdx !== -1) {
                    const key = trimmed.slice(0, eqIdx).trim();
                    let val = trimmed.slice(eqIdx + 1).trim();
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.slice(1, -1);
                    }
                    if (!process.env[key]) {
                        process.env[key] = val;
                    }
                }
            }
        }
    });
}
loadEnv();

const chatHandler = require("./api/chat.js");
const searchHandler = require("./api/search.js");

const MIME_TYPES = {
    ".html": "text/html; charset=UTF-8",
    ".js": "application/javascript; charset=UTF-8",
    ".css": "text/css; charset=UTF-8",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".pdf": "application/pdf"
};

function createVercelLikeResponse(res) {
    const wrapped = {
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
        },
        setHeader(name, value) {
            this.headers[name] = value;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.setHeader("Content-Type", "application/json; charset=UTF-8");
            res.writeHead(this.statusCode, this.headers);
            res.end(JSON.stringify(data));
        },
        end(data) {
            res.writeHead(this.statusCode, this.headers);
            res.end(data);
        }
    };
    return wrapped;
}

function parseIncomingBody(req) {
    return new Promise((resolve) => {
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch {
                resolve(body);
            }
        });
        req.on("error", () => resolve({}));
    });
}

const server = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        res.writeHead(200, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost:3000"}`);
    const pathname = parsedUrl.pathname;

    // API Routes
    if (pathname === "/api/chat") {
        const body = await parseIncomingBody(req);
        req.body = body;
        const vRes = createVercelLikeResponse(res);
        try {
            await chatHandler(req, vRes);
        } catch (err) {
            console.error("Handler error in /api/chat:", err);
            vRes.status(500).json({ error: { message: err.message || "Internal server error." } });
        }
        return;
    }

    if (pathname === "/api/search") {
        const body = await parseIncomingBody(req);
        req.body = body;
        const vRes = createVercelLikeResponse(res);
        try {
            await searchHandler(req, vRes);
        } catch (err) {
            console.error("Handler error in /api/search:", err);
            vRes.status(500).json({ error: { message: err.message || "Internal server error." } });
        }
        return;
    }

    // Static Files
    let filePath = path.join(__dirname, pathname === "/" ? "index.html" : pathname);
    filePath = path.normalize(filePath);

    // Prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // Fallback to index.html if file doesn't exist
            const fallbackPath = path.join(__dirname, "index.html");
            fs.readFile(fallbackPath, (readErr, content) => {
                if (readErr) {
                    res.writeHead(404, { "Content-Type": "text/plain" });
                    res.end("Not Found");
                } else {
                    res.writeHead(200, { "Content-Type": "text/html; charset=UTF-8" });
                    res.end(content);
                }
            });
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        // Support video streaming (Range requests for mp4)
        if (ext === ".mp4" && req.headers.range) {
            const range = req.headers.range;
            const fileSize = stats.size;
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(filePath, { start, end });
            const head = {
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": chunksize,
                "Content-Type": contentType
            };
            res.writeHead(206, head);
            file.pipe(res);
            return;
        }

        res.writeHead(200, {
            "Content-Type": contentType,
            "Content-Length": stats.size
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`API proxy active at http://localhost:${PORT}/api/chat and /api/search`);
});
