#include "cpool.h"
#include <iostream>
#include <stdexcept>

Napi::Function CPool::GetClass(Napi::Env env) {
    return DefineClass(env, "CPool", {
        InstanceMethod("initializePool", &CPool::InitializePool),
        InstanceMethod("registerObj", &CPool::RegisterObj),
        InstanceMethod("allocate", &CPool::Allocate),
        InstanceMethod("free", &CPool::Free),
        InstanceMethod("resizePool", &CPool::ResizePool),
    });
}

CPool::CPool(const Napi::CallbackInfo& info)
: Napi::ObjectWrap<CPool>(info) {
    m_activeSize = 0;
    m_currentSize = 0;
    m_retiredCount = 0;
    m_shrinking = false;
}

CPool::~CPool() {
    for (auto &e : m_poolEntries) {
        if (!e.jsRef.IsEmpty()) e.jsRef.Unref();
    }
    m_poolEntries.clear();
    m_freeStack.clear();
}

__attribute__((always_inline))
void CPool::pushFreeIndex(int idx) {
    m_freeStack.push_back(idx);
}

__attribute__((always_inline))
int CPool::popFreeIndex() {
    if (m_freeStack.empty()) [[unlikely]] return -1;
    int idx = m_freeStack.back();
    m_freeStack.pop_back();
    return idx;
}

Napi::Value CPool::InitializePool(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Pool size must be a number").ThrowAsJavaScriptException();
        return env.Null();
    }
    size_t newSize = info[0].As<Napi::Number>().Uint32Value();
    if (newSize == 0) {
        Napi::Error::New(env, "Pool size must be > 0").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (m_currentSize != 0) {
        Napi::Error::New(env, "Pool already initialized").ThrowAsJavaScriptException();
        return env.Null();
    }

    try {
        m_poolEntries.resize(newSize);
        m_freeStack.reserve(newSize);
    } catch (const std::bad_alloc&) {
        Napi::Error::New(env, "Allocation failed").ThrowAsJavaScriptException();
        return env.Null();
    }

    m_currentSize = newSize;
    m_activeSize = newSize;
    m_retiredCount = 0;
    m_shrinking = false;

    // Initially all slots are free for registration and allocation.
    for (size_t i = 0; i < (size_t)newSize; ++i) {
        m_poolEntries[i].inUse = false;
        pushFreeIndex((int)i);
    }

    return env.Undefined();
}

Napi::Value CPool::RegisterObj(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "RegisterObj expects an object").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (m_currentSize == 0) {
        Napi::Error::New(env, "Pool not initialized").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Find an index that currently has no jsRef assigned.
    int found = -1;
    for (size_t i = 0; i < m_currentSize; ++i) {
        if (m_poolEntries[i].jsRef.IsEmpty()) {
            found = (int)i;
            break;
        }
    }
    if (found == -1) {
        Napi::Error::New(env, "No free registration slot").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object obj = info[0].As<Napi::Object>();
    m_poolEntries[found].jsRef = Napi::Persistent(obj);
    // keep it weak in sense we managed lifetime; do not call Ref here to avoid keeping V8 alive unnecessarily
    // but persistent already increases refcount; if you want to manage GC, call Ref/Unref appropriately.

    return Napi::Number::New(env, found);
}

Napi::Value CPool::Allocate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (m_activeSize == 0) [[unlikely]] {
        return env.Null();
    }

    // if shrinking and retired region exists, still can allocate from active region only
    int idx = popFreeIndex();
    if (idx == -1) [[unlikely]] {
        // no free slot
        return env.Null();
    }

    // Safety: If popped index is >= activeSize (retired area) -> put back and fail
    if ((size_t)idx >= m_activeSize) [[unlikely]] {
        // returned index belongs to retired area, push it back and fail allocation
        pushFreeIndex(idx);
        return env.Null();
    }

    PoolEntry& entry = m_poolEntries[idx];
    entry.inUse = true;

    // Return the JS object or null if not registered
    if (entry.jsRef.IsEmpty()) [[likely]] {
        // Not registered JS object — still return null (caller must handle)
        return env.Null();
    }

    return entry.jsRef.Value();
}

