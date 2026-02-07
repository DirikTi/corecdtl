import { gunzipSync, brotliDecompressSync, inflateSync, gzipSync, brotliCompressSync, deflateSync } from "zlib";
import { Http } from "../../http";

function gzipDecodeFn(b: Buffer) {
    try { 
        return gunzipSync(b); 
    } catch (e) { 
        return null; 
    }
}

function brotliDecodeFn(b: Buffer) {
    try { 
        return brotliDecompressSync(b); 
    } catch (e) { 
        return null; 
    }
}

function deflateFn(b: Buffer) {
    try { 
        return inflateSync(b); 
    } catch (e) { 
        return null;
    }
}

export const contentDecodingTable: Http.ContentDecoding = {
    gzip: gzipDecodeFn,
    br: brotliDecodeFn,
    deflate: deflateFn,
};

export const contentEncodingTable: Http.ContentEncoding = {
    gzip: (b) => gzipSync(b),
    br: (b) => brotliCompressSync(b),
    deflate: (b) => deflateSync(b)
};
