import bindings from "bindings";
import { Http } from "./http";

export interface IHttpCore {
    registerRoutes(routes: Http.BuildedRoute[]): any;
    scannerRouteFirst(
        buffer: Buffer,
        reqObj: Http.ChunkProgression,
        maxHeaderNameSize: number,
        maxHeaderValueSize: number,
        maxContentLength: number,
        queryLimit: number
    ): number;
    scannerHeader(
        buffer: Buffer,
        reqObj: Http.ChunkProgression,
        maxHeaderNameSize: number,
        maxHeaderValueSize: number,
        maxContentLength: number
    ): void;
    printRouteTree(
        deepth: number
    ): void;
}

export interface ICPool {
    initializePool(size: number): void;
    registerObj(obj: object): number;
    allocate(): any | null;
    free(index: number): void;
    resizePool(newSize: number): void;
}

export interface IPublicAssetParser {
    setAssetRoute(publicPath: string): void;
    handlePublicAsset(curl: Buffer, offset: number): string;
}

export interface HypernodeAddon {
    HttpCore: {
        new (): IHttpCore;
    };
    CPool: {
        new (): ICPool;
    };
    PublicAssetParser: {
        new (): IPublicAssetParser
    };
    scanUrl(
        curl: Buffer,
        offset: number
    ): string;
}

export const hypernode = bindings("hypernode") as HypernodeAddon;