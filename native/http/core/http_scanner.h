#include <string>
#include <cstdint>
#include <napi.h>
#include <iostream>

#include "http_core.h"

FlagBits scanHeaders(
    Napi::Env env, const char* buf, size_t total, uint32_t* offset,
    uint32_t maxContentLength, uint32_t maxHeaderNameSize, uint32_t maxHeaderValueSize,
    uint32_t currentHeaderSize, MethodType method, Napi::Object* outHeaders
);

#if defined(__ARM_NEON) || defined(__ARM_NEON__)
    #define SIMD_NEON 1
#elif defined(__SSE2__)
    #define SIMD_SSE2 1
#else
    #error "No SIMD backend"
#endif

#if SIMD_SSE2
    #include <immintrin.h>
    using uint128_t = __m128i;
    static inline __m128i mask128_sse(unsigned n) {
        static const uint8_t masks[17][16] = {
            {0},
            {0xFF},
            {0xFF,0xFF},
            {0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
        };
        return _mm_loadu_si128((const __m128i*)masks[n]);
    }
#elif SIMD_NEON
    #include <arm_neon.h>
    using uint128_t = uint8x16_t;
    static inline uint8x16_t mask128_neon(unsigned n) {
        static const uint8_t table[17][16] = {
            {0},
            {0xFF},
            {0xFF,0xFF},
            {0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF},
            {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF}
        };
        return vld1q_u8(table[n]);
    }
#endif

namespace HttpScanner {

    struct alignas(16) Pack128 {
        uint64_t lo;
        uint64_t hi;
    };


    constexpr uint64_t PACK8(const char* s) {
        uint64_t v = 0;
        for (int i = 0; i < 8; ++i) {
            if (s[i] == '\0') break; // String bittiğinde döngüden çık
            v |= (static_cast<uint64_t>(static_cast<uint8_t>(s[i])) << (i * 8));
        }
        return v;
    }

    constexpr Pack128 PACK16_9(
        char c0, char c1, char c2, char c3,
        char c4, char c5, char c6, char c7,
        char c8
    ) {
        return Pack128{
            uint64_t(c0) |
            (uint64_t(c1) << 8) |
            (uint64_t(c2) << 16) |
            (uint64_t(c3) << 24) |
            (uint64_t(c4) << 32) |
            (uint64_t(c5) << 40) |
            (uint64_t(c6) << 48) |
            (uint64_t(c7) << 56),

            uint64_t(c8)
        };
    }

    constexpr Pack128 PACK16_10(
        char c0, char c1, char c2, char c3,
        char c4, char c5, char c6, char c7,
        char c8, char c9
    ) {
        return Pack128{
            uint64_t(c0) |
            (uint64_t(c1) << 8) |
            (uint64_t(c2) << 16) |
            (uint64_t(c3) << 24) |
            (uint64_t(c4) << 32) |
            (uint64_t(c5) << 40) |
            (uint64_t(c6) << 48) |
            (uint64_t(c7) << 56),

            uint64_t(c8) |
            (uint64_t(c9) << 8)
        };
    }

    constexpr Pack128 PACK16_11(
        char c0, char c1, char c2, char c3,
        char c4, char c5, char c6, char c7,
        char c8, char c9, char c10
    ) {
        return Pack128{
            uint64_t(c0) |
            (uint64_t(c1) << 8) |
            (uint64_t(c2) << 16) |
            (uint64_t(c3) << 24) |
            (uint64_t(c4) << 32) |
            (uint64_t(c5) << 40) |
            (uint64_t(c6) << 48) |
            (uint64_t(c7) << 56),

            uint64_t(c8) |
            (uint64_t(c9) << 8) |
            (uint64_t(c10) << 16)
        };
    }

    constexpr Pack128 PACK16_12(
        char c0, char c1, char c2, char c3,
        char c4, char c5, char c6, char c7,
        char c8, char c9, char c10, char c11
    ) {
        return Pack128{
            uint64_t(c0) |
            (uint64_t(c1) << 8) |
            (uint64_t(c2) << 16) |
            (uint64_t(c3) << 24) |
            (uint64_t(c4) << 32) |
            (uint64_t(c5) << 40) |
            (uint64_t(c6) << 48) |
            (uint64_t(c7) << 56),

            uint64_t(c8) |
            (uint64_t(c9) << 8) |
            (uint64_t(c10) << 16) |
            (uint64_t(c11) << 24)
        };
    }

    constexpr Pack128 PACK16_13(
        char c0, char c1, char c2, char c3,
        char c4, char c5, char c6, char c7,
        char c8, char c9, char c10, char c11,
        char c12
    ) {
        return Pack128{
            uint64_t(c0) |
            (uint64_t(c1) << 8) |
            (uint64_t(c2) << 16) |
            (uint64_t(c3) << 24) |
            (uint64_t(c4) << 32) |
            (uint64_t(c5) << 40) |
            (uint64_t(c6) << 48) |
            (uint64_t(c7) << 56),

            uint64_t(c8) |
            (uint64_t(c9) << 8) |
            (uint64_t(c10) << 16) |
            (uint64_t(c11) << 24) |
            (uint64_t(c12) << 32)
        };
    }

    constexpr Pack128 PACK16_14(
        char c0, char c1, char c2, char c3,
        char c4, char c5, char c6, char c7,
        char c8, char c9, char c10, char c11,
        char c12, char c13
    ) {
        return Pack128{
            uint64_t(c0) |
            (uint64_t(c1) << 8) |
            (uint64_t(c2) << 16) |
            (uint64_t(c3) << 24) |
            (uint64_t(c4) << 32) |
            (uint64_t(c5) << 40) |
            (uint64_t(c6) << 48) |
            (uint64_t(c7) << 56),

            uint64_t(c8) |
            (uint64_t(c9) << 8) |
            (uint64_t(c10) << 16) |
            (uint64_t(c11) << 24) |
            (uint64_t(c12) << 32) |
            (uint64_t(c13) << 40)
        };
    }

    constexpr Pack128 PACK16_15(
        char c0, char c1, char c2, char c3,
        char c4, char c5, char c6, char c7,
        char c8, char c9, char c10, char c11,
        char c12, char c13, char c14
    ) {
        return Pack128{
            uint64_t(c0) |
            (uint64_t(c1) << 8) |
            (uint64_t(c2) << 16) |
            (uint64_t(c3) << 24) |
            (uint64_t(c4) << 32) |
            (uint64_t(c5) << 40) |
            (uint64_t(c6) << 48) |
            (uint64_t(c7) << 56),

            uint64_t(c8) |
            (uint64_t(c9) << 8) |
            (uint64_t(c10) << 16) |
            (uint64_t(c11) << 24) |
            (uint64_t(c12) << 32) |
            (uint64_t(c13) << 40) |
            (uint64_t(c14) << 48)
        };
    }

    constexpr Pack128 PACK16_16(
        char c0, char c1, char c2, char c3,
        char c4, char c5, char c6, char c7,
        char c8, char c9, char c10, char c11,
        char c12, char c13, char c14, char c15
    ) {
        return Pack128{
            uint64_t(c0) |
            (uint64_t(c1) << 8) |
            (uint64_t(c2) << 16) |
            (uint64_t(c3) << 24) |
            (uint64_t(c4) << 32) |
            (uint64_t(c5) << 40) |
            (uint64_t(c6) << 48) |
            (uint64_t(c7) << 56),

            uint64_t(c8) |
            (uint64_t(c9) << 8) |
            (uint64_t(c10) << 16) |
            (uint64_t(c11) << 24) |
            (uint64_t(c12) << 32) |
            (uint64_t(c13) << 40) |
            (uint64_t(c14) << 48) |
            (uint64_t(c15) << 54)
        };
    }

    constexpr uint8_t tolower_c(uint8_t c) {
        return (c >= 'A' && c <= 'Z') ? (c | 0x20) : c;
    }

    constexpr Pack128 PACK16_LOWER(const char* s) {
        Pack128 p{0,0};

        for (int i = 0; i < 8; ++i)
            p.lo |= uint64_t(tolower_c(s[i])) << (i * 8);

        for (int i = 0; i < 8; ++i)
            p.hi |= uint64_t(tolower_c(s[i + 8])) << (i * 8);

        return p;
    }

    constexpr unsigned lit_len(const char* s) {
        unsigned n = 0;
        while (s[n] && n < 16) ++n;
        return n;
    }
    
    constexpr uint64_t MASK_U64_2BYTE = 0x000000000000FFFFULL;
    constexpr uint64_t MASK_U64_3BYTE = 0x0000000000FFFFFFULL;
    constexpr uint64_t MASK_U64_4BYTE = 0x00000000FFFFFFFFULL;
    constexpr uint64_t MASK_U64_5BYTE = 0x000000FFFFFFFFFFULL;
    constexpr uint64_t MASK_U64_6BYTE = 0x0000FFFFFFFFFFFFULL;
    constexpr uint64_t MASK_U64_7BYTE = 0x00FFFFFFFFFFFFFFULL;
    ///
    
    enum HeaderId : uint16_t {
        HDR_UNKNOWN = 0,

        // ─────────────
        // SINGLETON (policy critical)
        // ─────────────
        HDR_HOST,
        HDR_CONTENT_LENGTH,
        HDR_TRANSFER_ENCODING,
        HDR_CONTENT_TYPE,
        HDR_CONTENT_RANGE,
        HDR_AUTHORIZATION,
        HDR_PROXY_AUTHORIZATION,
        HDR_USER_AGENT,
        HDR_RANGE,
        HDR_EXPECT,
        HDR_IF_MATCH,
        HDR_IF_NONE_MATCH,
        HDR_IF_MODIFIED_SINCE,
        HDR_IF_UNMODIFIED_SINCE,
        HDR_REFERER,
        HDR_ORIGIN,
        HDR_DATE,

        // ─────────────
        // MULTI (no merge, order matters)
        // ─────────────
        HDR_SET_COOKIE,
        HDR_WARNING,
        HDR_WWW_AUTHENTICATE,
        HDR_PROXY_AUTHENTICATE,
        HDR_LINK,
        HDR_VIA,

        // ─────────────
        // MERGEABLE (comma-separated)
        // ─────────────
        HDR_ACCEPT,
        HDR_ACCEPT_LANGUAGE,
        HDR_ACCEPT_ENCODING,
        HDR_ACCEPT_RANGES,
        HDR_ALLOW,
        HDR_CACHE_CONTROL,
        HDR_CONNECTION,
        HDR_PRAGMA,
        HDR_UPGRADE,
        HDR_TRAILER,
        HDR_TE,
        HDR_VARY,

        // ─────────────
        // NORMAL / KNOWN (no strict policy)
        // ─────────────
        HDR_COOKIE,
        HDR_ETAG,
        HDR_LAST_MODIFIED,
        HDR_EXPIRES,
        HDR_SERVER,
        HDR_LOCATION,

        // Security / Fetch / Browser
        HDR_REFERER_POLICY,
        HDR_SEC_FETCH_SITE,
        HDR_SEC_FETCH_MODE,
        HDR_SEC_FETCH_DEST,
        HDR_SEC_FETCH_USER,
        HDR_DNT,

        // Proxy / Forwarding (de-facto)
        HDR_X_FORWARDED_FOR,
        HDR_X_FORWARDED_PROTO,
        HDR_X_FORWARDED_HOST,
        HDR_X_REAL_IP
    };

    typedef FlagBits (*hv_value_parser_fn)(
        const char* __restrict buf, 
        uint32_t* __restrict __offset, 
        size_t total, 
        uint32_t maxHeaderValueSize, 
        std::unique_ptr<std::string>& hv
    );

    typedef struct {
        const char* name;                 // lowercase header name
        hv_value_parser_fn value_parser;   // value parsing strategy
    } HeaderDesc;

    FlagBits hv_get_value_number(
        const char* __restrict buf, 
        uint32_t* __restrict __offset, 
        size_t total, 
        uint32_t maxHeaderValueSize, 
        std::unique_ptr<std::string>& hv
    );
    FlagBits hv_get_value_any(
        const char* __restrict buf, 
        uint32_t* __restrict __offset, 
        size_t total, 
        uint32_t maxHeaderValueSize, 
        std::unique_ptr<std::string>& hv
    );

    const HeaderDesc HEADERS[] = {
        { "unknown", hv_get_value_any },

        // SINGLETON
        { "host", hv_get_value_any },
        { "content-length", hv_get_value_number },
        { "transfer-encoding", hv_get_value_any },
        { "content-type", hv_get_value_any },
        { "content-range", hv_get_value_any },
        { "authorization", hv_get_value_any },
        { "proxy-authorization", hv_get_value_any },
        { "user-agent", hv_get_value_any },
        { "range", hv_get_value_any },
        { "expect", hv_get_value_any },
        { "if-match", hv_get_value_any },
        { "if-none-match", hv_get_value_any },
        { "if-modified-since", hv_get_value_any },
        { "if-unmodified-since", hv_get_value_any },
        { "referer", hv_get_value_any },
        { "origin", hv_get_value_any },
        { "date", hv_get_value_any },

        // MULTI
        { "set-cookie", hv_get_value_any },
        { "warning", hv_get_value_any },
        { "www-authenticate", hv_get_value_any },
        { "proxy-authenticate", hv_get_value_any },
        { "link", hv_get_value_any },
        { "via", hv_get_value_any },

        // MERGEABLE
        { "accept", hv_get_value_any },
        { "accept-language", hv_get_value_any },
        { "accept-encoding", hv_get_value_any },
        { "accept-ranges", hv_get_value_any },
        { "allow", hv_get_value_any },
        { "cache-control", hv_get_value_any },
        { "connection", hv_get_value_any },
        { "pragma", hv_get_value_any },
        { "upgrade", hv_get_value_any },
        { "trailer", hv_get_value_any },
        { "te", hv_get_value_any },
        { "vary", hv_get_value_any },

        // NORMAL / KNOWN
        { "cookie", hv_get_value_any },
        { "etag", hv_get_value_any },
        { "last-modified", hv_get_value_any },
        { "expires", hv_get_value_any },
        { "server", hv_get_value_any },
        { "location", hv_get_value_any },

        // Security / Fetch
        { "referer-policy", hv_get_value_any },
        { "sec-fetch-site", hv_get_value_any },
        { "sec-fetch-mode", hv_get_value_any },
        { "sec-fetch-dest", hv_get_value_any },
        { "sec-fetch-user", hv_get_value_any },
        { "dnt", hv_get_value_number },

        // Proxy / Forwarding
        { "x-forwarded-for", hv_get_value_any },
        { "x-forwarded-proto", hv_get_value_any },
        { "x-forwarded-host", hv_get_value_any },
        { "x-real-ip", hv_get_value_any }
    };
}