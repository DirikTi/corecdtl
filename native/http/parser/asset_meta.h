#pragma once
#include <cstdint>
#include <cstring>
#include <unordered_map>

namespace Asset {
    enum class CacheKind : uint8_t {
        RAM,
        MMAP,
        SENDFILE
    };

    struct UrlKey {
        const char* data;
        size_t len;

        bool operator==(const UrlKey& other) const {
            if (len != other.len) return false;
            return std::memcmp(data, other.data, len) == 0;
        }
    };

    struct UrlHash {
        size_t operator()(const UrlKey& k) const noexcept;
    };

    struct UrlEq {
        bool operator()(const UrlKey& a, const UrlKey& b) const noexcept;
    };
    

    struct AssetMeta {
        const char* path;     
        uint32_t    pathLen;
        int         fd;       
        uint64_t    size;
        uint64_t    mtime;
        CacheKind   kind;
        void* data;     
        uint64_t    dataLen;
        uint64_t    etag;     
    };

    class AssetIndex {
    public:
        using MapType = std::unordered_map<UrlKey, AssetMeta*, UrlHash, UrlEq>;
        AssetIndex();
        void add(const char* path, uint32_t len, AssetMeta* meta);
        AssetMeta* find(const char* path, uint32_t len) const noexcept;
    private:
        MapType index;
    };
}