import { Http } from "../../http";
import net from "net";

export function createAccumulators(ctx: {
    contentTypeParsers: Http.ContentTypeParser;
    contentDecoding: Http.ContentDecoding;
    errorRespMap: Http.HttpStaticResponseMap;
}) {
    const {
        contentTypeParsers,
        contentDecoding,
        errorRespMap
    } = ctx;
    
    function accumulatorHeadGet(socket: net.Socket, p: Http.ChunkProgression) {
        socket.pause();
        p.routePipe!.pipeHandler(p, p.routePipe!.mws, (ret: any) => {
            socket.write(ret);
            const con = p.headers.connection;
            if (con == "close") socket.destroySoon();
            else {
                p.reset();
                socket.resume();   
            }
        });
    }

    // ==============================
    // UNTIL-END MODE
    // ==============================
    function accumulateUntilEnd(socket: net.Socket, chunk: Buffer, p: Http.ChunkProgression) {

        if (p.rawBuf.length + chunk.length > p.routePipe!.maxContentSize) {
            socket.write(errorRespMap.RESP_413);
            socket.destroy();
            return;
        }

        p.chunkParser.untilEnd.write(chunk);
    }

    // ==============================
    // FIXED LENGTH MODE
    // ==============================
    async function accumulateDef(socket: net.Socket, chunk: Buffer, p: Http.ChunkProgression) {

        const acc = p.chunkParser.fixed;
        const progress = acc.getTotalWrittenSize() + chunk.length;
        if (progress > p.contentLen!) {
            socket.write(errorRespMap.RESP_400);
            socket.destroy();
            return;
        }
        if (progress > p.routePipe!.maxContentSize) {
            socket.write(errorRespMap.RESP_413);
            socket.destroy();
            return;
        }

        acc.write(chunk);
        // BODY DONE
        if (progress === p.contentLen) {
            socket.pause();

            const b = acc.getBody();
            acc.free();

            const ret = await p.routePipe!.pipeHandler(
                b, p, contentTypeParsers, contentDecoding, p.routePipe!.mws, 
                (ret: any) => {
                    socket.write(ret);
                    
                    const con = p.headers.Connection;
                    if (con == "close") socket.destroySoon();
                    else {
                        p.reset();
                        socket.resume();
                    }
                }
            );

        }
    }

    // ==============================
    // CHUNKED MODE (Sync handler, async final processing)
    // ==============================
    function accumulateChunked(socket: net.Socket, chunk: Buffer<ArrayBufferLike>, p: Http.ChunkProgression) {
        const total = p.chunkParser.streaming.getTotalSize();
        // @ts-ignore
        if (total + chunk.length > p.routePipe!.maxContentSize) {
            socket.write(errorRespMap.RESP_400);
            socket.end();
            return;   
        }

        p.chunkParser.streaming.write(chunk);

        if (!p.chunkParser.streaming.isFinished()) {
            return;
        }

        socket.pause();
        const b = p.chunkParser.streaming.getBody();
        p.chunkParser.streaming.free();

        p.routePipe!.pipeHandler(
            b,
            p,
            contentTypeParsers,
            contentDecoding,
            p.routePipe!.mws,
            (ret: any) => {
                socket.write(ret);
                const con = p.headers.connection;
                if (con == "close") socket.destroySoon();
                else {
                    p.reset();
                    socket.resume();   
                }
            }
        )
    }

    // ==============================
    // DESICION ACCUMULATE AFTER HEADERS
    // ==============================
    function decisionAccumulate(socket: net.Socket, p: Http.ChunkProgression) {
        const h = p.headers;
        const transferEnc = h["transfer-encoding"];
        const contentLenStr = h["content-length"] as string;
        // ───────────────────────────────────────────────
        // 1) CHUNKED MODE (Transfer-Encoding: chunked)
        // ───────────────────────────────────────────────
        if (transferEnc === "chunked") {
            const already = p.rawBuf.slice(p.mainOffset);
            p.fn = accumulateChunked;
            // İlk chunk'ı senkron olarak işle
            accumulateChunked(socket, already, p);
            return;
        }

        // ───────────────────────────────────────────────
        // 2) UNTIL_END MODE (no content-length)
        // ───────────────────────────────────────────────
        if (!contentLenStr) {
            if (!p.routePipe!.untilEnd) {
                socket.write(errorRespMap.RESP_400);
                socket.destroySoon();
                return;
            }
            socket.on("end", () => {
                const b = p.chunkParser.untilEnd.getBody();
                p.routePipe!.pipeHandler(b, p, contentTypeParsers, contentDecoding, p.routePipe!.mws, () => {
                    p.chunkParser.untilEnd.free();
                    socket.destroy();
                    return;
                });
            });
            p.fn = accumulateUntilEnd;
            return;
        }

        // ───────────────────────────────────────────────
        // 3) FIXED MODE (content-length N)
        // ───────────────────────────────────────────────
        p.contentLen = parseInt(contentLenStr);

        // Empty body
        if (p.contentLen === 0) {
            socket.pause();
            p.routePipe!.pipeHandler(
                null, p, contentTypeParsers, contentDecoding, p.routePipe!.mws,
                (ret: any) => {
                    socket.write(ret);

                    const con = h.connection;
                    if (con == "close") socket.destroySoon();
                    else {
                        p.reset();
                        socket.resume();
                    }
                }
            )
            
            return;
        }

        const already = p.rawBuf.slice(p.mainOffset);

        // ───────────────────────────────────────────────
        // exact match (body fully arrived)
        // ───────────────────────────────────────────────
        if (already.length === p.contentLen) {
            // socket.pause();

            p.routePipe!.pipeHandler(
                already, p, contentTypeParsers, contentDecoding, p.routePipe!.mws, (ret: any) => {
                    socket.write(ret);

                    if (h.connection == "close") {
                        socket.destroySoon();
                    }
                    else {
                        p.reset();
                        socket.resume();
                    }
                }
            )

            return;
        }

        // ───────────────────────────────────────────────
        // overflow attempt → reject immediately
        // ───────────────────────────────────────────────
        if (already.length > p.contentLen) {
            socket.write(errorRespMap.RESP_400);
            socket.destroySoon();
            return;
        }

        // ───────────────────────────────────────────────
        // incomplete → use FIXED accumulator
        // ───────────────────────────────────────────────
        p.chunkParser.fixed.allocateBuffer(p.contentLen);
        p.chunkParser.fixed.write(already);

        p.fn = accumulateDef;
    }

    async function accumulatorDefinedType(socket: net.Socket, p: Http.ChunkProgression) {
        const h = p.headers;
        if (p.routePipe!.ct!.type !== h["content-type"]) {
            socket.write(errorRespMap.RESP_400);
            socket.destroy();
            return;
        }

        await decisionAccumulate(socket, p);
    }

    async function accumulatorDefinedEncode(socket: net.Socket, p: Http.ChunkProgression) {
        const h = p.headers;

        if (p.routePipe!.ct!.encoding !== h["content-encoding"]) {
            socket.write(errorRespMap.RESP_400);
            socket.destroy();
            return;
        }

        await decisionAccumulate(socket, p);
    }

    async function accumulatorDefinedTypeEncode(socket: net.Socket, p: Http.ChunkProgression) {
        const h = p.headers;

        if (p.routePipe!.ct!.type !== h["content-type"]) {
            socket.write(errorRespMap.RESP_400);
            socket.destroy();
            return;
        }

        if (p.routePipe!.ct!.encoding !== h["content-encoding"]) {
            socket.write(errorRespMap.RESP_400);
            socket.destroy();
            return;
        }

        await decisionAccumulate(socket, p);
    }

    return {
        accumulatorHeadGet,
        decisionAccumulate,
        accumulatorDefinedType,
        accumulatorDefinedEncode,
        accumulatorDefinedTypeEncode
    };
}