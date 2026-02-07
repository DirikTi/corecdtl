class FixedChunkedParser {
    private buffer: Buffer | null = null;
    private writeCursor: number = 0;
    private expectedLength: number = 0;

    constructor() {}

    allocateBuffer(size: number): void {
        if (size <= 0) {
            this.buffer = Buffer.alloc(0);
            this.expectedLength = 0;
            return;
        }
        this.expectedLength = size;
        this.buffer = Buffer.allocUnsafe(size);
        this.writeCursor = 0;
    }

    write(data: Buffer): void {
        if (!this.buffer) {
            throw new Error("Accumulator not initialized. Call allocateBuffer first.");
        }
        
        const remainingSpace = this.expectedLength - this.writeCursor;
        const dataLength = data.length;

        if (dataLength > remainingSpace) {
            throw new Error(`Fixed buffer overflow: Received ${dataLength} bytes, only ${remainingSpace} remaining.`);
        }
        
        data.copy(this.buffer, this.writeCursor);
        this.writeCursor += dataLength;
    }

    isFinished(): boolean {
        return this.writeCursor === this.expectedLength;
    }

    getBody(): Buffer {
        return this.buffer || Buffer.alloc(0);
    }

    getTotalWrittenSize(): number {
        return this.writeCursor;
    }
    
    getExpectedSize(): number {
        return this.expectedLength;
    }

    free(): void {
        this.buffer = null;
        this.writeCursor = 0;
        this.expectedLength = 0;
    }
}

export default FixedChunkedParser;