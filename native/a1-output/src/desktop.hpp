#pragma once
#include "common.hpp"
#include <atomic>
#include <deque>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>

namespace a1 {
struct VideoFrame {
    Tick time{};
    std::vector<uint8_t> pixels; // Rec.709 limited-range packed UYVY
};
class Desktop {
    std::atomic<bool> quit_{false};
    std::thread thread_;
    mutable std::mutex mutex_;
    std::deque<std::shared_ptr<VideoFrame>> frames_;
    std::shared_ptr<VideoFrame> current_;
    std::string error_;
    int width_, height_, fps_, monitor_;
    size_t limit_;
    void run() noexcept;
public:
    std::atomic<uint64_t> captures{0}, overflows{0}, reconnects{0};
    Desktop(int width, int height, int fps, int monitor, int bufferMs);
    ~Desktop();
    std::shared_ptr<VideoFrame> at(Tick timestamp);
    size_t queued() const;
    std::string error() const;
};
} // namespace a1
