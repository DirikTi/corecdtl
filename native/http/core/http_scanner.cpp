#include <string>
#include <napi.h>
#include <iostream>
#include <string_view>
#include <cstring>
#include <cctype>
#include <cstdint>
#include <vector>
#include <algorithm>


#include "http_core.h"
#include "http_scanner.h"

using namespace HttpScanner;

static inline uint8_t ascii_lower(uint8_t c) {
    return (c >= 'A' && c <= 'Z') ? (c | 0x20) : c;
}

static inline uint64_t load_u64(const char* p) {
    uint64_t v;
    std::memcpy(&v, p, sizeof(v));
    return v;
}

static inline uint64_t ascii_lower_u64(uint64_t v) {
    return v | 0x2020202020202020ULL;
}

static inline uint128_t ascii_lower_u128(uint128_t v) {
#if SIMD_SSE2
    return _mm_or_si128(v, _mm_set1_epi8(0x20));
#elif SIMD_NEON
    return vorrq_u8(v, vdupq_n_u8(0x20));
#endif
}

static inline uint128_t load_u128(const char* p) {
#if SIMD_SSE2
    return _mm_loadu_si128((const __m128i*)p);
#elif SIMD_NEON
    return vld1q_u8(reinterpret_cast<const uint8_t*>(p));
#endif
}

static inline uint128_t load_const128(const Pack128& p) {
#if SIMD_SSE2
    return _mm_set_epi64x(p.hi, p.lo);
#elif SIMD_NEON
    return vcombine_u8(vcreate_u8(p.lo), vcreate_u8(p.hi));
#endif
}


static inline bool simd_eq_n(
    uint128_t a, uint128_t b, unsigned n
) {
#if SIMD_SSE2
    __m128i mask = mask128_sse(n);
    __m128i diff = _mm_xor_si128(a, b);
    diff = _mm_and_si128(diff, mask);
    return _mm_movemask_epi8(diff) == 0;
#elif SIMD_NEON
    uint8x16_t mask = mask128_neon(n);
    uint8x16_t diff = veorq_u8(a, b);
    diff = vandq_u8(diff, mask);
    return vmaxvq_u8(diff) == 0;
#endif
}

static inline bool is_hn_delim(char c) {
    return (c == ':' || c == '-' || c == ' ');
}

inline constexpr bool hv_is_valid_char(unsigned char c) {
    // HTAB or SP
    if (c == 9 || c == 32) return true;

    // Visible ASCII
    return (c >= 33 && c <= 126);
}

enum State {
        ST_STARTUP,
        ST_HN_SPACE,
        ST_HN_UNKNOWN,
        ST_HN_H,
        ST_HN_A,
        ST_HN_C,
        ST_HN_D,
        ST_HN_I,
        ST_HN_L,
        ST_HN_O,
        ST_HN_P,
        // ST_HN_R,
        ST_HN_S,
        ST_HN_T,
        ST_HN_U,
        ST_HN_V,
        ST_HN_W,
        ST_HN_X,
        ST_HV_CONCAT
};

FlagBits HttpScanner::hv_get_value_number(
    const char* __restrict buf,
    uint32_t* __restrict __offset,
    size_t total,
    uint32_t maxHeaderValueSize,
    std::unique_ptr<std::string>& hv
) {
    size_t valueBegin = *__offset;
    size_t valueEnd   = *__offset;
    bool seen_digit = false;

    while (true) {
        if (*__offset >= total) {
            return FLAG_UNTERMINATED_HEADERS;
        }

        if (*__offset - valueBegin > maxHeaderValueSize)
            return FLAG_MAX_HEADER_VALUE_SIZE;

        unsigned char c = (unsigned char)buf[*__offset];

        // ---- Stop at line end ----
        if (c == '\r' || c == '\n')
            break;

        // ---- Digit or trailing OWS only ----
        if (c >= '0' && c <= '9') {
            seen_digit = true;
            valueEnd = *__offset + 1;
        } else if (c == ' ' || c == '\t') {
            // trailing OWS allowed, do not extend valueEnd
            (*__offset)++;
            while (true) {
                if (*__offset >= total)
                    return FLAG_UNTERMINATED_HEADERS;

                unsigned char c = (unsigned char)buf[*__offset];
                if (c == '\r' || c == '\n')
                    break;

                if (c != ' ' && c != '\t' )
                    return FLAG_INVALID_HEADER_VALUE;

                (*__offset)++;
            }
            break;
        } else
            return FLAG_INVALID_HEADER_VALUE;

        (*__offset)++;
    }

    if (!seen_digit)
        return FLAG_INVALID_HEADER_VALUE;

    // ---- Copy value (trimmed) ----
    hv->assign(buf + valueBegin, valueEnd - valueBegin);

    return FLAG_OK;
}

FlagBits HttpScanner::hv_get_value_any(
    const char* __restrict buf,
    uint32_t* __restrict __offset,
    size_t total,
    uint32_t maxHeaderValueSize,
    std::unique_ptr<std::string>& hv
) {
    size_t valueBegin = *__offset;
    size_t valueEnd   = *__offset;

    while (true) {
        if (*__offset >= total)
            return FLAG_UNTERMINATED_HEADERS;

        if (*__offset - valueBegin > maxHeaderValueSize)
            return FLAG_MAX_HEADER_VALUE_SIZE;

        unsigned char c = (unsigned char)buf[*__offset];
        // ---- Stop at line end ----
        if (c == '\r' || c == '\n')
            break;

        // ---- RFC-safe value char validation ----
        if (c < 32 && c != '\t')
            return FLAG_INVALID_HEADER_VALUE;
        if (c == 127)
            return FLAG_INVALID_HEADER_VALUE;
        if (!hv_is_valid_char(c))
            return FLAG_INVALID_HEADER_VALUE;

        // ---- Trim trailing OWS ----
        if (c != ' ' && c != '\t')
            valueEnd = *__offset + 1;

        (*__offset)++;
    }

    // ---- Copy value (trimmed) ----
    hv->assign(buf + valueBegin, valueEnd - valueBegin);

    return FLAG_OK;
}

