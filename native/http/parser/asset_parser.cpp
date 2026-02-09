#include "asset_parser.h"
#include "asset_meta.h"
#include <iostream>

using namespace Asset;

inline CacheKind decideCacheKind(uint64_t size) {
    if (size <= 64 * 1024)
        return Asset::CacheKind::RAM;
    if (size <= 2 * 1024 * 1024)
        return Asset::CacheKind::MMAP;
    return Asset::CacheKind::SENDFILE;
}

Napi::Function PublicAssetParser::GetClass(Napi::Env env) {
    return DefineClass(env, "PublicAssetParser", {
        InstanceMethod("setAssetRoute", &PublicAssetParser::SetAssetRoute),
        InstanceMethod("handlePublicAsset", &PublicAssetParser::HandlePublicAsset)
    });
}

PublicAssetParser::PublicAssetParser(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<PublicAssetParser>(info),
      assetRouteLen(0) {}

void PublicAssetParser::SetAssetRoute(const Napi::CallbackInfo& info) {
    const std::string route = info[0].As<Napi::String>();
    assetRouteName = route;
    assetRouteLen  = route.length();
}

Napi::Value PublicAssetParser::HandlePublicAsset(
    const Napi::CallbackInfo& info
) {
    Napi::Env env = info.Env();
    
    const char* buf = info[0].As<Napi::Buffer<char>>().Data();
    size_t startOffset = info[1].As<Napi::Number>().Uint32Value();
    
    size_t i = startOffset + assetRouteLen;
    size_t begin = i;

    while (buf[i] != '?' && buf[i] != ' ' && buf[i] != '\0') {
        ++i;
    }
    
    size_t pathLen = i - begin;
    const char* path = buf + begin;
    
    return Napi::String::New(env, path, pathLen);
}
