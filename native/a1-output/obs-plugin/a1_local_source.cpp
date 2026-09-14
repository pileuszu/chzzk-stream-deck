#include <obs-module.h>
#include <util/platform.h>
#include "aligned_capture.hpp"
#include "config.hpp"
#include <mmsystem.h>
#include <sstream>
#include <iomanip>
#include "deck_control.hpp"

OBS_DECLARE_MODULE()
MODULE_EXPORT const char* obs_module_description(void) {
    return "Local desktop and Voicemeeter A1 source using a shared AV timeline. No NDI transport.";
}
MODULE_EXPORT const char* obs_module_name(void) { return "A1 Desktop Sync Local"; }

namespace {
using namespace a1;
struct WinHandle {
    HANDLE value{};
    ~WinHandle() { if(value) CloseHandle(value); }
};
struct TimerResolution {
    TimerResolution() { timeBeginPeriod(1); }
    ~TimerResolution() { timeEndPeriod(1); }
};
std::string jsonText(const std::string& value) {
    std::string out="\"";
    for(unsigned char c:value) { if(c=='"'||c=='\\') out+='\\'; if(c>=32) out+=char(c); }
    return out+'"';
}
void writeStatus(const std::filesystem::path& path,const std::string& json) noexcept {
    try {
        std::filesystem::create_directories(path.parent_path());
        auto temp=path;temp+=L".tmp";
        {std::ofstream f(temp,std::ios::binary|std::ios::trunc);f<<json;if(!f)return;}
        MoveFileExW(temp.c_str(),path.c_str(),MOVEFILE_REPLACE_EXISTING);
    } catch(...) {}
}

class LocalSource {
    obs_source_t* source_;
    WinHandle stop_{CreateEventW(nullptr,TRUE,FALSE,nullptr)};
    std::thread worker_;
    std::filesystem::path configPath_;
    std::string requestId_;
    bool testPattern_ = false;
    int64_t obsOffset_ = 0;
    Config config_;

    void writeStatus(const std::filesystem::path& path,const std::string& json) const {
        ::writeStatus(path,"{\"request_id\":"+jsonText(requestId_)+","+json.substr(1));
    }

