#pragma once
#include <cstdint>
#include <vector>
#include <napi.h>

using namespace std;

namespace RouteBuilder {
    enum ParamType { kString = 1, kNumber = 2 };
    /// Endpoint parameter metadata.
    struct EndpointParam {
        std::string name;
        ParamType type = ParamType::kString;
    };


    /// Endpoint description used by the builder.
    struct Endpoint {
        const char* url; ///< Null-terminated URL pattern (e.g. "users/:id/")
        std::vector<EndpointParam> params;
        int vptr_table_index = -1;

        explicit operator bool() const {
            return vptr_table_index != -1;
        }
    };

    /// Route trie node layout. We purposefully separate 'hot' data from
    /// 'cold' data: small fixed-size fields come first for cache locality.
    struct alignas(64) RouteNode {
        // HOT data
        uint64_t value = 0; ///< Packed up to 8 characters for fast comparison
        size_t value_length = 0; ///< Number of meaningful bytes in `value`
        int vptr_table_index = -1; ///< Handler index if this node terminates an endpoint
        ParamType param_type = ParamType::kString;
        char _padding[7] = {};
        bool is_param = false;
        bool is_wildcard = false;


        // COLD data
        std::string param_name; ///< Name of the parameter (if is_param)
        std::vector<std::shared_ptr<RouteNode>> children;///< Child nodes
        std::weak_ptr<RouteNode> parent; ///< Optional parent pointer
    };


    // static_assert(sizeof(RouteNode) % 64 == 0, "RouteNode must be 64-byte aligned multiple");


    // Public API


    /**
    * @brief Build a route tree from a Endpoints Eps.
    *
    * The caller retains ownership of Endpoint; the function copies endpoint
    * descriptors as needed. Returns nullptr if table empty.
    */
    std::shared_ptr<RouteNode> buildRouteTree(const std::vector<Endpoint>& eps) noexcept;


    /**
    * @brief Match a URL against a previously-built route tree.
    *
    * The returned unique_ptr holds the match result. Use vptr_table_index to
    * dispatch to the appropriate handler.
    */
    int matchUrl(
    Napi::Env env,
    const std::shared_ptr<RouteNode>& root,
    const char* url,
    size_t urlLen,
    uint32_t* offset,
    Napi::Array* pathParams,
    Napi::Object* queryParams,
    uint32_t query_limit
    ) noexcept;


    /**
    * @brief Debug helper: print the route tree (human-readable).
    */
    void printRouteTree(const std::shared_ptr<RouteNode>& node, int depth = 0) noexcept;
} // namespace RouteBuilder