export class UntilEndChunkedParser {
    private bodyParts: Buffer[] = [];
    private totalSize: number = 0;
    private finished: boolean = false;

    constructor() {}

    /**
     * Appends incoming data to the internal buffer list.
     * This method performs zero validation and assumes that
     * all data belongs to the body until the stream terminates.
     *
     * @param {Buffer} data - Raw incoming bytes.
     */
    write(data: Buffer): void {
        if (this.finished) {
            throw new Error("Cannot write after parser is finished.");
        }

        if (data.length > 0) {
            this.bodyParts.push(data);
            this.totalSize += data.length;
        }
    }

    /**
     * Mark the parser as finished. This is optional: external HTTP logic
     * may simply stop calling `.write()` after the stream ends.
     */
    finish(): void {
        this.finished = true;
    }

    /**
     * Returns true only if `.finish()` was explicitly called.
     * Streaming HTTP readers normally won't call this; instead,
     * they treat socket-close as the terminal event.
     */
    isFinished(): boolean {
        return this.finished;
    }

    /**
     * Returns the full concatenated body buffer.
     */
    getBody(): Buffer {
        if (this.bodyParts.length === 0) return Buffer.alloc(0);
        return Buffer.concat(this.bodyParts, this.totalSize);
    }

    /**
     * Returns number of bytes accumulated so far.
     */
    getTotalSize(): number {
        return this.totalSize;
    }

    /**
     * Reset the parser to initial state.
     */
    free(): void {
        this.bodyParts.length = 0;
        this.totalSize = 0;
        this.finished = false;
    }
}
