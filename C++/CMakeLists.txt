cmake_minimum_required(VERSION 3.15)
project(GloveTone VERSION 1.0.0)

# C++ Standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# JUCE Framework
set(JUCE_DIR "C:/JUCE" CACHE PATH "Path to JUCE framework")
if(NOT EXISTS "${JUCE_DIR}/modules")
    message(FATAL_ERROR "JUCE not found at ${JUCE_DIR}. Please set JUCE_DIR to your JUCE installation.")
endif()

add_compile_definitions(
    JUCE_PLUGINHOST_VST=0
    JUCE_PLUGINHOST_VST3=1
)
add_subdirectory(${JUCE_DIR} JUCE)

# Fetch nlohmann/json (Header-only mode to avoid CMake version issues)
include(FetchContent)
FetchContent_Declare(
    json
    URL https://github.com/nlohmann/json/releases/download/v3.11.3/include.zip
)
FetchContent_GetProperties(json)
if(NOT json_POPULATED)
    FetchContent_Populate(json)
    add_library(nlohmann_json INTERFACE)
    target_include_directories(nlohmann_json INTERFACE ${json_SOURCE_DIR}/include)
    add_library(nlohmann_json::nlohmann_json ALIAS nlohmann_json)
endif()

# Source files
set(CORE_SOURCES
    Source/main.cpp
    Source/Looping/loop.cpp
)

set(INSTRUMENT_SOURCES
    Source/Instruments/Drums/DrumFlexController.cpp
    Source/Instruments/Drums/DrumZonesController.cpp
    Source/Instruments/Guitar/GuitarController.cpp
    Source/Instruments/Keys/KeysController.cpp
    Source/Instruments/Keys/ChordsController.cpp
    Source/Instruments/Violin/ViolinController.cpp
)

set(AUDIO_SOURCES
    Source/Audio/JuceAudioEngine.cpp
)

# Executable
add_executable(GloveTone
    ${CORE_SOURCES}
    ${INSTRUMENT_SOURCES}
    ${AUDIO_SOURCES}
)

# Include directories
target_include_directories(GloveTone PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/Source
    ${CMAKE_CURRENT_SOURCE_DIR}/Source/core
    ${CMAKE_CURRENT_SOURCE_DIR}/Source/Instruments
    ${CMAKE_CURRENT_SOURCE_DIR}/Source/Audio
    ${CMAKE_CURRENT_SOURCE_DIR}/Source/Looping
)

# Link JUCE modules
target_link_libraries(GloveTone
    PRIVATE
        juce::juce_audio_basics
        juce::juce_audio_devices
        juce::juce_audio_formats
        juce::juce_audio_processors
        juce::juce_audio_utils
        juce::juce_core
        juce::juce_data_structures
        juce::juce_events
        juce::juce_graphics
        juce::juce_gui_basics
        juce::juce_gui_extra
        nlohmann_json::nlohmann_json
)

# Compile definitions
target_compile_definitions(GloveTone
    PRIVATE
        NOMINMAX
        JUCE_ASIO=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_USE_CURL=0
        JUCE_WEB_BROWSER=0
)

# Windows-specific settings
if(WIN32)
    target_link_libraries(GloveTone PRIVATE ws2_32)
    
    # Copy config.json to build directory
    add_custom_command(TARGET GloveTone POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/config.json"
        "$<TARGET_FILE_DIR:GloveTone>/config.json"
    )
endif()

# TensorFlow Lite (for AI models - Violin & Guitar)
set(TENSORFLOW_LITE_DIR "C:/TensorFlowLite" CACHE PATH "Path to TensorFlow Lite")

if(EXISTS "${TENSORFLOW_LITE_DIR}/include")
    message(STATUS "TensorFlow Lite found at ${TENSORFLOW_LITE_DIR}")
    
    # Include TensorFlow Lite headers
    target_include_directories(GloveTone PRIVATE
        ${TENSORFLOW_LITE_DIR}/include
    )
    
    # Link TensorFlow Lite library (Bazel build)
    target_link_directories(GloveTone PRIVATE
        ${TENSORFLOW_LITE_DIR}/lib
    )
    
    target_link_libraries(GloveTone PRIVATE
        tensorflowlite
    )
    
    set(TENSORFLOW_LITE_FOUND TRUE)
else()
    message(WARNING "TensorFlow Lite not found at ${TENSORFLOW_LITE_DIR}. AI models will not work.")
    set(TENSORFLOW_LITE_FOUND FALSE)
endif()

message(STATUS "GloveTone configuration complete")
message(STATUS "  JUCE Directory: ${JUCE_DIR}")
message(STATUS "  TensorFlow Lite: ${TENSORFLOW_LITE_FOUND}")
message(STATUS "  Build Type: ${CMAKE_BUILD_TYPE}")
