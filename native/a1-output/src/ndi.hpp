#pragma once
#include "common.hpp"
#include <cstddef>

// Minimal public NDI C ABI declarations. No codec or NDI runtime is redistributed.
// Source: https://docs.ndi.video/all/developing-with-ndi/sdk/frame-types
//         https://docs.ndi.video/all/developing-with-ndi/sdk/ndi-send
// Windows x64 layout checked below and exercised by the real receiver probe.
namespace a1 {
struct NdiSource { const char* name; const char* url; };
struct NdiSendSettings { const char* name; const char* groups; bool clockVideo; bool clockAudio; };
struct NdiVideo {
    int width{}, height{}; uint32_t fourcc{}; int fpsN{60}, fpsD{1}; float aspect{16.0f/9};
    int format{1}; int64_t timecode{}; uint8_t* data{}; int stride{};
    const char* metadata{}; int64_t timestamp{};
};
struct NdiAudio {
    int rate{}, channels{2}, samples{}; int64_t timecode{}; float* data{};
    int stride{}; const char* metadata{}; int64_t timestamp{};
};
constexpr uint32_t UYVY = uint32_t('U') | (uint32_t('Y')<<8) | (uint32_t('V')<<16) | (uint32_t('Y')<<24);
static_assert(sizeof(NdiVideo) == 72 && offsetof(NdiVideo, timecode) == 32);
static_assert(sizeof(NdiAudio) == 56 && offsetof(NdiAudio, timecode) == 16);
class Ndi {
    Library dll_;
    void (__cdecl* destroy_)();
    void* sender_{};
    void (__cdecl* sendDestroy_)(void*);
    void (__cdecl* video_)(void*, const NdiVideo*);
    void (__cdecl* audio_)(void*, const NdiAudio*);
    int (__cdecl* connections_)(void*, uint32_t);
public:
    std::string sourceName;
    Ndi(const std::filesystem::path& path, const std::string& name): dll_(path) {
        auto init = symbol<bool(__cdecl*)()>(dll_, "NDIlib_initialize");
        destroy_ = symbol<void(__cdecl*)()>(dll_, "NDIlib_destroy");
        auto create = symbol<void*(__cdecl*)(const NdiSendSettings*)>(dll_, "NDIlib_send_create");
        sendDestroy_ = symbol<void(__cdecl*)(void*)>(dll_, "NDIlib_send_destroy");
        video_ = symbol<void(__cdecl*)(void*,const NdiVideo*)>(dll_, "NDIlib_send_send_video_async_v2");
        audio_ = symbol<void(__cdecl*)(void*,const NdiAudio*)>(dll_, "NDIlib_send_send_audio_v2");
        connections_ = symbol<int(__cdecl*)(void*,uint32_t)>(dll_, "NDIlib_send_get_no_connections");
        auto getName = symbol<const NdiSource*(__cdecl*)(void*)>(dll_, "NDIlib_send_get_source_name");
        if (!init()) throw std::runtime_error("NDI initialization failed");
        NdiSendSettings s{name.c_str(), nullptr, false, false};
        sender_ = create(&s);
        if (!sender_) { destroy_(); throw std::runtime_error("NDI sender creation failed"); }
        sourceName = getName(sender_)->name;
    }
    ~Ndi() { if (sender_) { video_(sender_, nullptr); sendDestroy_(sender_); destroy_(); } }
    // Caller keeps the previous frame's pixels alive UNTIL this call returns.
    void video(const NdiVideo* frame) { video_(sender_, frame); }
    void audio(const NdiAudio& frame) { audio_(sender_, &frame); }
    int connections() { return connections_(sender_, 0); }
};
} // namespace a1
