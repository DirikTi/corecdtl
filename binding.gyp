{
  "targets": [
    {
      "target_name": "hypernode",
      "sources": [
        "native/main.cpp",
        "<!@(node -p \"require('fs').readdirSync('native/http/core').filter(f => f.endsWith('.cpp')).map(f => 'native/http/core/' + f).join(' ')\")",
        "<!@(node -p \"require('fs').readdirSync('native/http/routes').filter(f => f.endsWith('.cpp')).map(f => 'native/http/routes/' + f).join(' ')\")",
        "<!@(node -p \"require('fs').readdirSync('native/http/parser').filter(f => f.endsWith('.cpp')).map(f => 'native/http/parser/' + f).join(' ')\")",
        "<!@(node -p \"require('fs').readdirSync('native/http/cpool').filter(f => f.endsWith('.cpp')).map(f => 'native/http/cpool/' + f).join(' ')\")"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "native/include",
        "native/http/core",
        "native/http/routes",
        "native/http/parser",
        "native/http/cpool",
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
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LANGUAGE_STANDARD": "c++14"
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1
        }
      }
    }
  ]
}