Napi::Value CPool::Free(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) [[unlikely]] {
        Napi::TypeError::New(env, "Free expects index number").ThrowAsJavaScriptException();
        return env.Null();
    }
    int idx = info[0].As<Napi::Number>().Int32Value();
    if (idx < 0 || (size_t)idx >= m_currentSize) [[unlikely]] {
        Napi::RangeError::New(env, "Index out of range").ThrowAsJavaScriptException();
        return env.Null();
    }

    PoolEntry& entry = m_poolEntries[idx];
    if (!entry.inUse) [[unlikely]] {
        // double free - ignore silently (or optionally log)
        return env.Undefined();
    }

    entry.inUse = false;

    // If this index is in retired area, we must Unref the jsRef and decrease retired count.
    if ((size_t)idx >= m_activeSize) [[unlikely]] {
        // unref persistent ref if set
        if (!entry.jsRef.IsEmpty()) {
            entry.jsRef.Unref();
            entry.jsRef = Napi::ObjectReference();
        }
        if (m_retiredCount > 0) {
            --m_retiredCount;
            if (m_retiredCount == 0 && m_shrinking) {
                finalizeShrinkIfNeeded(env);
                return env.Undefined();
            }
        }
        // we don't push retired indices back into freeStack because retired area will be shrunk away
        return env.Undefined();
    }

    // normal free -> push back to free list
    pushFreeIndex(idx);
    return env.Undefined();
}

void CPool::finalizeShrinkIfNeeded(Napi::Env env) {
    // physically release retired area
    if (!m_shrinking) return;
    for (size_t i = m_activeSize; i < m_currentSize; ++i) {
        if (!m_poolEntries[i].jsRef.IsEmpty()) {
            m_poolEntries[i].jsRef.Unref();
            m_poolEntries[i].jsRef = Napi::ObjectReference();
        }
    }
    m_poolEntries.resize(m_activeSize);
    m_currentSize = m_activeSize;
    // rebuild freeStack to contain only indices < activeSize that are free
    m_freeStack.clear();
    m_freeStack.reserve(m_activeSize);
    for (size_t i = 0; i < m_activeSize; ++i) {
        if (!m_poolEntries[i].inUse) pushFreeIndex((int)i);
    }
    m_shrinking = false;
}

Napi::Value CPool::ResizePool(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "ResizePool expects a number").ThrowAsJavaScriptException();
        return env.Null();
    }
    size_t newSize = info[0].As<Napi::Number>().Uint32Value();
    if (newSize == 0) {
        Napi::Error::New(env, "new size must be > 0").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (newSize == m_activeSize) return env.Undefined();

    if (newSize > m_currentSize) {
        // expand physical vector
        try {
            size_t old = m_currentSize;
            m_poolEntries.resize(newSize);
            // initialize new slots as free and push them to freeStack if they are within active area
            for (size_t i = old; i < newSize; ++i) {
                m_poolEntries[i].inUse = false;
            }
            // add new indices to freeStack for the extended active area
            for (size_t i = old; i < newSize; ++i) {
                pushFreeIndex((int)i);
            }
            m_currentSize = newSize;
            m_activeSize = newSize;
        } catch (const std::bad_alloc&) {
            Napi::Error::New(env, "allocation failed").ThrowAsJavaScriptException();
            return env.Null();
        }
    } else {
        // shrinking -> mark activeSize and if there are in-use slots in retired area mark retiring
        size_t retiredStart = newSize;
        size_t activeInRetired = 0;
        for (size_t i = retiredStart; i < m_currentSize; ++i) {
            if (m_poolEntries[i].inUse) activeInRetired++;
        }

        m_activeSize = newSize;

        if (activeInRetired == 0) {
            // safe to immediately shrink: unref jsRefs and resize
            for (size_t i = retiredStart; i < m_currentSize; ++i) {
                if (!m_poolEntries[i].jsRef.IsEmpty()) {
                    m_poolEntries[i].jsRef.Unref();
                    m_poolEntries[i].jsRef = Napi::ObjectReference();
                }
            }
            m_poolEntries.resize(m_activeSize);
            m_currentSize = m_activeSize;
            // rebuild freeStack
            m_freeStack.clear();
            m_freeStack.reserve(m_activeSize);
            for (size_t i = 0; i < m_activeSize; ++i) {
                if (!m_poolEntries[i].inUse) pushFreeIndex((int)i);
            }
        } else {
            // there are active entries in retired area -> mark for shrink
            m_retiredCount = activeInRetired;
            m_shrinking = true;
            // remove retired indices from freeStack if any (they shouldn't be free)
            std::vector<int> newStack;
            newStack.reserve(m_freeStack.size());
            for (int idx : m_freeStack) {
                if ((size_t)idx < m_activeSize) newStack.push_back(idx);
            }
            m_freeStack.swap(newStack);
            // retired indices remain until freed; when freed, Free() will decrement m_retiredCount and finalize
        }
    }

    return env.Undefined();
}
