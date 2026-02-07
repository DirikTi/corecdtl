enum StreamingChunkedState {
    READ_SIZE,
    READ_DATA,
    READ_CRLF,
    FINISHED
}

class StreamingChunkedParser {
    private residualBuffer: Buffer | null = null;
    
    private state: StreamingChunkedState = StreamingChunkedState.READ_SIZE;
    private expected: number = 0;
    private bodyParts: Buffer[] = [];
    private totalSize: number = 0;

    constructor() {}

    write(data: Buffer): void {
        let currentBuffer: Buffer;
        
        if (this.residualBuffer) {
            currentBuffer = Buffer.concat([this.residualBuffer, data]);
            this.residualBuffer = null;
        } else {
            currentBuffer = data;
        }

        let readIndex = 0;
        const writeIndex = currentBuffer.length;
        
        // 2. State Machine (Sadece currentBuffer üzerinde ilerler)
        while (readIndex < writeIndex && this.state !== StreamingChunkedState.FINISHED) {
            const available = writeIndex - readIndex;

            if (this.state === StreamingChunkedState.READ_SIZE) {
                // Sadece mevcut Buffer'ın sınırı içinde \r\n ara
                const idx = currentBuffer.indexOf('\r\n', readIndex);

                if (idx === -1 || idx >= writeIndex) break; 

                // Hex boyutu çıkar
                const hexSize = currentBuffer.toString('ascii', readIndex, idx);
                this.expected = parseInt(hexSize, 16);

                readIndex = idx + 2;

                if (this.expected === 0) {
                    this.state = StreamingChunkedState.FINISHED;
                    break;
                }

                this.state = StreamingChunkedState.READ_DATA;
            }

            if (this.state === StreamingChunkedState.READ_DATA) {
                if (available < this.expected) break;

                const chunk = currentBuffer.subarray(readIndex, readIndex + this.expected);
                this.bodyParts.push(chunk);
                this.totalSize += chunk.length;

                readIndex += this.expected;
                this.state = StreamingChunkedState.READ_CRLF;
            }

            if (this.state === StreamingChunkedState.READ_CRLF) {
                if (available < 2) break;

                readIndex += 2;
                this.expected = 0;
                this.state = StreamingChunkedState.READ_SIZE;
            }
        }

        if (readIndex < writeIndex) {
            this.residualBuffer = currentBuffer.subarray(readIndex);
        } else {
            this.residualBuffer = null;
        }
    }

    /**
     * Mark the parser as finished. This is optional: external HTTP logic
     * may simply stop calling `.write()` after the stream ends.
     */
    finish(): void {
        
    }

    isFinished(): boolean {
        return this.state === StreamingChunkedState.FINISHED;
    }

    getBody(): Buffer {
        return Buffer.concat(this.bodyParts, this.totalSize);
    }

    getTotalSize(): Number {
        return this.totalSize;
    }

    free(): void {
        this.residualBuffer = null;
        this.state = StreamingChunkedState.READ_SIZE;
        this.expected = 0;
        this.bodyParts.length = 0;
        this.totalSize = 0;
    }
}

export default StreamingChunkedParser;