#include <iostream>

#include "route.h"

void RouteBuilder::printRouteTree(const std::shared_ptr<RouteNode>& node, int depth) noexcept {
    if (!node) return;
    for (int i = 0; i < depth; ++i) std::cout << "  ";
    if (node->is_param) {
        std::cout << "PARAM(" << node->param_name << ")";
    } else if (node->value_length > 0) {
        std::cout << "STATIC(len=" << node->value_length << ", hex=" << std::hex << node->value << std::dec << ")";
    } else {
        std::cout << "ROOT";
    }
    if (node->vptr_table_index != -1)
        std::cout << " -> ENDPOINT_IDX=" << node->vptr_table_index;
    std::cout << "\n";

    for (auto &c : node->children) printRouteTree(c, depth + 1);
}
