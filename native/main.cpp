#include <napi.h>

#include "http_scanner.h"
#include <asset_parser.h>
#include <cpool.h>
#include <asset_parser.h>

inline const char* scan_url(
    const char* __restrict curl,
    uint32_t* __restrict offset
) {
    uint32_t i = *offset;
    const char* url_start = curl + i;

    while (true) {
        char c = curl[i];

        if (c == ' ' || c == '?') {
            *offset = i;        
            return url_start;
        }
        ++i;
    }
}

Napi::Value ScanUrl(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsNumber()) [[unlikely]] {
        Napi::TypeError::New(env, "Expected (curl: Buffer, offset: number)").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    auto buf = info[0].As<Napi::Buffer<char>>();
    const char* curl = buf.Data();
    uint32_t offset = info[1].As<Napi::Number>().Uint32Value();

    const char* url = scan_url(curl, &offset);

    return Napi::String::New(env, url);
}


Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("HttpCore", HttpCore::GetClass(env));
    exports.Set("PublicAssetParser", PublicAssetParser::GetClass(env));
    
    exports.Set("scanUrl", Napi::Function::New(env, ScanUrl));

    exports.Set("CPool", CPool::GetClass(env));
    return exports;
}

NODE_API_MODULE(hypernode, Init)
