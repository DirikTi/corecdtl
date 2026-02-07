import { ChunkParser } from "./ChunkParser";
import { Http } from "../../http";
import FixedChunkedParser from "./FixedChunkedParser";
import StreamingChunkedParser from "./StreamingChunkedParser";
import { UntilEndChunkedParser } from "./UntilEndChunkerParser";

class ChunkProgression {
    objId: number;
    fn: Function;
    chunkParser: ChunkParser;
    contentLen?: number;
    routePipe: any;
    params: string[];
    headers: Record<string, string | Array<string>>;
    query: any;
    method: Http.HttpMethod;
    headerSize: number;
    mainOffset: number;
    retFlag: number;
    rawBuf: Buffer;
    
    private respCpool: any;
    private cPool: any;
    private parseInitial: any;

    constructor(cPool: any, parseInitial: Function, respCpool: any) {
        this.cPool = cPool;
        this.fn = parseInitial;
        this.chunkParser = {
            streaming: new StreamingChunkedParser(),
            fixed: new FixedChunkedParser(),
            untilEnd: new UntilEndChunkedParser()
        };
        this.contentLen = undefined;
        this.routePipe = null;
        this.params = [];
        this.headers = {};
        this.query = {};
        this.method = Http.HttpMethod.GET;
        this.headerSize = 0;
        this.mainOffset = 0;
        this.retFlag = Http.RetFlagBits.FLAG_OK;
        this.rawBuf = Buffer.allocUnsafe(0);
        this.objId = cPool.registerObj(this);
        this.respCpool = respCpool;
        this.parseInitial = parseInitial;
    }

    allocateResp() {
        let ret = this.respCpool.allocate();
        return ret;
    }

    reset() {
        this.fn = this.parseInitial;
        this.contentLen = undefined;
        this.routePipe = null;
        this.params = [];
        this.headers = {};
        this.query = {};
        this.method = Http.HttpMethod.GET;
        this.headerSize = 0;
        this.mainOffset = 0;
        this.retFlag = Http.RetFlagBits.FLAG_OK;
        this.rawBuf = Buffer.allocUnsafe(0);
    }

    free() {
        this.reset();
        this.cPool.free(this.objId);
    }
}

export default ChunkProgression;