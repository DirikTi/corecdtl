{
  "targets": [
    {
      "target_name": "hypernode",

      "sources": [
        "native/main.cpp",
        "native/http/core/*.cpp",
        "native/http/routes/*.cpp",
        "native/http/parser/*.cpp",
        "native/http/cpool/*.cpp"
      ],

      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "native/include",
        "native/http/core",
        "native/http/routes",
        "native/http/parser",
        "native/http/cpool",
        "native/third_party/simdjson"
      ],

      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],

      "defines": [
        "NAPI_VERSION=3",
        "NAPI_CPP_EXCEPTIONS"
      ],

      "cflags_cc": [
        "-std=c++14",
        "-fexceptions"
      ],

      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
      }
    }
  ]
}
