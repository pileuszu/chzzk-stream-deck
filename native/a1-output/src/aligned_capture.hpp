#pragma once
#include "desktop.hpp"
#include "voicemeeter.hpp"

namespace a1 {
// Shared by NDI and the OBS source: output adapters receive the same A1 samples,
// video frames, holdback, and monotonic content timestamps. No network code here.
class AlignedCapture {
    Tick started_, epoch_, delay_, offset_;
    int fps_;
    int64_t videoIndex_ = 0;
    bool audioStarted_ = false;
    bool videoEnabled_;
    Tick lastContent_ = 0;
public:
    std::unique_ptr<Voicemeeter> vm;
    Desktop desktop;
    uint64_t videoSent = 0, audioSent = 0, lateVideo = 0, lateAudio = 0, repeats = 0;
    float peak = 0;

    AlignedCapture(const std::filesystem::path& vmPath, int width, int height, int fps,
                   int monitor, int bufferMs, double audioOffsetMs, bool videoEnabled=true)
        : started_(qpc()), epoch_(started_), delay_(bufferMs * ms),
          offset_(Tick(std::llround(audioOffsetMs * ms))), fps_(fps), videoEnabled_(videoEnabled),
          vm(std::make_unique<Voicemeeter>(vmPath)), desktop(width,height,fps,monitor,bufferMs,videoEnabled) {}

    // Returns false when neither stream is due; caller waits on its stop event.
    // Sinks must consume/copy audio before returning. Video is shared for async NDI.
    template<class AudioSink, class VideoSink>
    bool step(Tick now, AudioSink&& audioSink, VideoSink&& videoSink) {
        if (vm->restartNeeded.exchange(false)) vm->restart();
        if (!audioStarted_ && vm->queue.peek()) {
            epoch_ = vm->queue.peek()->time + offset_; audioStarted_ = true;
        }
        if (now-started_ > 5*second && !vm->lastCallback)
            throw std::runtime_error("No Voicemeeter A1 callbacks received");
        if (!audioStarted_) return false;
        Tick due = now-delay_;
        while (auto a=vm->queue.peek()) {
            if (a->time+offset_ >= due-250*ms) break;
            vm->queue.pop(); ++lateAudio;
        }
        Tick vt=frameTime(epoch_,videoIndex_,fps_);
        if (videoEnabled_ && vt < due-250*ms) {
            auto next=(due-epoch_)*fps_/second;
            lateVideo += uint64_t(next-videoIndex_); videoIndex_=next;
            vt=frameTime(epoch_,videoIndex_,fps_);
        }
        auto a=vm->queue.peek();
        if (a && a->time+offset_<=due && (!videoEnabled_ || a->time+offset_<=vt)) {
            for (int i=0; i<a->count*2; ++i) peak=std::max(peak,std::abs(a->samples[size_t(i)]));
            audioSink(*a,a->time+offset_); ++audioSent; vm->queue.pop(); return true;
        }
        if (videoEnabled_ && vt<=due) {
            auto pixels=desktop.at(vt);
            if (pixels) {
                videoSink(pixels,vt); ++videoSent;
                if (pixels->time==lastContent_) ++repeats;
                lastContent_=pixels->time;
            }
            ++videoIndex_; return true;
        }
        return false;
    }
};
} // namespace a1
