#include "http_core.h"
#include <route.h>
#include "http_scanner.h"
#include <cpool.h>
#include <iostream>

#include <string>
#include <napi.h>
#include <iostream>


inline void HttpCore::setMethodFlag(MethodType method) {
    if (method >= M_HEAD && method <= M_OPTIONS)
        this->m_methodFlags |= (1 << method);
}


inline bool HttpCore::isMethodAllowed(MethodType method) {
    if (method <= M_HEAD || method > M_OPTIONS) return false;
    return this->m_methodFlags & (1 << method);
}

static inline bool isHttp11AtOffset(const char* curl, size_t curlLen, uint32_t* offset) {
    if (!offset) return false;
    uint32_t pos = *offset;

    static constexpr const char* pattern = "HTTP/1.1";
    static constexpr size_t plen = 8;

    // sınır kontrolü (out of range)
    if (pos + plen > curlLen) return false;
    // memcmp — char by char karşılaştırmanın en hızlı yolu
    if (memcmp(curl + pos, pattern, plen) != 0) {
        return false;
    }

    // eşleşti → offset ilerlet
    *offset = pos + plen;
    return true;
}

static inline MethodType scanHttpMethod(const char* curl, uint32_t* offset) {
    const char* p = curl + *offset;
    switch (*p) {
        case 'G':
            if (*(p+1) == 'E' && *(p+2) == 'T' &&
                (*(p+3) == ' ' || *(p+3) == '\0')) [[likely]] {
                *offset += 3;
                return M_GET;
            }
            break;
        case 'H':
            if (*(p+1) == 'E' && *(p+2) == 'A' && *(p+3) == 'D' &&
                                (*(p+4) == ' ' || *(p+4) == '\0')) [[likely]] {
                *offset += 4;
                return M_HEAD;
            }
            break;
        case 'P':
            switch (*(p+1)) {
                case 'O':
                    if (*(p+2) == 'S' && *(p+3) == 'T' &&
                                        (*(p+4) == ' ' || *(p+4) == '\0')) [[likely]] {
                        *offset += 4;
                        return M_POST;
                    }
                    break;
                case 'U':
                    if (*(p+2) == 'T' && (*(p+3) == ' ' || *(p+3) == '\0')) [[likely]] {
                        *offset += 3;
                        return M_PUT;
                    }
                    break;
                case 'A':
                    if (*(p+2) == 'T' && *(p+3) == 'C' && *(p+4) == 'H' &&
                                        (*(p+5) == ' ' || *(p+5) == '\0')) [[likely]] {
                        *offset += 5;
                        return M_PATCH;
                    }
                    break;
            }
            break;
        case 'D':
            if (*(p+1) == 'E' && *(p+2) == 'L' && *(p+3) == 'E' &&
                                *(p+4) == 'T' && *(p+5) == 'E' &&
                                (*(p+6) == ' ' || *(p+6) == '\0')) [[unlikely]] {
                *offset += 6;
                return M_DELETE;
            }
            break;
        case 'O':
            if (*(p+1) == 'P' && *(p+2) == 'T' && *(p+3) == 'I' &&
                                *(p+4) == 'O' && *(p+5) == 'N' && *(p+6) == 'S' &&
                                (*(p+7) == ' ' || *(p+7) == '\0')) [[unlikely]] {
                *offset += 7;
                return M_OPTIONS;
            }
            break;
    }

    return M_ERROR;
}

Napi::Function HttpCore::GetClass(Napi::Env env) {
    return DefineClass(env, "HttpCore", {
        InstanceMethod("registerRoutes", &HttpCore::RegisterRoutes),
        InstanceMethod("scannerRouteFirst", &HttpCore::ScannerRouteFirst),
        InstanceMethod("scannerHeader", &HttpCore::ScannerHeader),
        InstanceMethod("printRouteTree", &HttpCore::PrintRouteTree),
    });
}

HttpCore::HttpCore(const Napi::CallbackInfo& info)
: Napi::ObjectWrap<HttpCore>(info) {
    
}

HttpCore::~HttpCore() {

}

RouteBuilder::EndpointParam HttpCore::makeParam(const std::string& name, RouteBuilder::ParamType type) {
    return RouteBuilder::EndpointParam{ name, type };
}

