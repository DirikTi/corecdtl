cmake_minimum_required(VERSION 3.9)
cmake_policy(SET CMP0042 NEW)
set (CMAKE_CXX_STANDARD 14)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

project(hypernode)
include_directories(${CMAKE_JS_INC})
include_directories(
    ${CMAKE_SOURCE_DIR}/native/include
    ${CMAKE_SOURCE_DIR}/native/http/core
    ${CMAKE_SOURCE_DIR}/native/http/routes
    ${CMAKE_SOURCE_DIR}/native/http/parser
    ${CMAKE_SOURCE_DIR}/native/http/cpool
)


file(GLOB MAIN_SOURCE "native/main.cpp")
file(GLOB HTTP_SOURCES "native/http/core/*.cpp")
file(GLOB ROUTE_BUILDER_SOURCES "native/http/routes/*.cpp")
file(GLOB CHUNK_PROGRESSION_POOL_SOURCES "native/http/cpool/*.cpp")
file(GLOB PARSER_SOURCES "native/http/parser/*.cpp")

add_library(${PROJECT_NAME} SHARED 
    ${MAIN_SOURCE}
    ${ROUTE_BUILDER_SOURCES} 
    ${CHUNK_PROGRESSION_POOL_SOURCES}
    ${PARSER_SOURCES}
    ${HTTP_SOURCES}
    ${CMAKE_JS_SRC}
)
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")
target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})

# Include N-API wrappers
execute_process(
    COMMAND node -p "require('node-addon-api').include"
    WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
    OUTPUT_VARIABLE NODE_ADDON_API_DIR
)
string(REPLACE "\n" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
string(REPLACE "\"" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
target_include_directories(${PROJECT_NAME} PRIVATE ${NODE_ADDON_API_DIR})

# define NAPI_VERSION
add_definitions(-DNAPI_VERSION=3)