    uint64_t timestamp(Tick t) const { return uint64_t(t*100+obsOffset_); }
    void outputAudio(const AudioBlock& a,Tick t) {
        obs_source_audio out{};
        out.data[0]=reinterpret_cast<const uint8_t*>(a.samples.data());
        out.data[1]=reinterpret_cast<const uint8_t*>(a.samples.data()+a.count);
        out.frames=uint32_t(a.count);out.speakers=SPEAKERS_STEREO;
        out.format=AUDIO_FORMAT_FLOAT_PLANAR;out.samples_per_sec=uint32_t(a.rate);
        out.timestamp=timestamp(t);
        obs_source_output_audio(source_,&out);
    }
    void outputVideo(const std::shared_ptr<VideoFrame>& pixels,Tick t) {
        obs_source_frame out{};
        out.data[0]=pixels->pixels.data();out.linesize[0]=uint32_t(config_.width*2);
        out.width=uint32_t(config_.width);out.height=uint32_t(config_.height);
        out.timestamp=timestamp(t);out.format=VIDEO_FORMAT_UYVY;out.full_range=false;
        video_format_get_parameters(VIDEO_CS_709,VIDEO_RANGE_PARTIAL,
                                    out.color_matrix,out.color_range_min,out.color_range_max);
        // libobs copies these buffers before returning; no intermediate encoder.
        obs_source_output_video(source_,&out);
    }
    void synthetic(const std::filesystem::path& status) {
        auto black=std::make_shared<VideoFrame>(),white=std::make_shared<VideoFrame>();
        black->pixels.resize(size_t(config_.width)*config_.height*2);
        white->pixels.resize(black->pixels.size());
        for(size_t p=0;p<black->pixels.size();p+=4) {
            black->pixels[p]=black->pixels[p+2]=white->pixels[p]=white->pixels[p+2]=128;
            black->pixels[p+1]=black->pixels[p+3]=16;white->pixels[p+1]=white->pixels[p+3]=235;
        }
        Tick epoch=qpc();int64_t sample=0,videoIndex=0;uint64_t audioBlocks=0;
        auto audio=std::make_unique<AudioBlock>();audio->rate=48000;audio->count=256;
        while(WaitForSingleObject(stop_.value,0)!=WAIT_OBJECT_0) {
            Tick due=qpc()-config_.bufferMs*ms;
            Tick at=epoch+samplesTime(sample,48000);
            Tick vt=frameTime(epoch,videoIndex,config_.fps);
            if(at<=due && at<=vt) {
                for(int i=0;i<audio->count;++i) {
                    int64_t n=sample+i;
                    bool pulse=n>=48000 && n%48000<4800;
                    audio->samples[size_t(i)]=audio->samples[size_t(audio->count+i)]=
                        pulse?float(.05*std::sin(2*3.141592653589793*997*double(n)/48000)):0;
                }
                outputAudio(*audio,at);sample+=audio->count;++audioBlocks;
            } else if(vt<=due) {
                bool flash=videoIndex>=config_.fps && videoIndex%config_.fps<config_.fps/10;
                outputVideo(flash?white:black,vt);++videoIndex;
                if(videoIndex%config_.fps==0)
                    writeStatus(status,"{\"running\":true,\"test_pattern\":true,\"uses_ndi\":false,\"video_frames\":"+
                        std::to_string(videoIndex)+",\"audio_blocks\":"+std::to_string(audioBlocks)+"}");
            } else WaitForSingleObject(stop_.value,1);
        }
    }
    void run() noexcept {
        auto status=configPath_.parent_path()/"logs"/"obs-status.json";
        try {
            TimerResolution timer;
            WinHandle singleton{CreateMutexW(nullptr,FALSE,L"Local\\A1NdiSender.Instance")};
            if(!singleton.value || GetLastError()==ERROR_ALREADY_EXISTS)
                throw std::runtime_error("A1 capture is in use. Stop the standalone sender or the other A1 OBS source, then apply properties again.");
            config_=config(configPath_);
            // Present the already-held timeline at OBS's current epoch. The same
            // constant moves BOTH streams; it neither adds another wait nor changes
            // their relative offset. Old absolute timestamps can be rejected by
            // OBS's live audio mixer before its first async video frame is drawn.
            obsOffset_=int64_t(os_gettime_ns())-qpc()*100+int64_t(config_.bufferMs)*1000000;
            if(testPattern_) synthetic(status);
            else {
                AlignedCapture capture(config_.vm,config_.width,config_.height,config_.fps,
                                       config_.monitor,config_.bufferMs,config_.audioOffsetMs);
                Tick started=qpc(),nextReport=started+second,lastReport=started;
                uint64_t priorVideo=0;
                blog(LOG_INFO,"[A1 Local] Started %dx%d %dfps, A1 post-master, buffer=%dms, offset=%.3fms. This source does not use NDI.",
                     config_.width,config_.height,config_.fps,config_.bufferMs,config_.audioOffsetMs);
                while(WaitForSingleObject(stop_.value,0)!=WAIT_OBJECT_0) {
                    Tick now=qpc();
                    bool worked=capture.step(now,
                        [this](const AudioBlock& a,Tick t){outputAudio(a,t);},
                        [this](const std::shared_ptr<VideoFrame>& p,Tick t){outputVideo(p,t);});
                    if(!worked) WaitForSingleObject(stop_.value,1);
                    if(now>=nextReport) {
                        bool healthy=capture.vm->lastCallback && now-capture.vm->lastCallback<second &&
                                     capture.desktop.error().empty() && capture.videoSent>0;
                        std::ostringstream s;s<<std::fixed<<std::setprecision(3);
                        s<<"{\"running\":true,\"healthy\":"<<(healthy?"true":"false")
                         <<",\"backend\":\"obs_direct\",\"uses_ndi\":false,\"network_sent\":false"
                         <<",\"width\":"<<config_.width<<",\"height\":"<<config_.height<<",\"fps\":"<<config_.fps
                         <<",\"sample_rate\":"<<capture.vm->sampleRate<<",\"audio_peak\":"<<capture.peak
                         <<",\"buffer_ms\":"<<config_.bufferMs<<",\"audio_offset_ms\":"<<config_.audioOffsetMs
                         <<",\"calibration_verified\":"<<(config_.calibrationVerified?"true":"false")
                         <<",\"video_frames\":"<<capture.videoSent<<",\"audio_blocks\":"<<capture.audioSent
                         <<",\"send_fps\":"<<double(capture.videoSent-priorVideo)*second/double(now-lastReport)
                         <<",\"late_video_drops\":"<<capture.lateVideo<<",\"late_audio_drops\":"<<capture.lateAudio
                         <<",\"video_overflows\":"<<capture.desktop.overflows<<",\"audio_overflows\":"<<capture.vm->overflows
                         <<",\"video_queue_frames\":"<<capture.desktop.queued()<<",\"audio_queue_blocks\":"<<capture.vm->queue.size()
                         <<",\"capture_reconnects\":"<<capture.desktop.reconnects<<",\"audio_restarts\":"<<capture.vm->restarts
                         <<",\"uptime_seconds\":"<<double(now-started)/second
                         <<",\"capture_error\":"<<jsonText(capture.desktop.error())<<"}";
                        writeStatus(status,s.str());capture.peak=0;priorVideo=capture.videoSent;
                        lastReport=now;nextReport=now+second;
                    }
                }
            }
            writeStatus(status,"{\"running\":false,\"backend\":\"obs_direct\"}");
            blog(LOG_INFO,"[A1 Local] Stopped. A1 output preserved.");
        } catch(const std::exception& e) {
            blog(LOG_ERROR,"[A1 Local] %s",e.what());
            writeStatus(status,"{\"running\":false,\"error\":"+jsonText(e.what())+"}");
        } catch(...) { blog(LOG_ERROR,"[A1 Local] Unexpected capture failure"); }
        obs_source_output_video(source_,nullptr);
    }
public:
    explicit LocalSource(obs_source_t* source):source_(source) {
        if(!stop_.value) throw std::runtime_error("Cannot create A1 capture stop event");
    }
    ~LocalSource() { stop(); }
    void stop() noexcept {
        SetEvent(stop_.value);if(worker_.joinable())worker_.join();
    }
    void update(obs_data_t* settings) {
        auto previousPath=configPath_;
        stop();
        requestId_=obs_data_get_string(settings,"deck_request_id");
        std::string path=obs_data_get_string(settings,"config_path");
        configPath_=std::filesystem::path(std::u8string(path.begin(),path.end()));
        // OBS creates a source with defaults before showing its property dialog.
        // Keep a valid idle instance so the user can select the config afterwards.
        if(configPath_.empty()) {
            if(!previousPath.empty()) writeStatus(previousPath.parent_path()/"logs"/"obs-status.json","{\"running\":false}");
            return;
        }
        testPattern_=obs_data_get_bool(settings,"test_pattern");
        ResetEvent(stop_.value);worker_=std::thread(&LocalSource::run,this);
    }
};

const char* sourceName(void*) { return "A1 Desktop Sync (Local)"; }
void* createSource(obs_data_t* settings,obs_source_t* source) {
    try {auto p=std::make_unique<LocalSource>(source);p->update(settings);return p.release();}
    catch(const std::exception& e) {blog(LOG_ERROR,"[A1 Local] Create: %s",e.what());return nullptr;}
}
void destroySource(void* data) { delete static_cast<LocalSource*>(data); }
void updateSource(void* data,obs_data_t* settings) {
    if(!data) return;
    try {static_cast<LocalSource*>(data)->update(settings);}
    catch(const std::exception& e) {blog(LOG_ERROR,"[A1 Local] Update: %s",e.what());}
}
void defaults(obs_data_t* settings) {
    obs_data_set_default_string(settings,"config_path","");
    obs_data_set_default_bool(settings,"test_pattern",false);
}
obs_properties_t* properties(void*) {
    auto p=obs_properties_create();obs_properties_set_flags(p,OBS_PROPERTIES_DEFER_UPDATE);
    obs_properties_add_path(p,"config_path","Sender configuration (sender.ini)",OBS_PATH_FILE,"INI files (*.ini)",nullptr);
    obs_properties_add_bool(p,"test_pattern","Diagnostic flash and tone (replaces live capture)");
    obs_properties_add_text(p,"help","Captures A1 post-master + desktop with the sender's shared buffer. Stop start.bat's sender before using this source. Audio monitoring should remain off. Apply properties to restart after editing sender.ini. Status: logs/obs-status.json",OBS_TEXT_INFO);
    return p;
}
} // namespace

bool obs_module_load(void) {
    obs_source_info info{};info.id="a1_local_sync";info.type=OBS_SOURCE_TYPE_INPUT;
    info.output_flags=OBS_SOURCE_ASYNC_VIDEO|OBS_SOURCE_AUDIO|OBS_SOURCE_DO_NOT_DUPLICATE;
    info.get_name=sourceName;info.create=createSource;info.destroy=destroySource;
    info.update=updateSource;info.get_defaults=defaults;info.get_properties=properties;
    obs_register_source(&info);return true;
}

void obs_module_post_load(void) { startDeckControl(); }
void obs_module_unload(void) { stopDeckControl(); }