RouteBuilder::Endpoint HttpCore::makeEndpoint(const std::string& url, int vptr_table_index) {
    RouteBuilder::Endpoint ep{};
    std::string out;
    std::vector<RouteBuilder::EndpointParam> params;

    out.reserve(url.size());

    for (size_t i = 0; i < url.size();) {
        if (url[i] == ':' && (i == 0 || url[i - 1] == '/')) {
            size_t start = i + 1;
            size_t end = start;

            while (end < url.size() && url[end] != '/' && url[end] != '?')
                end++;

            std::string paramName = url.substr(start, end - start);

            out.push_back(':');
            out += paramName;
            params.push_back(makeParam(paramName, RouteBuilder::kString));
            i = end;
        } else {
            out.push_back(url[i]);
            ++i;
        }
    }

    ep.url = strdup(out.c_str());
    ep.params = std::move(params);
    ep.vptr_table_index = vptr_table_index;

    return ep;
}

MethodType HttpCore::parserMethod(const std::string& method) {
    if (method == "HEAD") return M_HEAD;
    if (method == "GET") return M_GET;
    if (method == "POST") return M_POST;
    if (method == "PUT") return M_PUT;
    if (method == "DELETE") return M_DELETE;
    if (method == "PATCH") return M_PATCH;
    if (method == "OPTIONS") return M_OPTIONS;
    return M_ERROR;
}

Napi::Value HttpCore::RegisterRoutes(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray()) {
        Napi::TypeError::New(env, "Expected an array of route definitions").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Array routes = info[0].As<Napi::Array>();
    size_t routeCounts = routes.Length();

    std::unique_ptr<std::vector<RouteBuilder::Endpoint>> methodEndpoints[METHOD_MAX_INDEX_COUNT];
    for (int i = 0; i < METHOD_MAX_INDEX_COUNT; ++i) {
        methodEndpoints[i] = std::make_unique<std::vector<RouteBuilder::Endpoint>>();
    }

    for (size_t i = 0; i < routeCounts; i++) {
        Napi::Value val = routes[i];
        if (!val.IsObject()) continue;

        Napi::Object routeObj = val.As<Napi::Object>();

        std::string method = routeObj.Get("method").ToString();
        std::string url = routeObj.Get("route").ToString();
        int vptr_table_index = routeObj.Get("vptrTableIndex").As<Napi::Number>().Int32Value();

        MethodType indexMethod = parserMethod(method);
        if (indexMethod == M_ERROR) continue;

        RouteBuilder::Endpoint ep = makeEndpoint(url, vptr_table_index);

        methodEndpoints[static_cast<int>(indexMethod)]->push_back(std::move(ep));
    }

    for (uint8_t index = 0; index < METHOD_MAX_INDEX_COUNT; ++index) {
        auto& eps = methodEndpoints[index];
        if (eps && !eps->empty()) {
            auto routeBuilder = RouteBuilder::buildRouteTree(std::move(*eps));
            
            // RouteBuilder::printRouteTree(routeBuilder); // For Debug

            this->m_httpRouteMaps[index].route_node = routeBuilder;
            setMethodFlag((MethodType)index);
        }
    }

    return Napi::Number::New(env, routeCounts);
}

