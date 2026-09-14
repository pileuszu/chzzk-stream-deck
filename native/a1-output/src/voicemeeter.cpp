#include "voicemeeter.hpp"
#include <cstring>

namespace a1 {
Voicemeeter::Voicemeeter(const std::filesystem::path& path): dll_(path) {
    auto login = symbol<T_VBVMR_Login>(dll_, "VBVMR_Login");
    logout_ = symbol<T_VBVMR_Logout>(dll_, "VBVMR_Logout");
    auto getType = symbol<T_VBVMR_GetVoicemeeterType>(dll_, "VBVMR_GetVoicemeeterType");
    auto reg = symbol<T_VBVMR_AudioCallbackRegister>(dll_, "VBVMR_AudioCallbackRegister");
    start_ = symbol<T_VBVMR_AudioCallbackStart>(dll_, "VBVMR_AudioCallbackStart");
    stop_ = symbol<T_VBVMR_AudioCallbackStop>(dll_, "VBVMR_AudioCallbackStop");
    unregister_ = symbol<T_VBVMR_AudioCallbackUnregister>(dll_, "VBVMR_AudioCallbackUnregister");
    long status = login();
    if (status < 0) throw std::runtime_error("Voicemeeter login failed");
    logged_ = true;
    try {
        if (status != 0) throw std::runtime_error("Start Voicemeeter before starting the sender");
        long type = 0; getType(&type);
        if (type < 1 || type > 3) throw std::runtime_error("Unsupported Voicemeeter type");
        busBase_ = type == 1 ? 12 : type == 2 ? 22 : 34;
        char name[64] = "A1 NDI Sender";
        auto result = reg(VBVMR_AUDIOCALLBACK_MAIN, callback, this, name);
        if (result != 0) throw std::runtime_error(std::string("VM Main callback unavailable; owner: ") + name);
        registered_ = true;
        if (start_() != 0) throw std::runtime_error("Voicemeeter audio callback start failed");
    } catch (...) {
        if (registered_) { stop_(); unregister_(); }
        logout_(); logged_ = false; registered_ = false; throw;
    }
}
Voicemeeter::~Voicemeeter() {
    if (registered_) { stop_(); unregister_(); }
    if (logged_) logout_();
}
void Voicemeeter::restart() {
    stop_(); clock_.reset(); ++generation_;
    if (start_() != 0) throw std::runtime_error("Cannot restart Voicemeeter capture");
    restartNeeded = false;
    ++restarts;
}
long __stdcall Voicemeeter::callback(void* ctx, long command, void* data, long) noexcept {
    auto& self = *static_cast<Voicemeeter*>(ctx);
    if (command == VBVMR_CBCOMMAND_STARTING) { self.clock_.reset(); ++self.generation_; return 0; }
    if (command == VBVMR_CBCOMMAND_CHANGE || command == VBVMR_CBCOMMAND_ENDING) {
        self.restartNeeded = true; return 0;
    }
    if (command != VBVMR_CBCOMMAND_BUFFER_MAIN) return 0;
    const auto b = static_cast<VBVMR_LPT_AUDIOBUFFER>(data);
    const int n = b->audiobuffer_nbs;
    // Always preserve ALL output buses, not only A1. MAIN is an insert callback;
    // leaving its write buffers untouched could silence the user's monitoring.
    for (int c = 0; c < b->audiobuffer_nbo && c < 128; ++c) {
        int src = self.busBase_ + c;
        if (n > 0 && src < b->audiobuffer_nbi && b->audiobuffer_w[c] && b->audiobuffer_r[src])
            std::memcpy(b->audiobuffer_w[c], b->audiobuffer_r[src], size_t(n) * sizeof(float));
    }
    if (n <= 0 || n > maxAudioSamples || b->audiobuffer_sr < 8000 || self.busBase_ + 1 >= b->audiobuffer_nbi) {
        ++self.invalidBlocks; return 0;
    }
    Tick observed = qpc();
    Tick stamp = self.clock_.stamp(observed, n, b->audiobuffer_sr);
    self.lastCallback = observed; self.sampleRate = b->audiobuffer_sr; self.blockSize = n; ++self.callbacks;
    auto out = self.queue.beginWrite();
    if (!out) { ++self.overflows; return 0; }
    out->time = stamp; out->count = n; out->rate = b->audiobuffer_sr; out->generation = self.generation_;
    std::memcpy(out->samples.data(), b->audiobuffer_r[self.busBase_], size_t(n) * sizeof(float));
    std::memcpy(out->samples.data() + n, b->audiobuffer_r[self.busBase_+1], size_t(n) * sizeof(float));
    self.queue.commitWrite();
    return 0;
}
} // namespace a1
