{
  "targets": [
    {
      "target_name": "hypernode",

      "sources": [
        "native/main.cpp",

        "native/http/core/*.cpp",
        "native/http/routes/*.cpp",
        "native/http/parser/*.cpp",
        "native/http/cpool/*.cpp",

        "native/third_party/simdjson/*.cpp"
      ],

      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include\")",
        "native/include",
        "native/http/core",
        "native/http/routes",
        "native/http/parser",
        "native/http/cpool",
        "native/third_party/simdjson"
      ],

      "defines": [
        "NAPI_VERSION=3",
        "NAPI_CPP_EXCEPTIONS"
      ],

      "cflags_cc": [
        "-std=c++17",
        "-O3"
      ],

      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17"]
            }
          }
        }]
      ]
    }
  ]
}
