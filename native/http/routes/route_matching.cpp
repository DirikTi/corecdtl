//===----------------------------------------------------------------------===//
// RouteBuilder - Matcher Implementation
//===----------------------------------------------------------------------===//

#include "route.h"

#include <cassert>
#include <cstring>
#include <memory>

using namespace RouteBuilder;

namespace {

    //===------------------------------------------------------------------===//
    // Helper Functions
    //===------------------------------------------------------------------===//

    [[gnu::always_inline]] constexpr static uint64_t packedU64FromString(const char* __restrict src, size_t start, size_t end) {
        size_t len = end - start;
        if (len > 8) len = 8;

        uint64_t value = 0;

        switch(len) {
            case 8: value |= (uint64_t)(uint8_t)src[start+7] << 56; [[fallthrough]];
            case 7: value |= (uint64_t)(uint8_t)src[start+6] << 48; [[fallthrough]];
            case 6: value |= (uint64_t)(uint8_t)src[start+5] << 40; [[fallthrough]];
            case 5: value |= (uint64_t)(uint8_t)src[start+4] << 32; [[fallthrough]];
            case 4: value |= (uint64_t)(uint8_t)src[start+3] << 24; [[fallthrough]];
            case 3: value |= (uint64_t)(uint8_t)src[start+2] << 16; [[fallthrough]];
            case 2: value |= (uint64_t)(uint8_t)src[start+1] << 8; [[fallthrough]];
            case 1: value |= (uint64_t)(uint8_t)src[start+0]; break;
            default: break;
        }

        switch(len) {
            case 0: value |= (uint64_t)0xFF << 0; [[fallthrough]];
            case 1: value |= (uint64_t)0xFF << 8; [[fallthrough]];
            case 2: value |= (uint64_t)0xFF << 16; [[fallthrough]];
            case 3: value |= (uint64_t)0xFF << 24; [[fallthrough]];
            case 4: value |= (uint64_t)0xFF << 32; [[fallthrough]];
            case 5: value |= (uint64_t)0xFF << 40; [[fallthrough]];
            case 6: value |= (uint64_t)0xFF << 48; [[fallthrough]];
            case 7: value |= (uint64_t)0xFF << 56; break;
            default: break;
        }

        return value;
    }

    inline static bool nodeStaticMatches(const std::shared_ptr<RouteNode>& node,
                                                     const char* __restrict url,
                                                     uint32_t* offset) {
        uint64_t value_buffer = packedU64FromString(url, *offset, *offset + node->value_length);

        return (value_buffer == node->value);
    }

    inline static constexpr char hex_to_char(char h) noexcept {
        return (h >= '0' && h <= '9') ? (h - '0')
             : (h >= 'A' && h <= 'F') ? (h - 'A' + 10)
             : (h >= 'a' && h <= 'f') ? (h - 'a' + 10)
             : 0;
    }

    inline static std::string url_decode(const char* __restrict start, const char* __restrict end) {
        std::string out;
        out.reserve(end - start);

        const char* p = start;
        while (p < end) {
            char c = *p;
            if (c == '%') {
                if (p + 2 < end) {
                    char hi = hex_to_char(*(p + 1));
                    char lo = hex_to_char(*(p + 2));
                    out.push_back((hi << 4) | lo);
                    p += 3;
                    continue;
                }
            } else if (c == '+') {
                out.push_back(' ');
                ++p;
                continue;
            }

            out.push_back(c);
            ++p;
        }
        return out;
    }

