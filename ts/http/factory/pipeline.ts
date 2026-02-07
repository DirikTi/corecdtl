import { isAsyncFunction } from "util/types";
import { Http } from "../../http";

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

function createMwsInline(mws: (Http.Middleware | Http.EndpointHandleFn)[] ) {
    let ret = ``;

    for (let i = 0; i < mws.length; i++) {
        const mw = mws[i];
        if (isAsyncFunction(mw)) {
            ret += `!res.finishedFlag && await mws[${i}](req, res);\n`;
        } else {
            ret += `!res.finishedFlag && mws[${i}](req, res);\n`; // await yok
        }
    }

    return { inlineCode: ret };
}

function createPipeline(
    ep: Http.Endpoint,
    pipeFns: Http.MiddlewareHandleFn[]
) {
    const hasAsync = pipeFns.some(mw => isAsyncFunction(mw));
    const { inlineCode } = createMwsInline(pipeFns);
    const PipelineCtor = hasAsync ? AsyncFunction : Function;

    const setRequestObj = `const req = {
    headers: p.headers,
    params: p.params,
    query: p.query,
    url: ""`;


    // -----------------------
    // GET & HEAD (NO BODY)
    // -----------------------
    if (ep.method === Http.HttpMethod.GET || ep.method === Http.HttpMethod.HEAD) {
        
        return new PipelineCtor("p", "mws", "cb", `
            ${setRequestObj}
            };

            const res = p.allocateResp();

            ${inlineCode}
            ret = res.getResp();
            res.freeCPool();
            cb(ret);
        `);

    }

    // -----------------------
    // BODY PIPELINE
    // -----------------------

    const content = ep.ct;

    // DECODING
    let decodeStep = "";
    let bVar = "b";

    if (content?.encoding) {
        decodeStep = `
        if (${bVar} != null) {
            ${bVar} = contentDecodingTable["${content.encoding}"](${bVar});
        }`;
    } else if (content?.encoding === null) {
        decodeStep = `/* no encoding */`;
    } else {
        decodeStep = `
        if (${bVar} != null && p.headers["content-encoding"]) {
            const enc = p.headers["Content-Encoding"];
            if (contentDecodingTable[enc]) {
                ${bVar} = contentDecodingTable[enc](${bVar});
            }
        }`;
    }

    // PARSING
    let bodyParser = "";

    if (content?.type) {
        bodyParser = `
            ${bVar} = contentTypeTable["${content.type}"](${bVar});
        `;
    } else if (content?.type === null) {
        bodyParser = `/* no content-type parser */`;
    } else {
        bodyParser = `
           if (${bVar} != null) {
                const ctype = p.headers["content-type"];
                ${bVar} = contentTypeTable[ctype]?.(${bVar}) ?? ${bVar};
            }
        `;
    }

    return new PipelineCtor(
    "b",
    "p",
    "contentTypeTable",
    "contentDecodingTable",
    "mws",
    "cb",
    `
        ${decodeStep}
        ${bodyParser}

        ${setRequestObj},
            body: ${bVar}
        };

        const res = p.allocateResp();
        ${inlineCode}
        let ret = res.getResp();
        res.freeCPool();
        cb(ret);
    `);

}

export { createPipeline };
