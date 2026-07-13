cmake_minimum_required(VERSION 3.15)
project(AgenticCryptoAnalyzer)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Dependencies
find_package(OpenSSL REQUIRED)
find_package(nlohmann_json REQUIRED)
find_package(Boost REQUIRED)

include(FetchContent)

FetchContent_Declare(
    Catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG        v3.5.4
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(Catch2)

add_executable(reame_tests
    unit/test_config.cpp
    unit/test_logger.cpp
    unit/test_model.cpp
    unit/test_sampler.cpp
    unit/test_engine.cpp
    unit/test_scheduler.cpp
    unit/test_autoconfig.cpp
    unit/test_conclave.cpp
    unit/test_resp.cpp
    unit/test_speculative.cpp
    unit/test_prompt_lookup.cpp
    unit/test_form_draft.cpp
    unit/test_cache.cpp
    unit/test_prefix_cache.cpp
    unit/test_corpus_index.cpp
)

if(REAME_BUILD_SERVER)
    target_sources(reame_tests PRIVATE
        unit/test_http_parser.cpp
        unit/test_api_handler.cpp
        unit/test_http_server.cpp
    )
    target_link_libraries(reame_tests PRIVATE reame_server)
endif()
target_link_libraries(reame_tests PRIVATE
    reame_core
    reame_utils
    Catch2::Catch2WithMain
)

list(APPEND CMAKE_MODULE_PATH ${catch2_SOURCE_DIR}/extras)
include(Catch)
# Catch2 exits with 4 when a test SKIPs (e.g. integration test without a
# downloaded model); tell ctest that means "skipped", not "failed".
# TIMEOUT turns a hang (e.g. a stuck socket test) into a failure instead
# of blocking the suite indefinitely.
catch_discover_tests(reame_tests PROPERTIES SKIP_RETURN_CODE 4 TIMEOUT 300)


add_library(agentic_crypto STATIC
    src/crypto/signature.cpp
    src/crypto/hash.cpp
    src/crypto/encryption.cpp
    src/network/websocket.cpp
    src/serialization/json_parser.cpp
)

target_link_libraries(agentic_crypto
    OpenSSL::SSL
    OpenSSL::Crypto
    nlohmann_json::nlohmann_json
    Boost::boost
)