//===----------------------------------------------------------------------===//
// RouteBuilder - Builder Implementation
//===----------------------------------------------------------------------===//

#include "route.h"

#include <algorithm>
#include <map>
#include <string>

using namespace RouteBuilder;

namespace {

    constexpr char kParamMarker = ':'; ///< marker for parameters in the pattern
    constexpr char kWildcardMarker = '*'; ///< marker for wildcard all path names in the pattern
    constexpr int kMaxPacked = 8; ///< maximum bytes to pack into a u64 for comparison

    // Pack up to 8 bytes from `str` into a u64. If len < 8, fill high bytes with 0xFF
    // to maintain inequality for short vs longer sequences.
    inline static uint64_t  packU64Safe(const char* str, int len) {
        if (len <= 0) return 0;
        if (len > 8) len = 8;
        uint64_t val = 0;
        for (int i = 0; i < len; ++i) {
            uint8_t c = static_cast<uint8_t>(str[i]);
            val |= (uint64_t)c << (8 * i);
        }
        for (int i = len; i < 8; ++i) {
            val |= (uint64_t)0xFF << (8 * i);
        }
        return val;
    }

    // Helper factory functions to make nodes
    std::shared_ptr<RouteNode> makeParamNode() {
        auto n = std::make_shared<RouteNode>();
        n->is_param = true;
        n->is_wildcard = false;
        return n;
    }

    std::shared_ptr<RouteNode> makeStaticNode() {
        auto n = std::make_shared<RouteNode>();
        n->is_param = false;
        n->is_wildcard = false;
        return n;
    }

    std::shared_ptr<RouteNode> makeWildcardNode() {
        auto n = std::make_shared<RouteNode>();
        n->is_wildcard = true;
        n->is_param = false;
        return n;
    }

    // offset -> index into the url char array
    static void buildSubRouteTree(std::shared_ptr<RouteNode> node, const std::vector<Endpoint>& eps, int offset) {
        if (!node) return;
        if (eps.empty()) return;

        
        for (auto &ep : eps) {
            if (ep.url[offset] == '\0') {
                // conflict resolution: if multiple endpoints end here, pick one or handle collision
                node->vptr_table_index = ep.vptr_table_index;
                // not removing; it's OK to leave them (they represent same path)
            }
        }
        
        std::vector<Endpoint> param_eps;
        std::vector<Endpoint> static_eps;
        Endpoint wildcard_ep;

        for (auto &ep : eps) {
            char c = ep.url[offset];
            if (c == '\0') continue;

            if (c == kWildcardMarker) wildcard_ep = ep;
            else if (c == kParamMarker && ep.url[offset + 1] == '/') param_eps.push_back(ep);
            else static_eps.push_back(ep);
        }

        // 3) Handle static prefix group (build common prefix up to MAX_VALUE_EXP)
        if (!static_eps.empty()) {
            // Build common prefix character-by-character
            std::string prefix;
            for (int p = 0; p < kMaxPacked; ++p) {
                char ch = static_eps[0].url[offset + p];
                if (ch == '\0' || ch == kParamMarker || ch == kWildcardMarker) break;

                bool all_match = true;
                for (auto &se : static_eps) {
                    if (se.url[offset + p] != ch) { all_match = false; break; }
                }
                if (!all_match) break;
                prefix.push_back(ch);
            }

            if (!prefix.empty()) {
                auto static_node = makeStaticNode();
                static_node->value_length = static_cast<size_t>(prefix.size());
                static_node->value = packU64Safe(prefix.c_str(), static_node->value_length);
                node->children.push_back(static_node);

                // recursion on static group with advanced offset
                int next_offset = offset + static_node->value_length;
                // pass by reference: note static_eps is a copy local vector
                buildSubRouteTree(static_node, static_eps, next_offset);
            } else {
                // No common multi-char prefix: group by first char and create one child per first character
                // This reduces worst-case behavior: split by single char
                // collect buckets
                std::map<char, std::vector<Endpoint>> buckets;
                for (auto &se : static_eps) buckets[se.url[offset]].push_back(se);
                for (auto &kv : buckets) {
                    char first = kv.first;
                    std::string onechar(1, first);
                    auto child = makeStaticNode();
                    child->value_length = 1;
                    child->value = packU64Safe(onechar.c_str(), 1);
                    node->children.push_back(child);
                    buildSubRouteTree(child, kv.second, offset + 1);
                }
            }
        }

        // 4) Handle param group (there should be at most one param child, but if multiple different param names,
        //    we might need to disambiguate; here we take the first's metadata)
        if (!param_eps.empty()) {
            auto param_node = makeParamNode();
            // Use the first endpoint's param meta
            if (!param_eps[0].params.empty()) {
                param_node->param_name = param_eps[0].params[0].name;
                param_node->param_type = param_eps[0].params[0].type;
            }
            node->children.push_back(param_node);
            // skip the ":/" marker -> offset + 2
            buildSubRouteTree(param_node, param_eps, offset + 2);
        }

        // 5) Wildcard route (terminal matcher)
        //    Only one wildcard is allowed per route level.
        //    Wildcard consumes the rest of the URL and must NOT recurse further.
        //    It acts as a final fallback when no static or param routes match.
        if (wildcard_ep) {
            auto wildcard_node = makeWildcardNode();
            wildcard_node->vptr_table_index = wildcard_ep.vptr_table_index;
            node->children.push_back(wildcard_node);
        }
    }
}

// Public API
std::shared_ptr<RouteNode> RouteBuilder::buildRouteTree(const std::vector<Endpoint>& eps) noexcept {
    if (eps.size() == 0) return nullptr;

    auto root = std::make_shared<RouteNode>();
    buildSubRouteTree(root, eps, 0);
    return root;
}
