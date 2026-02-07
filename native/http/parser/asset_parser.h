#pragma once
#include <napi.h>
#include <string>
#include "asset_meta.h"

class PublicAssetParser : public Napi::ObjectWrap<PublicAssetParser> {
public:
    static Napi::Function GetClass(Napi::Env env);

    PublicAssetParser(const Napi::CallbackInfo& info);
    ~PublicAssetParser() = default;

    void SetAssetRoute(const Napi::CallbackInfo& info);
    Napi::Value HandlePublicAsset(const Napi::CallbackInfo& info);

private:
    std::string assetRouteName;
    size_t assetRouteLen;
    Asset::AssetIndex assetIndex;
};
