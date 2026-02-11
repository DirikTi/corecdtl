import { Http } from "../../http";

/**
 * Base HTTP response implementation used internally by the server.
 *
 * Responsible for:
 *  - managing status code
 *  - storing headers
 *  - writing body
 *  - optional compression
 *  - serializing everything into a raw HTTP Buffer
 *
 * This class is optimized for performance and object pooling.
 *
 * You may extend this class to implement custom helpers
 * (e.g. html(), stream(), file(), etc.).
 */
export class PipeResponseBase implements Http.IHttpResponseBase {

    /**
     * Raw response body stored as UTF-8 string.
     */
    protected body: string = "";

    /**
     * HTTP status code.
     * @default 200
     */
    protected status: number = 200;

    /**
     * Response headers map.
     * Uses Object.create(null) for maximum performance and safety.
     */
    protected headers: Record<string, string> = Object.create(null);

    /**
     * Marks whether response has been finalized (send/json/redirect called).
     */
    protected finishedFlag: boolean = false;

    /**
     * Compression function lookup table.
     * Example: { gzip: fn, br: fn }
     */
    protected contentEncodingTable!: Record<string, Function>;

    /**
     * Selected compression type.
     */
    protected compression: "gzip" | "br" | "deflate" | null = null;

    /**
     * Object pool identifier.
     */
    protected objId: number = -1;

    /**
     * Reference to response object pool.
     */
    protected cPool: any;

    constructor() {
        // Bind once for JIT/inline stability and faster hot path calls
        Object.defineProperty(this, "getResp", {
            value: this.getResp.bind(this),
            writable: false,
            configurable: false,
            enumerable: false
        });
    }

    /* ===================== */
    /* ===== POOL API ====== */
    /* ===================== */

    /**
     * Attaches this response to an object pool.
     */
    public setCPool(cPool: any, objId: number) {
        this.objId = objId;
        this.cPool = cPool;
    }

    /**
     * Resets state and returns object back to the pool.
     */
    public freeCPool() {
        this.body = "";
        this.status = 200;
        this.headers = Object.create(null);
        this.finishedFlag = false;
        this.compression = null;

        this.cPool.free(this.objId);
    }

    /* ===================== */
    /* ===== GETTERS ======= */
    /* ===================== */

    /** Returns current HTTP status code. */
    public getStatus(): number {
        return this.status;
    }

    /** Returns response headers object. */
    public getHeaders(): Record<string, string> {
        return this.headers;
    }

    /** Returns response body as string. */
    public getBody(): string {
        return this.body;
    }

    /* ===================== */
    /* ===== MUTATORS ====== */
    /* ===================== */

    /**
     * Sets HTTP status code.
     */
    public setStatus(code: number): this {
        this.status = code | 0;
        return this;
    }

    /**
     * Sets a single response header.
     */
    public setHeader(key: string, value: string): this {
        this.headers[key] = value;
        return this;
    }

    /**
     * Merges multiple headers.
     */
    public setHeaders(obj: Record<string, string>): this {
        for (const k in obj) this.headers[k] = obj[k];
        return this;
    }

    /* ===================== */
    /* ===== SEND API ====== */
    /* ===================== */

    /**
     * Sends plain text payload.
     * Marks response as finished.
     */
    public send(payload: string): void {
        this.body = payload;
        this.finishedFlag = true;
    }

    /**
     * Sends JSON response.
     * Automatically sets Content-Type: application/json.
     */
    public json(obj: unknown): void {
        this.setHeader("Content-Type", "application/json");
        this.body = JSON.stringify(obj);
        this.finishedFlag = true;
    }

    /**
     * Redirects client to another URL.
     * @default code 302
     */
    public redirect(url: string, code: number = 302): void {
        this.status = code | 0;
        this.headers["Location"] = url;
        this.body = "";
        this.finishedFlag = true;
    }

    /**
     * Enables response compression.
     * Automatically sets Content-Encoding header.
     */
    public setCompression(enc: "gzip" | "br" | "deflate"): this {
        this.compression = enc;
        this.headers["Content-Encoding"] = enc;
        return this;
    }

    /* ===================== */
    /* ===== FINALIZE ====== */
    /* ===================== */

    /**
     * Serializes the response into a raw HTTP/1.1 buffer.
     *
     * Includes:
     *  - status line
     *  - headers
     *  - optional compression
     *  - content-length
     *
     * This is the final step before writing to the socket.
     */
    public getResp(): Buffer {
        const hdr = { ...this.headers };

        let bodyBuf = Buffer.from(this.body, "utf-8");

        if (this.compression) {
            const fn = this.contentEncodingTable[this.compression];
            if (fn) bodyBuf = fn(bodyBuf);
            hdr["Content-Encoding"] = this.compression;
        }

        hdr["Content-Length"] = Buffer.byteLength(bodyBuf).toString();

        let headerStr = `HTTP/1.1 ${this.status}\r\n`;
        for (const k in hdr) headerStr += `${k}: ${hdr[k]}\r\n`;
        headerStr += `\r\n`;

        return Buffer.concat([
            Buffer.from(headerStr, "ascii"),
            bodyBuf
        ]);
    }
}
