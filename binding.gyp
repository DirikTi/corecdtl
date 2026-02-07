{
  "targets": [
    {
      "target_name": "hypernode",
      "sources": ["src/main.cpp"],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include\")"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "defines": ["NAPI_VERSION=3", "NAPI_CPP_EXCEPTIONS"]
    }
  ]
}
