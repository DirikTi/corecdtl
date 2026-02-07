#pragma once
#include <napi.h>
#include <route.h>
#include <string>

using namespace std;

constexpr uint8_t METHOD_MAX_INDEX_COUNT = 7;

enum FlagBits : uint32_t {
    FLAG_OK                        = 0x0000,
    FLAG_BAD_REQUEST               = 0x0001,
    FLAG_METHOD_NOT_ALLOWED        = 0x0002,
    FLAG_NOT_FOUND                 = 0x0004,
    FLAG_CORS_PREFLIGHT            = 0x0008,
    FLAG_HTTP_VERSION_UNSUPPORTED  = 0x0010,
    FLAG_CONTENT_LENGTH_TOO_LARGE  = 0x0020,
    FLAG_MISSING_HOST              = 0x0040,
    FLAG_HAS_BODY                  = 0x0080,
    FLAG_INVALID_ARGUMENT          = 0x0100,
    FLAG_INVALID_HEADER            = 0x0200,
    FLAG_INVALID_HEADER_VALUE      = 0X0300,
    FLAG_INVALID_CONTENT_LENGTH    = 0x0400,
    FLAG_CONTENT_LENGTH_EXCEEDED   = 0x0800,
    FLAG_UNTERMINATED_HEADERS      = 0x1000,
    FLAG_MAX_HEADER_SIZE           = 0X2000,
    FLAG_MAX_HEADER_NAME_SIZE      = 0X2100,
    FLAG_MAX_HEADER_VALUE_SIZE     = 0X2200,
    FLAG_DUPLICATE_SINGLE_HEADER   = 0X3000,
    FLAG_REQUEST_QUERY_EXCEEDED    = 0X4000,
    FLAG_REQUEST_URL_EXCEEDED      = 0X5000,
    FLAG_SMUGGING_TE_CL            = 0x6000
};

using MethodFlags = uint8_t;

enum MethodType : uint8_t {
    M_HEAD,
    M_GET,
    M_POST,
    M_PUT,
    M_DELETE,
    M_PATCH,
    M_OPTIONS,
    M_ERROR,
};

enum HttpContextMode: uint8_t {
    M_WEB,
    M_API
};

struct HttpRoutes {
    MethodType method_type;
    shared_ptr<RouteBuilder::RouteNode> route_node; // Builded Route Node
};

class HttpCore : public Napi::ObjectWrap<HttpCore> {
public:
    static Napi::Function GetClass(Napi::Env env);
    HttpCore(const Napi::CallbackInfo& info);
    ~HttpCore();

    // NAPI methods
    Napi::Value RegisterRoutes(const Napi::CallbackInfo& info);
    Napi::Value ScannerRouteFirst(const Napi::CallbackInfo& info);
    Napi::Value ScannerHeader(const Napi::CallbackInfo& info);
    Napi::Value PrintRouteTree(const Napi::CallbackInfo& info);

private:
    HttpContextMode m_httpContextMode;
    MethodFlags m_methodFlags = 0;
    HttpRoutes m_httpRouteMaps[METHOD_MAX_INDEX_COUNT] = {
        { M_HEAD,    nullptr },
        { M_GET,     nullptr },
        { M_POST,    nullptr },
        { M_PUT,     nullptr },
        { M_DELETE,  nullptr },
        { M_PATCH,   nullptr },
        { M_OPTIONS, nullptr },
    };

    // helpers
    MethodType parserMethod(const std::string& method);
    void setMethodFlag(MethodType method);
    bool isMethodAllowed(MethodType method);

    RouteBuilder::Endpoint makeEndpoint(const std::string& url, int vptr_table_index);
    RouteBuilder::EndpointParam makeParam(const std::string& name, RouteBuilder::ParamType type);
};
