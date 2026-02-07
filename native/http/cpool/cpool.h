#pragma once
#include <napi.h>
#include <vector>
#include <stack>
#include <functional>

struct PoolEntry {
    Napi::ObjectReference jsRef; // persistent JS object
    bool inUse = false;          // true when allocated
    // optionally other meta fields...
};

class CPool : public Napi::ObjectWrap<CPool> {
public:
    static Napi::Function GetClass(Napi::Env env);
    CPool(const Napi::CallbackInfo& info);
    ~CPool();

    // NAPI methods
    Napi::Value InitializePool(const Napi::CallbackInfo& info);
    Napi::Value RegisterObj(const Napi::CallbackInfo& info);
    Napi::Value Allocate(const Napi::CallbackInfo& info);
    Napi::Value Free(const Napi::CallbackInfo& info);
    Napi::Value ResizePool(const Napi::CallbackInfo& info);

private:
    // core data
    std::vector<PoolEntry> m_poolEntries;
    std::vector<int> m_freeStack;          // indices of free entries (LIFO)
    size_t m_activeSize = 0;               // visible active capacity
    size_t m_currentSize = 0;              // physical vector size
    size_t m_retiredCount = 0;             // number of in-use entries in retired zone
    bool m_shrinking = false;              // indicates shrink process in progress

    // helpers
    void pushFreeIndex(int idx);
    int popFreeIndex();                    // -1 if none
    void finalizeShrinkIfNeeded(Napi::Env env);
};
