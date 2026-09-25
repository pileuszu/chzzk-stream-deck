#pragma once
#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>

namespace a1 {
using Tick = int64_t; // 100 ns, monotonic QPC domain, NOT wall time.
constexpr Tick second = 10000000;
constexpr Tick ms = 10000;
inline Tick samplesTime(int64_t samples, int rate) { return samples * second / rate; }

// Single producer / single consumer. Never blocks or allocates in the audio callback.
template<class T, size_t N> class Ring {
    std::array<T, N> slots_{};
    alignas(64) std::atomic<size_t> write_{0};
    alignas(64) std::atomic<size_t> read_{0};
public:
    T* beginWrite() noexcept {
        auto w = write_.load(std::memory_order_relaxed);
        return w - read_.load(std::memory_order_acquire) < N ? &slots_[w % N] : nullptr;
    }
    void commitWrite() noexcept { write_.fetch_add(1, std::memory_order_release); }
    const T* peek() const noexcept {
        auto r = read_.load(std::memory_order_relaxed);
        return r != write_.load(std::memory_order_acquire) ? &slots_[r % N] : nullptr;
    }
    void pop() noexcept { read_.fetch_add(1, std::memory_order_release); }
    size_t size() const noexcept { return write_.load() - read_.load(); }
};

// Recover the audio sample clock from callback cadence. Jitter is low-pass filtered;
// sustained clock error is tracked instead of accumulating over hours. This is NOT
// an ASIO hardware presentation timestamp (the VM callback doesn't expose one).
class SampleClock {
    double next_ = 0;
    bool initialized_ = false;
    int rate_ = 0;
public:
    uint64_t resets = 0;
    void reset() noexcept { initialized_ = false; }
    Tick stamp(Tick observed, int samples, int rate) noexcept {
        if (!initialized_ || rate != rate_ || std::abs(double(observed) - next_) > 100 * ms) {
            next_ = double(observed); rate_ = rate; initialized_ = true; ++resets;
        } else {
            // At 48k/256 this is ~1.4 s smoothing; corrections <= 20 us per block.
            next_ += std::clamp((double(observed) - next_) / 256.0, -200.0, 200.0);
        }
        Tick out = Tick(std::llround(next_));
        next_ += double(samples) * second / rate;
        return out;
    }
};

inline Tick frameTime(Tick epoch, int64_t index, int fps) {
    return epoch + index * second / fps; // no accumulated 60 Hz rounding drift
}
} // namespace a1