Napi::Value HttpCore::ScannerRouteFirst(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    auto curlBuf = info[0].As<Napi::Buffer<uint8_t>>();
    uint8_t* curl = curlBuf.Data();
    size_t curlLen = curlBuf.Length();

    Napi::Object reqObj = info[1].As<Napi::Object>();

    uint32_t main_offset = 0;

    // ------------- SCAN METHOD ----------------
    MethodType methodType = scanHttpMethod((const char*)curl, &main_offset);

    if (!isMethodAllowed(methodType)) {
        if (methodType == M_ERROR) {
            uint32_t flags = FLAG_BAD_REQUEST;
            reqObj.Set("retFlag", Napi::Number::New(env, flags));
            return Napi::Number::New(env, -1);
        }
        
        uint32_t flags = FLAG_METHOD_NOT_ALLOWED;
        if (methodType == M_OPTIONS)
            flags |= FLAG_CORS_PREFLIGHT;

        reqObj.Set("retFlag", Napi::Number::New(env, flags));
        reqObj.Set("mainOffset", Napi::Number::New(env, main_offset));
        return Napi::Number::New(env, -1);
    }

    reqObj.Set("method", Napi::Number::New(env, (int)methodType));

    main_offset += 1;

    Napi::Array params = Napi::Array::New(env);
    Napi::Object query = Napi::Object::New(env);

    uint32_t query_limit = info[5].As<Napi::Number>();
    // --------- MATCH ROUTE -------------
    int routeId = RouteBuilder::matchUrl(env,
        this->m_httpRouteMaps[methodType].route_node,
        (const char*)curl,
        curlLen,
        &main_offset,
        &params,
        &query,
        query_limit
    );
    
    if(routeId == -1) {
        reqObj.Set("retFlag", Napi::Number::New(env, FLAG_NOT_FOUND));
        return Napi::Number::New(env, -1);
    } else if (routeId == -2) {
        reqObj.Set("retFlag", Napi::Number::New(env, FLAG_REQUEST_QUERY_EXCEEDED));
        return Napi::Number::New(env, -1);
    } else if (routeId == -3) {
        reqObj.Set("retFlag", Napi::Number::New(env, FLAG_REQUEST_URL_EXCEEDED));
        return Napi::Number::New(env, -1);
    }

    reqObj.Set("params", params);
    reqObj.Set("query", query);

    main_offset += 1;
    // --------- HTTP VERSION VALIDATION ---------
    bool ret = isHttp11AtOffset((const char*)curl, curlLen, &main_offset);
    if (!ret) {
        reqObj.Set("retFlag", Napi::Number::New(env, FLAG_HTTP_VERSION_UNSUPPORTED));
        return Napi::Number::New(env, routeId);
    }

    main_offset += 2;
    // --------- HEADER SCANNER ---------
    uint32_t currentHeaderSize = reqObj.Get("headerSize").As<Napi::Number>();
    uint32_t maxHeaderNameSize = info[2].As<Napi::Number>();
    uint32_t maxHeaderValueSize = info[3].As<Napi::Number>();
    uint32_t maxHeaderSize = info[4].As<Napi::Number>();
    Napi::Object headers = reqObj.Get("headers").As<Napi::Object>();
    auto sOff = main_offset;
    auto res = scanHeaders(env, 
                            (const char*)curl, curlLen, 
                            &main_offset,
                            maxHeaderSize,

                            maxHeaderSize,
                            maxHeaderValueSize,
                            currentHeaderSize,

                            methodType,
                            &headers);
    reqObj.Set("retFlag", (int)res);
    reqObj.Set("headerSize", Napi::Number::New(env, currentHeaderSize + main_offset - sOff));
    // -------- SUCCESS -----------
    reqObj.Set("mainOffset", Napi::Number::New(env, main_offset));

    return Napi::Number::New(env, routeId);
}

Napi::Value HttpCore::ScannerHeader(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    auto curlBuf = info[0].As<Napi::Buffer<uint8_t>>();
    uint8_t* curl = curlBuf.Data();
    size_t curlLen = curlBuf.Length();

    Napi::Object reqObj = info[1].As<Napi::Object>();
    uint32_t maxHeaderNameSize = info[2].As<Napi::Number>();
    uint32_t maxHeaderValueSize = info[3].As<Napi::Number>();
    uint32_t maxHeaderSize = info[4].As<Napi::Number>();

    uint32_t mainOff = reqObj.Get("mainOffset").As<Napi::Number>();
    uint32_t currentHeaderSize = reqObj.Get("headerSize").As<Napi::Number>();
    
    Napi::Object headers = reqObj.Get("headers").As<Napi::Object>();
    uint32_t methodType = reqObj.Get("method").As<Napi::Number>(); 
    auto sOff = mainOff;
    auto res = scanHeaders(env, 
                            (const char*)curl, curlLen, 
                            &mainOff,
                            maxHeaderSize,

                            maxHeaderNameSize,
                            maxHeaderValueSize,
                            currentHeaderSize,

                            (MethodType)methodType,
                            &headers);
    reqObj.Set("retFlag", (int)res);
    reqObj.Set("headerSize", Napi::Number::New(env, currentHeaderSize + mainOff - sOff));
    // -------- SUCCESS -----------
    reqObj.Set("mainOffset", Napi::Number::New(env, mainOff));

    return Napi::Number::New(env, 0);
}

Napi::Value HttpCore::PrintRouteTree(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    auto deepth = 4;

    if (info.Length() == 1 || !info[0].IsNumber()) {
        deepth = info[0].As<Napi::Number>();    
    }

    for (auto i = 0; i < METHOD_MAX_INDEX_COUNT; i++) {
        std::string methodName = "";
        switch (this->m_httpRouteMaps[i].method_type) {
        case M_HEAD:
            methodName = "HEAD";
            break;
        case M_GET:
            methodName = "GET";
            break;
        case M_POST:
            methodName = "POST";
            break;
        case M_PUT:
            methodName = "PUT";
            break;
        case M_PATCH:
            methodName = "PATCH";
            break;
        case M_DELETE:
            methodName = "DELETE";
            break;
        case M_OPTIONS:
            methodName = "OPTIONS";
            break;
        default:
            break;
        }
        RouteBuilder::printRouteTree(this->m_httpRouteMaps[i].route_node, deepth);
    }

    return Napi::Number::New(env, 0);
}
