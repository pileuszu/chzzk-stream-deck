#pragma once
#include "common.hpp"
#include "VoicemeeterRemote.h"
#include <array>
#include <atomic>
#include <memory>

namespace a1 {
constexpr int maxAudioSamples = 4096;
struct AudioBlock {
    Tick time{}; int rate{}, count{}; uint64_t generation{};
    std::array<float, maxAudioSamples * 2> samples{}; // planar, right starts at count
};
class Voicemeeter {
    Library dll_;
    T_VBVMR_Logout logout_{};
    T_VBVMR_AudioCallbackStop stop_{};
    T_VBVMR_AudioCallbackUnregister unregister_{};
    bool logged_ = false, registered_ = false;
    int busBase_ = 22;
    SampleClock clock_;
    uint64_t generation_ = 0;
    static long __stdcall callback(void*, long, void*, long) noexcept;
public:
    Ring<AudioBlock, 1024> queue;
    std::atomic<uint64_t> callbacks{0}, overflows{0}, invalidBlocks{0}, restarts{0};
    std::atomic<int> sampleRate{0}, blockSize{0};
    std::atomic<Tick> lastCallback{0};
    std::atomic<bool> restartNeeded{false};
    explicit Voicemeeter(const std::filesystem::path& path);
    ~Voicemeeter();
    void restart();
private:
    T_VBVMR_AudioCallbackStart start_{};
};
} // namespace a1
