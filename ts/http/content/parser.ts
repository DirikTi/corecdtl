import { hypernode } from "../../hypernode";

function formParse(b: Buffer) {
    // application/x-www-form-urlencoded
    const s = b.toString("utf8");
    const out: Record<string, string> = {};

    for (const pair of s.split("&")) {
        const [k, v] = pair.split("=");
        if (!k) continue;
        out[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }

    return out;
}

function multipartParser(b: Buffer) {
    const raw = b.toString("utf8");

    const boundaryMatch = raw.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) {
        return {};
    }

    const boundary = `--${boundaryMatch[1]}`;
    const parts = raw.split(boundary).slice(1, -1);

    const result: Record<string, any> = {};

    for (let part of parts) {
        part = part.trim();
        if (!part) continue;

        const [rawHeaders, ...bodyParts] = part.split("\r\n\r\n");
        const body = bodyParts.join("\r\n\r\n");
        const headers = rawHeaders.split("\r\n");

        let name = "";
        let filename = "";

        for (const h of headers) {
            const m = h.match(/name="([^"]+)"/);
            if (m) name = m[1];

            const f = h.match(/filename="([^"]+)"/);
            if (f) filename = f[1];
        }

        if (!name) continue;

        // File part
        if (filename) {
            result[name] = {
                filename,
                data: Buffer.from(body, "utf8")
            };
        } else {
            // Text field
            result[name] = body.trim();
        }
    }

    return result;
}

const decoder = new TextDecoder('utf-8');

export const contentParserTable: Record<string, (b: any) => any> = {
    "application/json": JSON.parse,
    "application/x-www-form-urlencoded": formParse,
    "multipart/form-data": multipartParser,
    "text/plain": (b: Buffer) => decoder.decode(b)
};