    inline static bool parse_query_params(
        Napi::Env env,
        const char* __restrict url,
        uint32_t* __restrict offset,
        Napi::Object* query_params,
        uint32_t query_limit
    ) noexcept
    {
        const char* p = url + *offset;

        if (*p == '?') p++;

        uint32_t scanned = 0;

        const char* key_start = p;
        const char* val_start = nullptr;

        while (*p != '\0') {

            // ---- LAST POINT CONTROLLERS ----
            if (*p == ' ' || *p == '\r' || *p == '\n' || *p == '#') {
                break;
            }

            scanned++;

            if (scanned > query_limit) {
                return false; // QUERY LIMIT EXCEEDED
            }

            if (*p == '=') {
                val_start = p + 1;
            }
            else if (*p == '&') {

                const char* key_end = val_start ? (val_start - 1) : p;
                const char* val_end = val_start ? p : p;

                auto key = url_decode(key_start, key_end);
                auto value = val_start ? url_decode(val_start, val_end) : "";

                query_params->Set(key, value);

                key_start = p + 1;
                val_start = nullptr;
            }

            p++;
        }

        if (key_start && key_start < p) {
            const char* key_end = val_start ? (val_start - 1) : p;
            const char* val_end = val_start ? p : p;

            auto key = url_decode(key_start, key_end);
            auto value = val_start ? url_decode(val_start, val_end) : "";

            query_params->Set(key, value);
        }

        *offset += scanned;

        return true;
    }

} // namespace


//===----------------------------------------------------------------------===//
// matchUrl Implementation
//===----------------------------------------------------------------------===//
int RouteBuilder::matchUrl(
    Napi::Env env,
    const std::shared_ptr<RouteNode>& root,
    const char* url,
    size_t urlLen,
    uint32_t* offset,
    Napi::Array* path_params,
    Napi::Object* query_params,
    uint32_t query_limit
    ) noexcept
{
    auto node = root;

    if (!node) return -1;

    if (!node->is_param && node->value_length > 0) {
        if (!nodeStaticMatches(node, url, offset)) {
            return -1;
        }
        *offset += node->value_length;
    }

    uint32_t path_index = 0;
    bool matched = false;
    
    while (true) {
        matched = false;

        #pragma clang loop vectorize(disable)
        #pragma clang loop unroll(disable)
        for (auto& child : node->children) {
            if (!child) continue;
            // Line caches Opt
            // __builtin_prefetch(child.get(), 0, 1);

            if (child->is_param) [[unlikely]] {
                const char* p = url + *offset;
                size_t start = *offset;

                while (*p && *p != '/' && *p != '?' && *p != ' ') p++;
                __builtin_assume(p >= url && p <= url + urlLen);

                size_t param_len = p - (url + start);
                std::string param_value(url + start, param_len);

                path_params->Set(path_index++, Napi::String::New(env, param_value));
                
                *offset += param_len;
                
                node = child;
                matched = true;

                if (__builtin_expect((child->vptr_table_index != -1) && (url[*offset] == ' ' || url[*offset] == '?'), 1)) {
                    if (url[*offset] == '?') {
                        if (!parse_query_params(env, url, offset, query_params, query_limit)) return -2;
                        *offset += 1;
                    }
                    return child->vptr_table_index;
                }
                *offset += 1;
                break;
            }
            else [[likely]] {
                if (child->is_wildcard) [[unlikely]] {
                    #pragma clang loop vectorize(disable)
                    #pragma clang loop unroll(disable)
                    while (url[*offset] != ' ') {
                        if (*offset > 1000) return -3;
                        if (url[*offset] == '?') {
                           if(!parse_query_params(env, url, offset, query_params, query_limit)) return -2;
                           *offset += 1;
                           break;
                        }
                        *offset += 1;
                    }
                    return child->vptr_table_index;
                }

                if (nodeStaticMatches(child, url, offset)) {
                    *offset += child->value_length;

                    node = child;
                    matched = true;
                    
                    if (child->vptr_table_index != -1 && (url[*offset] == ' ' || url[*offset] == '?')) {
                        // Parse Query
                        if (url[*offset] == '?') {
                           if(!parse_query_params(env, url, offset, query_params, query_limit)) return -2;
                           *offset += 1;
                        }
                        return child->vptr_table_index;
                    }
                    break;
                }
            }
        }

        if (!matched) break;
    }

    return -1;
}
