import { IHttpResponseBase } from "./HttpResponseBase";

/**
 * @class PipeResponseBase
 * @description The base Response class used by Http.
 * This class manages the HTTP response status code, headers, and body.
 * Developers can inherit this class and override methods (e.g., `json`, `getResp`) to create custom response types.
 */
export class PipeResponseBase implements IHttpResponseBase {
    protected body: string = "";
    protected status: number = 200;
    protected headers: Record<string, string> = Object.create(null);
    protected finishedFlag: boolean = false;
    protected contentEncodingTable!: Record<string, Function>;

    protected compression: "gzip" | "br" | "deflate" | null = null;

    protected objId: number = -1;
    protected cPool: any;

    constructor() {
        // JIT / inline safety
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

    public setCPool(cPool: any, objId: number) {
        this.objId = objId;
        this.cPool = cPool;
    }

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

    public getStatus(): number {
        return this.status;
    }

    public getHeaders(): Record<string, string> {
        return this.headers;
    }

    public getBody(): string {
        return this.body;
    }

    /* ===================== */
    /* ===== MUTATORS ====== */
    /* ===================== */

    public setStatus(code: number): this {
        this.status = code | 0;
        return this;
    }

    public setHeader(key: string, value: string): this {
        this.headers[key] = value;
        return this;
    }

    public setHeaders(obj: Record<string, string>): this {
        for (const k in obj) this.headers[k] = obj[k];
        return this;
    }

    /* ===================== */
    /* ===== SEND API ====== */
    /* ===================== */

    public send(payload: string): void {
        this.body = payload;
        this.finishedFlag = true;
    }

    public json(obj: unknown): void {
        this.setHeader("Content-Type", "application/json");
        this.body = JSON.stringify(obj);
        this.finishedFlag = true;
    }

    public redirect(url: string, code: number = 302): void {
        this.status = code | 0;
        this.headers["Location"] = url;
        this.body = "";
        this.finishedFlag = true;
    }

    public setCompression(enc: "gzip" | "br" | "deflate"): this {
        this.compression = enc;
        this.headers["Content-Encoding"] = enc;
        return this;
    }

    /* ===================== */
    /* ===== FINALIZE ====== */
    /* ===================== */

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
