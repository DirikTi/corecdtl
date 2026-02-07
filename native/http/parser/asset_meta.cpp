#pragma once
#include <unordered_map>
#include "asset_meta.h"

namespace Asset {
    size_t UrlHash::operator()(const UrlKey& k) const noexcept {
        // FNV-1a 64-bit
        size_t h = 1469598103934665603ULL;
        for (size_t i = 0; i < k.len; ++i) {
            h ^= static_cast<uint8_t>(k.data[i]);
            h *= 1099511628211ULL;
        }
        return h;
    }

    bool UrlEq::operator()(const UrlKey& a, const UrlKey& b) const noexcept {
        return a == b;
    }

    AssetIndex::AssetIndex() = default;

    void AssetIndex::add(const char* path, uint32_t len, AssetMeta* meta) {
        index.emplace(UrlKey{ path, (size_t)len }, meta);
    }

    AssetMeta* AssetIndex::find(const char* path, uint32_t len) const noexcept {
        UrlKey key{ path, len };
        auto it = index.find(key);
        return it == index.end() ? nullptr : it->second;
    }
}