FlagBits scanHeaders(
    Napi::Env env, const char* buf, size_t total, uint32_t* offset,
    uint32_t maxHeaderSize, uint32_t maxHeaderNameSize, uint32_t maxHeaderValueSize,
    uint32_t currentHeaderSize, MethodType method, Napi::Object* outHeaders
) {
    if (*offset + 1 > total) return FLAG_UNTERMINATED_HEADERS;

    uint32_t __offset = *offset;
    ssize_t vStart = 0;
    HeaderId hdrId = HDR_UNKNOWN;
    bool hdrMergeable = false;
    std::string headerUnknownName;
    State state = ST_STARTUP;

    while (true) {
        if (__offset >= total && state != ST_HV_CONCAT)
            break;
        switch (state) {

        // ================= STARTUP =================
        case ST_STARTUP: {
            if (__offset >= total) return FLAG_UNTERMINATED_HEADERS;

            if (__offset > maxHeaderSize) return FLAG_MAX_HEADER_SIZE;

            switch (buf[__offset]) {
                case 'a': case 'A':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_A;
                    continue;
                case 'c': case 'C':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_C;
                    continue;
                case 'd': case 'D':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_D;
                    continue;
                case 'i': case 'I':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_I;
                    continue;
                case 'l': case 'L':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_L;
                    continue;
                case 'o': case 'O':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_O;
                    continue;
                case 'p': case 'P':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_P;
                    continue;
                    /*
                case 'r': case 'R':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_R;
                    continue;
                    */
                case 's': case 'S':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_S;
                    continue;
                case 't': case 'T':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_T;
                    continue;
                case 'u': case 'U':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_U;
                    continue;
                case 'v': case 'V':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_V;
                    continue;
                case 'w': case 'W':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_W;
                    continue;
                case 'x': case 'X':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_X;
                    continue;
                case 'h': case 'H':
                    vStart = __offset;
                    __offset++;
                    state = ST_HN_H;
                    continue;

                default:
                    vStart = __offset;
                    state = ST_HN_UNKNOWN;
                    continue;
            }
        }

        // ================= SPACE =================
        case ST_HN_SPACE: {
            __offset++;
            state = ST_HV_CONCAT;
            continue;
        }

        // ================= UNKNOWN =================
        case ST_HN_UNKNOWN: {
            while (true) {
                if (__offset >= total) return FLAG_UNTERMINATED_HEADERS;
                
                char c = buf[__offset];
                if (c == ':') {
                    __offset++;
                    hdrId = HDR_UNKNOWN;
                    headerUnknownName.assign(buf + vStart, __offset - vStart - 1);
                    std::transform(headerUnknownName.begin(), headerUnknownName.end(), headerUnknownName.begin(),
                    [](unsigned char c){ return std::tolower(c); });
                    state = ST_HV_CONCAT;
                    break;
                }
                if (c == ' ' || c == '\t') {
                    return FLAG_INVALID_HEADER;
                }
                unsigned char uc = (unsigned char)c;
                if (uc < 33 || uc > 126) {
                    return FLAG_INVALID_HEADER;
                }
                __offset++;
                if (__offset - vStart > maxHeaderNameSize) return FLAG_MAX_HEADER_NAME_SIZE;
            }
            continue;
        }

        // ================= H =================
        case ST_HN_H: {
            if (__offset + 3 > total) return FLAG_UNTERMINATED_HEADERS;

            uint64_t v = load_u64(buf + __offset);
            uint64_t lv = ascii_lower_u64(v);
            if ((lv & MASK_U64_3BYTE) == PACK8("ost")) {
                __offset += 3;
                if (buf[__offset] == ':') {
                    if (outHeaders->Has("host"))
                            return FLAG_DUPLICATE_SINGLE_HEADER;
                    hdrId = HDR_HOST;
                    state = ST_HN_SPACE;
                    continue;
                }
            }
            state = ST_HN_UNKNOWN;
            continue;
        }

        // ================= A =================
        case ST_HN_A: {
            if (__offset >= total) return FLAG_UNTERMINATED_HEADERS;
            uint8_t lv = ascii_lower(buf[__offset]);

            // accept*
            if (lv == 'c') {

                if (__offset + 5 > total) return FLAG_UNTERMINATED_HEADERS;

                uint64_t w = load_u64(buf + (++__offset));
                uint64_t lw = ascii_lower_u64(w);

                // "cept"
                if ((lw & MASK_U64_4BYTE) == PACK8("cept")) {
                    __offset += 4;

                    if (__offset >= total) return FLAG_UNTERMINATED_HEADERS;

                    char c = buf[__offset];
                    // --------------------
                    // ACCEPT (plain)
                    // --------------------
                    if (c == ':' || c == ' ' || c == '\t') {
                        hdrId = HDR_ACCEPT;
                        state = ST_HN_SPACE;
                        continue; 
                    }

                    // --------------------
                    // ACCEPT-*
                    // --------------------
                    if (c == '-') {
                        if (__offset + 1 >= total) return FLAG_UNTERMINATED_HEADERS;

                        uint8_t n = ascii_lower(buf[++__offset]);

                        // accept-language
                        if (n == 'l') {
                            w = load_u64(buf + (__offset + 1));
                            lw = ascii_lower_u64(w);
                            if ((lw & MASK_U64_7BYTE) == PACK8("anguage")) {
                                __offset += 8;
                                if (buf[__offset] == ':') { 
                                    hdrMergeable = true;
                                    hdrId = HDR_ACCEPT_LANGUAGE;
                                    state = ST_HN_SPACE;
                                    continue;
                                }
                            }
                        }
                        // accept-encoding
                        else if (n == 'e') {
                            w = load_u64(buf + (__offset + 1));
                            lw = ascii_lower_u64(w);
                            if ((lw & MASK_U64_7BYTE) == PACK8("ncoding")) {
                                __offset += 8;
                                if (buf[__offset] == ':') { 
                                    hdrMergeable = true;
                                    hdrId = HDR_ACCEPT_ENCODING;
                                    state = ST_HN_SPACE;
                                    continue;
                                }
                            }
                        }
                        // accept-ranges
                        else if (n == 'r') {
                            w = load_u64(buf + (__offset + 1));
                            lw = ascii_lower_u64(w);
                            if ((lw & MASK_U64_5BYTE) == PACK8("anges")) {
                                __offset += 6;
                                if (buf[__offset] == ':') { 
                                    hdrMergeable = true;
                                    hdrId = HDR_ACCEPT_RANGES;
                                    state = ST_HN_SPACE;
                                    continue;
                                }
                            }
                        }
                    }
                }
            }

            // allow
            else if (lv == 'l') {
                uint64_t w = load_u64(buf + __offset);
                uint64_t lw = ascii_lower_u64(w);
                if ((lw & MASK_U64_3BYTE) == PACK8("low")) {
                    __offset += 4;
                    if (buf[__offset] == ':') { 
                        hdrMergeable = true;
                        hdrId = HDR_ALLOW;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }

            // authorization
            else if (lv == 'u') {
                if (__offset + 12 > total) return FLAG_UNTERMINATED_HEADERS;
                Pack128 P_THORIZATION = PACK16_11('t','h','o','r','i','z','a','t','i','o','n');
                __offset++;
                uint128_t v = load_u128(buf + (__offset));
                v = ascii_lower_u128(v);
                if (simd_eq_n(v, load_const128(P_THORIZATION), 11)) {
                    __offset += 11;
                    if (buf[__offset] == ':') {
                        if (outHeaders->Has("authorization"))
                            return FLAG_DUPLICATE_SINGLE_HEADER;

                        hdrId = HDR_AUTHORIZATION;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }

            state = ST_HN_UNKNOWN;
            continue;
        }

        // ================= C =================
        case ST_HN_C: {
            if (__offset >= total) return FLAG_UNTERMINATED_HEADERS;
            uint8_t lv = ascii_lower(buf[__offset]);

            // -------------------------------------------------
            // ca* → cache-control
            // -------------------------------------------------
            if (lv == 'a') {
                if (__offset + 12 > total) return FLAG_UNTERMINATED_HEADERS;

                uint64_t w = load_u64(buf + (__offset + 1));
                uint64_t lw = ascii_lower_u64(w);

                // "che-cont"
                if (lw == PACK8("che-cont")) {
                    w = load_u64(buf + (__offset + 9));
                    lw = ascii_lower_u64(w);

                    // "rol"
                    if ((lw & MASK_U64_3BYTE) == PACK8("rol")) {
                        __offset += 12;
                        if (buf[__offset] == ':') { 
                            hdrMergeable = true;
                            hdrId = HDR_CACHE_CONTROL;
                            state = ST_HN_SPACE;
                            continue;
                        }
                    }
                }
            }

            // -------------------------------------------------
            // co*
            // -------------------------------------------------
            else if (lv == 'o') {
                if (__offset + 1 >= total) return FLAG_UNTERMINATED_HEADERS;
                uint8_t n = ascii_lower(buf[++__offset]);

                // ---------------------------------------------
                // coo* → cookie
                // ---------------------------------------------
                if (n == 'o') {
                    if (__offset + 5 > total) return FLAG_UNTERMINATED_HEADERS;

                    uint64_t w = load_u64(buf + (__offset + 1));
                    uint64_t lw = ascii_lower_u64(w);

                    // "kie"
                    if ((lw & MASK_U64_3BYTE) == PACK8("kie")) {
                        __offset += 4;
                        if (buf[__offset] == ':') { 
                            hdrId = HDR_COOKIE;
                            state = ST_HN_SPACE;
                            continue;
                        }
                    }
                }

                // ---------------------------------------------
                // con*
                // ---------------------------------------------
                else if (n == 'n') {
                    if (__offset + 1 >= total) return FLAG_UNTERMINATED_HEADERS;
                    uint8_t t = ascii_lower(buf[++__offset]);

                    // -----------------------------------------
                    // conn* → connection
                    // -----------------------------------------
                    if (t == 'n') {
                        if (__offset + 7 > total) return FLAG_UNTERMINATED_HEADERS;

                        uint64_t w = load_u64(buf + (__offset + 1));
                        uint64_t lw = ascii_lower_u64(w);

                        // "ection"
                        if ((lw & MASK_U64_6BYTE) == PACK8("ection")) {
                            __offset += 7;
                            if (buf[__offset] == ':') { 
                                hdrMergeable = true;
                                hdrId = HDR_CONNECTION;
                                state = ST_HN_SPACE;
                                continue;
                            }
                        }
                    }

                    // -----------------------------------------
                    // cont* → content-*
                    // -----------------------------------------
                    else if (t == 't') {
                        if (__offset + 4 > total) return FLAG_UNTERMINATED_HEADERS;
                        __offset++;
                        uint64_t w = load_u64(buf + (__offset));
                        uint64_t lw = ascii_lower_u64(w);
                        // "ent-"
                        if ((lw & MASK_U64_4BYTE) == PACK8("ent-")) {
                            __offset += 4;

                            
                            if (__offset >= total) return FLAG_UNTERMINATED_HEADERS;
                            uint8_t k = ascii_lower(buf[__offset]);
                            
                            // content-length
                            if (k == 'l') {
                                w = load_u64(buf + (__offset + 1));
                                lw = ascii_lower_u64(w);
                                if ((lw & MASK_U64_5BYTE) == PACK8("ength")) {
                                    __offset += 6;
                                    if (buf[__offset] == ':') {
                                        if (outHeaders->Has("content-length"))
                                            return FLAG_DUPLICATE_SINGLE_HEADER;
                                        if (outHeaders->Has("transfer-encoding"))
                                            return FLAG_BAD_REQUEST;
                                            
                                        hdrId = HDR_CONTENT_LENGTH;
                                        state = ST_HN_SPACE;
                                        continue;
                                    }
                                }
                            }
                            // content-type
                            else if (k == 't') {
                                w = load_u64(buf + (__offset + 1));
                                lw = ascii_lower_u64(w);
                                if ((lw & MASK_U64_3BYTE) == PACK8("ype")) {
                                    __offset += 4;
                                    if (buf[__offset] == ':') {
                                        if (outHeaders->Has("content-type"))
                                            return FLAG_DUPLICATE_SINGLE_HEADER;
                                        hdrId = HDR_CONTENT_TYPE;
                                        state = ST_HN_SPACE;
                                        continue;
                                    } 
                                }
                            }
                            // content-range
                            else if (k == 'r') {
                                w = load_u64(buf + (__offset + 1));
                                lw = ascii_lower_u64(w);
                                if ((lw & MASK_U64_4BYTE) == PACK8("ange")) {
                                    __offset += 5;
                                    if (buf[__offset] == ':') { 
                                        if (outHeaders->Has("content-range"))
                                            return FLAG_DUPLICATE_SINGLE_HEADER;
                                        hdrId = HDR_CONTENT_RANGE;
                                        state = ST_HN_SPACE;
                                        continue;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            state = ST_HN_UNKNOWN;
            break;
        }

        // ================= D =================
        case ST_HN_D: {
            if (__offset >= total) return FLAG_UNTERMINATED_HEADERS;
            uint8_t lv = ascii_lower(buf[__offset]);

            // -------------------------------------------------
            // da* → date
            // -------------------------------------------------
            if (lv == 'a') {
                if (__offset + 3 > total) return FLAG_UNTERMINATED_HEADERS;
                uint32_t w =
                    (uint32_t)(ascii_lower(buf[__offset + 1]) << 16) |
                    (uint32_t)(ascii_lower(buf[__offset + 2]) << 8);

                // "te"
                if (w == (('t' << 16) | ('e' << 8))) {
                    __offset += 3;
                    if (buf[__offset] == ':') { 
                        if (outHeaders->Has("date"))
                            return FLAG_DUPLICATE_SINGLE_HEADER;
                        hdrId = HDR_DATE;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }

            // -------------------------------------------------
            // dn* → dnt
            // -------------------------------------------------
            else if (lv == 'n') {
                if (__offset + 2 > total) return FLAG_UNTERMINATED_HEADERS;

                uint16_t w = ascii_lower(buf[__offset + 1]);
                // "t"
                if (w == 't') {
                    __offset += 2;
                    if (buf[__offset] == ':') { 
                        hdrId = HDR_DNT;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }
            
            state = ST_HN_UNKNOWN;
            break;
        }

        // ================= I =================
        case ST_HN_I: {
            if (__offset + 3 > total) return FLAG_UNTERMINATED_HEADERS;

            uint64_t w = load_u64(buf + __offset);
            uint64_t lw = ascii_lower_u64(w) & MASK_U64_3BYTE;
            // -------------------------------------------------
            // if-n → if-none-match
            // -------------------------------------------------
            if (lw == PACK8("f-n")) {
                // need "one-match" (9)
                __offset += 3;
                if (__offset + 9 > total) return FLAG_UNTERMINATED_HEADERS;

                Pack128 P_ONE_MATCH =
                    PACK16_9('o','n','e','-','m','a','t','c','h');

                uint128_t v = load_u128(buf + __offset);
                v = ascii_lower_u128(v);

                if (simd_eq_n(v, load_const128(P_ONE_MATCH), 9)) {
                    __offset += 9; // "if-none-match"
                    if (buf[__offset] == ':') { 
                        if (outHeaders->Has("if-none-match")) 
                            return FLAG_DUPLICATE_SINGLE_HEADER;
                        hdrId = HDR_IF_NONE_MATCH;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }

            // -------------------------------------------------
            // if-m → if-match | if-modified-since
            // -------------------------------------------------
            else if (lw == PACK8("f-m")) {
                // short path: "atch"
                __offset += 3;
                if (__offset + 4 > total) return FLAG_UNTERMINATED_HEADERS;
                
                uint64_t t = load_u64(buf + (__offset));
                uint64_t lt = ascii_lower_u64(t) & MASK_U64_4BYTE;
                
                if (lt == PACK8("atch")) {
                    __offset += 4; // "if-match"
                    if (buf[__offset] == ':') { 
                        if (outHeaders->Has("if-match")) 
                            return FLAG_DUPLICATE_SINGLE_HEADER;
                        hdrId = HDR_IF_MATCH;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }

                // long path: "odified-since"
                if (__offset + 13 > total) return FLAG_UNTERMINATED_HEADERS;

                Pack128 P_ODIFIED_SINCE =
                    PACK16_13('o','d','i','f','i','e','d','-',
                            's','i','n','c','e');

                uint128_t v = load_u128(buf + __offset);
                v = ascii_lower_u128(v);

                if (simd_eq_n(v, load_const128(P_ODIFIED_SINCE), 13)) {
                    __offset += 13; // "if-modified-since"
                    if (buf[__offset] == ':') { 
                        if (outHeaders->Has("if-modified-since")) 
                            return FLAG_DUPLICATE_SINGLE_HEADER;
                        hdrId = HDR_IF_MODIFIED_SINCE;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }

            // -------------------------------------------------
            // if-u → if-unmodified-since
            // -------------------------------------------------
            else if (lw == PACK8("f-u")) {
                __offset += 3;
                if (__offset + 15 > total) return FLAG_UNTERMINATED_HEADERS;

                Pack128 P_UNMODIFIED_SINCE =
                    PACK16_15('n','m','o','d','i','f','i','e','d','-',
                            's','i','n','c','e');

                uint128_t v = load_u128(buf + (__offset + 3));
                v = ascii_lower_u128(v);

                if (simd_eq_n(v, load_const128(P_UNMODIFIED_SINCE), 15)) {
                    __offset += 15; // "if-unmodified-since"
                    if (buf[__offset] == ':') { 
                        if (outHeaders->Has("if-unmodified-since")) 
                            return FLAG_DUPLICATE_SINGLE_HEADER;
                        hdrId = HDR_IF_UNMODIFIED_SINCE;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }

            state = ST_HN_UNKNOWN;
            break;
        }

        // ================= L =================
        case ST_HN_L: {
            if (__offset >= total) return FLAG_UNTERMINATED_HEADERS;
            uint8_t lv = ascii_lower(buf[__offset]);

            // -------------------------------------------------
            // li* → link
            // -------------------------------------------------
            if (lv == 'i') {
                if (__offset + 3 > total) return FLAG_UNTERMINATED_HEADERS;

                uint64_t w = load_u64(buf + (__offset + 1));
                uint64_t lw = ascii_lower_u64(w);

                // "nk"
                if ((lw & MASK_U64_2BYTE) == PACK8("nk")) {
                    __offset += 3;
                    if (buf[__offset] == ':') { 
                        hdrId = HDR_LINK;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }

            // -------------------------------------------------
            // la* → last-modified
            // -------------------------------------------------
            else if (lv == 'a') {
                if (__offset + 12 > total) return FLAG_UNTERMINATED_HEADERS;

                uint64_t w = load_u64(buf + (__offset + 1));
                uint64_t lw = ascii_lower_u64(w);

                // "st-modif"
                if (lw == PACK8("st-modif")) {
                    w = load_u64(buf + (__offset + 9));
                    lw = ascii_lower_u64(w);

                    // "ied"
                    if ((lw & MASK_U64_3BYTE) == PACK8("ied")) {
                        __offset += 12;
                        if (buf[__offset] == ':') { 
                            hdrId = HDR_LAST_MODIFIED;
                            state = ST_HN_SPACE;
                            continue;
                        }
                    }
                }
            }

            // -------------------------------------------------
            // lo* → location
            // -------------------------------------------------
            else if (lv == 'o') {
                if (__offset + 7 > total) return FLAG_UNTERMINATED_HEADERS;

                uint64_t w = load_u64(buf + (__offset + 1));
                uint64_t lw = ascii_lower_u64(w);

                // "cation"
                if ((lw & MASK_U64_6BYTE) == PACK8("cation")) {
                    __offset += 7;
                    if (buf[__offset] == ':') { 
                        hdrId = HDR_LOCATION;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }

            state = ST_HN_UNKNOWN;
            break;
        }

        // ================= O =================
        case ST_HN_O: {
            if (__offset + 5 > total) return FLAG_UNTERMINATED_HEADERS;
            uint64_t w = load_u64(buf + __offset);
            uint64_t lw = ascii_lower_u64(w) & MASK_U64_5BYTE;

            // -------------------------------------------------
            // rigin
            // -------------------------------------------------
            if (lw == PACK8("rigin")) {
                
                __offset += 5;
                if (buf[__offset] == ':') { 
                    if (outHeaders->Has("origin"))
                        return FLAG_DUPLICATE_SINGLE_HEADER;
                    hdrId = HDR_ORIGIN;
                    state = ST_HN_SPACE;
                    continue;
                }
            }

            state = ST_HN_UNKNOWN;
            break;
        }
        
        // ================= P =================
        case ST_HN_P: {
            if (__offset + 2 > total) return FLAG_UNTERMINATED_HEADERS;
            uint64_t w = load_u64(buf + __offset);
            uint64_t lw = ascii_lower_u64(w) & MASK_U64_2BYTE;

            // -------------------------------------------------
            // pro*
            // -------------------------------------------------
            if (lw == PACK8("ro")) {
                __offset += 2;
                if (__offset + 8 > total) return FLAG_UNTERMINATED_HEADERS;
                w = load_u64(buf + __offset);
                lw = ascii_lower_u64(w);

                if (lw == PACK8("xy-authe")) {
                    __offset += 8;
                    if (__offset + 7 > total) return FLAG_UNTERMINATED_HEADERS;
                    w = load_u64(buf + __offset);
                    lw = ascii_lower_u64(w) & MASK_U64_7BYTE;

                    if (lw == PACK8("nticate")) {
                        __offset += 7;
                        if (buf[__offset] == ':') { 
                            hdrId = HDR_PROXY_AUTHENTICATE;
                            state = ST_HN_SPACE;
                            continue;
                        }
                    }
                } 

                else if (lw == PACK8("xy-autho")) {
                    __offset += 8;
                    if (__offset + 8 > total) return FLAG_UNTERMINATED_HEADERS;
                    w = load_u64(buf + __offset);
                    lw = ascii_lower_u64(w);

                    if (lw == PACK8("rization")) {
                        __offset += 8;
                        if (buf[__offset] == ':') { 
                            if (outHeaders->Has("proxy-authorization"))
                                return FLAG_DUPLICATE_SINGLE_HEADER;
                            hdrId = HDR_PROXY_AUTHORIZATION;
                            state = ST_HN_SPACE;
                            continue;
                        }
                    }
                }
            } 
            
            // -------------------------------------------------
            // pra*
            // -------------------------------------------------
            else if (lw == PACK8("ra")) {
                __offset += 2;
                if (__offset + 2 > total) return FLAG_UNTERMINATED_HEADERS;
                w = load_u64(buf + __offset);
                lw = ascii_lower_u64(w) & MASK_U64_3BYTE;

                if (lw == PACK8("gma")) {
                    __offset += 3;
                    if (buf[__offset] == ':') { 
                        hdrId = HDR_PRAGMA;
                        hdrMergeable = true;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }

            state = ST_HN_UNKNOWN;
            break;
        }

        // ================= S =================
        case ST_HN_S: {
            if (__offset + 2 > total) return FLAG_UNTERMINATED_HEADERS;
            uint64_t w = load_u64(buf + __offset);
            uint64_t lw = ascii_lower_u64(w) & MASK_U64_2BYTE;

            if (lw == PACK8("ec")) {
                __offset += 2;
                if (__offset + 8 > total) return FLAG_UNTERMINATED_HEADERS;
                w = load_u64(buf + __offset);
                lw = ascii_lower_u64(w);

                // -------------------------------------------------
                // sec-fetch-site
                // -------------------------------------------------
                if (lw == PACK8("-fetch-s")) {
                    __offset += 8;
                    if (__offset + 3 > total) return FLAG_UNTERMINATED_HEADERS;
                    w = load_u64(buf + __offset);
                    lw = ascii_lower_u64(w) & MASK_U64_3BYTE;

                    if (lw == PACK8("ite")) {
                        __offset += 3;
                        if (buf[__offset] == ':') { 
                            hdrId = HDR_SEC_FETCH_SITE;
                            state = ST_HN_SPACE;
                            continue;
                        }
                    }
                }

                // -------------------------------------------------
                // sec-fetch-site
                // -------------------------------------------------
                else if (lw == PACK8("-fetch-m")) {
                    __offset += 8;
                    if (__offset + 3 > total) return FLAG_UNTERMINATED_HEADERS;
                    w = load_u64(buf + __offset);
                    lw = ascii_lower_u64(w) & MASK_U64_3BYTE;

                    if (lw == PACK8("ode")) {
                        __offset += 3;
                        if (buf[__offset] == ':') { 
                            hdrId = HDR_SEC_FETCH_MODE;
                            state = ST_HN_SPACE;
                            continue;
                        }
                    }
                }

                // -------------------------------------------------
                // sec-fetch-dest
                // -------------------------------------------------
                else if (lw == PACK8("-fetch-d")) {
                    __offset += 8;
                    if (__offset + 3 > total) return FLAG_UNTERMINATED_HEADERS;
                    w = load_u64(buf + __offset);
                    lw = ascii_lower_u64(w) & MASK_U64_3BYTE;

                    if (lw == PACK8("est")) {
                        __offset += 3;
                        if (buf[__offset] == ':') { 
                            hdrId = HDR_SEC_FETCH_DEST;
                            state = ST_HN_SPACE;
                            continue;
                        }
                    }
                }

                // -------------------------------------------------
                // sec-fetch-user
                // -------------------------------------------------
                else if (lw == PACK8("-fetch-u")) {
                    __offset += 8;
                    if (__offset + 3 > total) return FLAG_UNTERMINATED_HEADERS;
                    w = load_u64(buf + __offset);
                    lw = ascii_lower_u64(w) & MASK_U64_3BYTE;

                    if (lw == PACK8("ser")) {
                        __offset += 3;
                        if (buf[__offset] == ':') { 
                            hdrId = HDR_SEC_FETCH_USER;
                            state = ST_HN_SPACE;
                            continue;
                        }
                    }
                }

            }

            // -------------------------------------------------
            // server
            // -------------------------------------------------
            else if(lw == PACK8("er")) {
                __offset += 2;
                if (__offset + 3 > total) return FLAG_UNTERMINATED_HEADERS;
                w = load_u64(buf + __offset);
                lw = ascii_lower_u64(w) & MASK_U64_3BYTE;
                if (lw == PACK8("ver")) {
                    __offset += 3;
                    if (buf[__offset] == ':') { 
                        hdrId = HDR_SERVER;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            } 
            
            // -------------------------------------------------
            // set-cookie
            // -------------------------------------------------
            else if(lw == PACK8("et")) {
                __offset += 2;
                if (__offset + 7 > total) return FLAG_UNTERMINATED_HEADERS;
                w = load_u64(buf + __offset);
                lw = ascii_lower_u64(w) & MASK_U64_7BYTE;

                if (lw == PACK8("-cookie")) {
                    __offset += 7;
                    if (buf[__offset] == ':') { 
                        hdrId = HDR_SET_COOKIE;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }

            state = ST_HN_UNKNOWN;
            break;
        }
        
        // ================= T =================
        case ST_HN_T: {
            if (__offset >= total) return FLAG_UNTERMINATED_HEADERS;
            uint8_t lv = ascii_lower(buf[__offset]);

            // -------------------------------------------------
            // te → TE
            // -------------------------------------------------
            if (lv == 'e') {
                __offset++;
                if (__offset >= total) return FLAG_UNTERMINATED_HEADERS;

                char c = buf[__offset];
                if (c == ':') {
                    hdrMergeable = true;
                    hdrId = HDR_TE;
                    state = ST_HN_SPACE;
                    continue;
                }
            }

            // -------------------------------------------------
            // tr*
            // -------------------------------------------------
            else if (lv == 'r') {
                if (__offset + 3 >= total) return FLAG_UNTERMINATED_HEADERS;
                uint64_t w = load_u64(buf + (++__offset));
                uint64_t lw = ascii_lower_u64(w);
                lw = lw & MASK_U64_2BYTE;

                // ---------------------------------------------
                // tran*
                // ---------------------------------------------
                if (lw == PACK8("an")) {
                    __offset += 2;
                    if (__offset + 13 > total) return FLAG_UNTERMINATED_HEADERS;
                    Pack128 P_SFER_ENCODING_ = PACK16_13('s','f','e','r','-','e','n','c','o','d','i','n','g');
                    uint128_t v = load_u128(buf + (__offset));
                    v = ascii_lower_u128(v);

                    // -----------------------------------------
                    // tran* → transfer-encoding
                    // -----------------------------------------
                    if (simd_eq_n(v, load_const128(P_SFER_ENCODING_), 13)) {
                        __offset += 13;
                        if (buf[__offset] == ':') { 
                            if (outHeaders->Has("transfer-encoding"))
                                return FLAG_DUPLICATE_SINGLE_HEADER;
                            if (outHeaders->Has("content-length"))
                                return FLAG_BAD_REQUEST;

                            hdrId = HDR_TRANSFER_ENCODING;
                            state = ST_HN_SPACE;
                            continue;
                        }
                    }
                } 

                // -----------------------------------------
                // trai* → trailer
                // -----------------------------------------
                else if(lw == PACK8("ai")) {
                    __offset += 2;
                    if (__offset + 3 > total) return FLAG_UNTERMINATED_HEADERS;

                    w = load_u64(buf + __offset);
                    lw = ascii_lower_u64(w);

                    // "ler"
                    if ((lw & MASK_U64_3BYTE) == PACK8("ler")) {
                        __offset += 4;
                        if (buf[__offset] == ':') { 
                            hdrMergeable = true;
                            hdrId = HDR_TRAILER;
                            state = ST_HN_SPACE;
                            continue;
                        }
                    }
                }
            }

            state = ST_HN_UNKNOWN;
            break;
        }

        // ================= U =================
        case ST_HN_U: {
            if (__offset >= total) return FLAG_UNTERMINATED_HEADERS;
            uint8_t lv = ascii_lower(buf[__offset]);

            if (lv == 's') {
                __offset++;
                if (__offset + 8 > total) return FLAG_UNTERMINATED_HEADERS;
                uint64_t w = load_u64(buf + __offset);
                uint64_t lw = ascii_lower_u64(w);
                
                if (lw == PACK8("er-agent")) {
                    __offset += 8;
                    if (buf[__offset] == ':') { 
                        if (outHeaders->Has("user-agent")) 
                            return FLAG_DUPLICATE_SINGLE_HEADER;
                        hdrId = HDR_USER_AGENT;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            } 
            
            // -------------------------------------------------
            // upgrade
            // -------------------------------------------------
            else if (lv == 'p') {
                __offset++;
                if (__offset + 5 > total) return FLAG_UNTERMINATED_HEADERS;
                uint64_t w = load_u64(buf + __offset);
                uint64_t lw = ascii_lower_u64(w) & MASK_U64_5BYTE;
                
                if (lw == PACK8("grade")) {
                    __offset += 5;
                    if (buf[__offset] == ':') { 
                        hdrId = HDR_UPGRADE;
                        hdrMergeable = true;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }

            state = ST_HN_UNKNOWN;
            break;
        }

        // ================= V =================
        case ST_HN_V: {
            if (__offset + 2 > total) return FLAG_UNTERMINATED_HEADERS;
            uint64_t w = load_u64(buf + __offset);
            uint64_t lw = ascii_lower_u64(w) % MASK_U64_2BYTE;

            // -------------------------------------------------
            // via
            // -------------------------------------------------
            if (lw == PACK8("ia")) {
                __offset += 2;
                if (buf[__offset] == ':') { 
                    hdrId = HDR_VIA;
                    state = ST_HN_SPACE;
                    continue;
                }
            }

            // -------------------------------------------------
            // vary
            // -------------------------------------------------
            else if(lw == PACK8("ar")) {
                __offset += 2;
                if (__offset >= total) return FLAG_UNTERMINATED_HEADERS;
                uint8_t lv = ascii_lower(buf[__offset]);

                if (lv == 'y') {
                    __offset += 1;
                    if (buf[__offset] == ':') { 
                        hdrId = HDR_VARY;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }

            state = ST_HN_UNKNOWN;
            break;
        }
        
        // ================= W =================
        case ST_HN_W: {
            if (__offset >= total) return FLAG_UNTERMINATED_HEADERS;
            uint8_t lv = ascii_lower(buf[__offset]);

            if (lv == 'w') {
                __offset++;
                if (__offset + 14 > total) return FLAG_UNTERMINATED_HEADERS;
                    Pack128 P_W_AUTHENTICATE_ = PACK16_14('w','-','a','u','t','h','e','n','t','i','c','a','t','e');
                    uint128_t v = load_u128(buf + (__offset));
                    v = ascii_lower_u128(v);

                    // -----------------------------------------
                    // ww* → www-authenticate
                    // -----------------------------------------
                    if (simd_eq_n(v, load_const128(P_W_AUTHENTICATE_), 14)) {
                        __offset += 14;
                        if (buf[__offset] == ':') { 
                            hdrId = HDR_WWW_AUTHENTICATE;
                            state = ST_HN_SPACE;
                            continue;
                        }
                    }
            }

            // -------------------------------------------------
            // warning
            // -------------------------------------------------
            else if(lv == 'a') {
                __offset++;
                if (__offset + 5 > total) return FLAG_UNTERMINATED_HEADERS;
                uint64_t w = load_u64(buf + __offset);
                uint64_t lw = ascii_lower_u64(w) & MASK_U64_5BYTE;

                if (lw == PACK8("rning")) {
                    __offset += 5;
                    if (buf[__offset] == ':') { 
                        hdrId = HDR_WARNING;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }

            state = ST_HN_UNKNOWN;
            break;
        }
        
        // ================= X =================
        case ST_HN_X: {
            if (__offset + 2 > total) return FLAG_UNTERMINATED_HEADERS;
            uint64_t w = load_u64(buf + __offset);
            uint64_t lw = ascii_lower_u64(w) & MASK_U64_2BYTE;

            if (lw == PACK8("-f")) {
                __offset += 2;
                // orwarded-for
                // orwarded-pro
                // orwarded-hos
                if (__offset + 12 > total) return FLAG_UNTERMINATED_HEADERS;

                uint128_t v = load_u128(buf + (__offset));
                v = ascii_lower_u128(v);

                Pack128 P_ORWARDED_FOR = PACK16_12('o','r','w','a','r','d','e','d','-','f','o','r');
                Pack128 P_ORWARDED_PRO = PACK16_12('o','r','w','a','r','d','e','d','-','p','r','o');
                Pack128 P_ORWARDED_HOS = PACK16_12('o','r','w','a','r','d','e','d','-','h','o','s');

                if (simd_eq_n(v, load_const128(P_ORWARDED_FOR), 12)) {
                    __offset += 12;
                    if (buf[__offset] == ':') { 
                        hdrId = HDR_X_FORWARDED_FOR;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }

                else if (simd_eq_n(v, load_const128(P_ORWARDED_HOS), 12)) {
                    __offset += 12;
                    if (__offset >= total) return FLAG_UNTERMINATED_HEADERS;
                    uint8_t v = ascii_lower(buf[__offset]);

                    if (v == 't') {
                        __offset++;
                        if (buf[__offset] == ':') { 
                            hdrId = HDR_X_FORWARDED_HOST;
                            state = ST_HN_SPACE;
                            continue;
                        }
                    }
                }

                else if (simd_eq_n(v, load_const128(P_ORWARDED_PRO), 12)) {
                    __offset += 12;
                    if (__offset + 2 > total) return FLAG_UNTERMINATED_HEADERS;
                    w = load_u64(buf + __offset);
                    lw = ascii_lower_u64(w) & MASK_U64_2BYTE;
                    if (lw == PACK8("to")) {
                        __offset += 2;
                        if (buf[__offset] == ':') { 
                            hdrId = HDR_X_FORWARDED_PROTO;
                            state = ST_HN_SPACE;
                            continue;
                        }
                    }
                }
            }

            else if(lw == PACK8("-r")) {
                __offset += 2;
                if (__offset + 6 > total) return FLAG_UNTERMINATED_HEADERS;
                w = load_u64(buf + __offset);
                lw = ascii_lower_u64(w) & MASK_U64_6BYTE;

                if (lw == PACK8("eal-ip")) {
                    __offset +=6;
                    if (buf[__offset] == ':') { 
                        hdrId = HDR_X_REAL_IP;
                        state = ST_HN_SPACE;
                        continue;
                    }
                }
            }

            state = ST_HN_UNKNOWN;
            break;
        }

        // =============== VALUE ===============
        case ST_HV_CONCAT: {
            // ---- Skip leading OWS ----
            while (__offset < total &&
                (buf[__offset] == ' ' || buf[__offset] == '\t'))
                __offset++;

            // ---- Scan header value ----
            auto hv = std::make_unique<std::string>();
            FlagBits ret = HEADERS[hdrId].value_parser(
                buf, &__offset, total, maxHeaderValueSize, hv
            );

            if (ret != FLAG_OK) {
                return ret;
            }

            // ---- Consume CRLF or LF ----
            if (buf[__offset] == '\r') {
                if (__offset + 1 >= total || buf[__offset + 1] != '\n')
                    return FLAG_INVALID_HEADER_VALUE;
                __offset += 2;
            }
            else if (buf[__offset] == '\n') {
                __offset += 1;
            }

            // ---- Commit offset for next header ----
            *offset  = __offset;

            // ---- Store header value ----
            auto value = Napi::String::New(
                env,
                hv->c_str()
            );

            if (hdrId == HDR_UNKNOWN) {
                outHeaders->Set(headerUnknownName, value);
            } else {
                const char* name = HEADERS[hdrId].name;

                if (hdrMergeable && outHeaders->Has(name)) {
                    auto oldVal =
                        outHeaders->Get(name)
                            .As<Napi::String>()
                            .Utf8Value();

                    outHeaders->Set(
                        name,
                        Napi::String::New(
                            env,
                            oldVal + ", " + value.Utf8Value()
                        )
                    );
                    hdrMergeable = false;
                } else {
                    outHeaders->Set(name, value);
                }
            }

            // ---- HEADER BLOCK END? (CRLF CRLF) ----
            
            if (__offset + 1 < total &&
                buf[__offset] == '\r' &&
                buf[__offset + 1] == '\n') {

                // consume final CRLF
                *offset = __offset + 2;
                return FLAG_OK;
            }
            

            // ---- Reset per-header state ----
            hdrId = HDR_UNKNOWN;
            hdrMergeable = false;
            headerUnknownName.clear();

            // ---- Continue parsing next header ----
            state = ST_STARTUP;
            continue;
        }
        } // switch
    }

    return FLAG_OK;
}
