export interface IHttpResponseBase {
    setStatus(code: number): this;
    setHeader(key: string, value: string): this;
    setHeaders(obj: Record<string, string>): this;

    send(payload: string): void;
    json(obj: unknown): void;
    redirect(url: string, code?: number): void;

    getResp(): Buffer;
    freeCPool(): void;
}
