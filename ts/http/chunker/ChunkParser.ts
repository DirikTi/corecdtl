import FixedChunkedParser from "./FixedChunkedParser";
import StreamingChunkedParser from "./StreamingChunkedParser";
import { UntilEndChunkedParser } from "./UntilEndChunkerParser";

export interface ChunkParser {
    streaming: StreamingChunkedParser;
    fixed: FixedChunkedParser;
    untilEnd: UntilEndChunkedParser;
}