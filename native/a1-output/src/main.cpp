#include "aligned_capture.hpp"
#include "config.hpp"
#include "ndi.hpp"
#include "voicemeeter.hpp"
#include <shellapi.h>
#include <mmsystem.h>
#include <psapi.h>
#include <fstream>
#include <iostream>
#include <sstream>
#include <map>
#include <iomanip>

using namespace a1;
namespace fs = std::filesystem;
namespace {
constexpr wchar_t stopName[] = L"Local\\A1NdiSender.Stop";
HANDLE stopEvent = nullptr;
BOOL WINAPI consoleStop(DWORD) { if(stopEvent) SetEvent(stopEvent); return TRUE; }
struct Handle { HANDLE h; ~Handle(){ if(h) CloseHandle(h); } operator HANDLE() const {return h;} };
struct TimerResolution { TimerResolution(){timeBeginPeriod(1);} ~TimerResolution(){timeEndPeriod(1);} };
std::string jsonString(const std::string& s) {
    std::string out="\"";
    for(unsigned char c:s) { if(c=='"'||c=='\\') out+='\\'; if(c>=32) out+=char(c); }
    return out+'"';
}
class Tray {
    std::thread thread_;
    std::atomic<HWND> window_{nullptr};
    static void addIcon(HWND w) {
        NOTIFYICONDATAW icon{}; icon.cbSize=sizeof(icon); icon.hWnd=w; icon.uID=1;
        icon.uFlags=NIF_ICON|NIF_MESSAGE|NIF_TIP; icon.uCallbackMessage=WM_APP+1;
        icon.hIcon=LoadIconW(nullptr,IDI_APPLICATION); wcscpy_s(icon.szTip,L"A1 Desktop Sync - NDI sender (click to stop)");
        Shell_NotifyIconW(NIM_ADD,&icon);
    }
    static LRESULT CALLBACK proc(HWND w,UINT m,WPARAM wp,LPARAM lp) {
        static const UINT taskbarCreated=RegisterWindowMessageW(L"TaskbarCreated");
        if(m==taskbarCreated) {addIcon(w);return 0;}
        if(m==WM_APP+1 && (lp==WM_RBUTTONUP||lp==WM_LBUTTONUP)) {
            HMENU menu=CreatePopupMenu();
            AppendMenuW(menu,MF_STRING|MF_DISABLED,1,L"A1 Desktop Sync - running");
            AppendMenuW(menu,MF_STRING,2,L"Stop sender");
            POINT p; GetCursorPos(&p); SetForegroundWindow(w);
            int cmd=TrackPopupMenu(menu,TPM_RETURNCMD|TPM_NONOTIFY,p.x,p.y,0,w,nullptr);
            DestroyMenu(menu); if(cmd==2) SetEvent(stopEvent); return 0;
        }
        if(m==WM_CLOSE) { DestroyWindow(w); return 0; }
        if(m==WM_DESTROY) { PostQuitMessage(0); return 0; }
        return DefWindowProcW(w,m,wp,lp);
    }
public:
    Tray() {
        thread_=std::thread([this] {
            WNDCLASSW wc{}; wc.hInstance=GetModuleHandleW(nullptr); wc.lpszClassName=L"A1NDITray"; wc.lpfnWndProc=proc;
            RegisterClassW(&wc);
            HWND w=CreateWindowW(wc.lpszClassName,L"A1 NDI Sender",0,0,0,0,0,nullptr,nullptr,wc.hInstance,nullptr);
            if(!w) return;
            NOTIFYICONDATAW icon{}; icon.cbSize=sizeof(icon); icon.hWnd=w; icon.uID=1;
            addIcon(w); window_=w;
            MSG msg; while(GetMessageW(&msg,nullptr,0,0)>0) { TranslateMessage(&msg); DispatchMessageW(&msg); }
            Shell_NotifyIconW(NIM_DELETE,&icon); window_=nullptr;
        });
    }
    ~Tray() {
        for(int i=0;i<100&&!window_;++i) Sleep(10);
        if(auto w=window_.load()) PostMessageW(w,WM_CLOSE,0,0);
        if(thread_.joinable()) thread_.join();
    }
};
Tick unixTime() {
    FILETIME ft; GetSystemTimePreciseAsFileTime(&ft);
    return Tick((uint64_t(ft.dwHighDateTime)<<32)|ft.dwLowDateTime)-116444736000000000LL;
}
uint64_t cpuTime() {
    FILETIME a,b,k,u; GetProcessTimes(GetCurrentProcess(),&a,&b,&k,&u);
    return ((uint64_t(k.dwHighDateTime)<<32)|k.dwLowDateTime)+((uint64_t(u.dwHighDateTime)<<32)|u.dwLowDateTime);
}
void saveStatus(const fs::path& path,const std::string& content) {
    auto tmp=path; tmp+=L".tmp";
    { std::ofstream f(tmp,std::ios::binary|std::ios::trunc); f<<content; if(!f) return; }
    MoveFileExW(tmp.c_str(),path.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH);
}

int selfTest(const Config& c,int seconds) {
    std::vector<uint8_t> black(size_t(c.width)*c.height*2),white(black.size());
    for(size_t p=0;p<black.size();p+=4) { black[p]=black[p+2]=white[p]=white[p+2]=128; black[p+1]=black[p+3]=16; white[p+1]=white[p+3]=235; }
    Ndi ndi(c.ndi,c.name+" Test");
    Tick epoch=qpc(), base=unixTime()-epoch;
    std::cout<<"SELF TEST source="<<ndi.sourceName<<std::endl;
    std::vector<float> audio(2*size_t(48000/c.fps+2));
    for(int64_t frame=0;frame<int64_t(seconds)*c.fps && WaitForSingleObject(stopEvent,0)!=WAIT_OBJECT_0;++frame) {
        Tick t=frameTime(epoch,frame,c.fps);
        while(qpc()<t+c.bufferMs*ms) { if(WaitForSingleObject(stopEvent,1)==WAIT_OBJECT_0) break; }
        int n=int((frame+1)*48000/c.fps-frame*48000/c.fps);
        for(int i=0;i<n;++i) {
            int64_t sample=frame*48000/c.fps+i;
            bool pulse=sample>=48000 && sample%48000<4800;
            audio[size_t(i)]=audio[size_t(n+i)]=pulse?float(.05*std::sin(2*3.141592653589793*997*double(sample)/48000)):0;
        }
        NdiAudio a{48000,2,n,base+t,audio.data(),n*4,nullptr,0}; ndi.audio(a);
        bool flash=frame>=c.fps && frame%c.fps<c.fps/10;
        NdiVideo v; v.width=c.width;v.height=c.height;v.fpsN=c.fps;v.fourcc=UYVY;v.timecode=base+t;
        v.aspect=float(c.width)/float(c.height);v.data=flash?white.data():black.data();v.stride=c.width*2;
        ndi.video(&v);
    }
    ndi.video(nullptr); return 0;
}
int captureOnly(const Config& c,int seconds,const fs::path& logs) {
    // Deliberately does not construct Ndi or load its DLL. No network transmission.
    qpc(); // warm QPC frequency initialization before the realtime callback
    auto vm=std::make_unique<Voicemeeter>(c.vm);
    Desktop desktop(c.width,c.height,c.fps,c.monitor,c.bufferMs);
    Tick start=qpc();uint64_t blocks=0;float peak=0;bool saved=false;
    while(qpc()-start<int64_t(seconds)*second && WaitForSingleObject(stopEvent,0)!=WAIT_OBJECT_0) {
        if(vm->restartNeeded.exchange(false)) vm->restart();
        while(auto a=vm->queue.peek()) {
            for(int i=0;i<a->count*2;++i) peak=std::max(peak,std::abs(a->samples[size_t(i)]));
            ++blocks;vm->queue.pop();
        }
        auto frame=desktop.at(qpc());
        if(frame&&!saved) {
            std::ofstream f(logs/"desktop.uyvy",std::ios::binary);
            f.write(reinterpret_cast<const char*>(frame->pixels.data()),std::streamsize(frame->pixels.size()));saved=true;
        }
        WaitForSingleObject(stopEvent,1);
    }
    std::ostringstream s;
    s<<"{\"mode\":\"offline_capture_only\",\"ndi_loaded\":false,\"network_sent\":false,\"audio_blocks\":"<<blocks
     <<",\"audio_peak\":"<<peak<<",\"sample_rate\":"<<vm->sampleRate<<",\"audio_block_samples\":"<<vm->blockSize
     <<",\"audio_overflows\":"<<vm->overflows<<",\"invalid_audio_blocks\":"<<vm->invalidBlocks
     <<",\"video_captures\":"<<desktop.captures<<",\"width\":"<<c.width<<",\"height\":"<<c.height
     <<",\"capture_error\":"<<jsonString(desktop.error())<<"}\n";
    saveStatus(logs/"capture-probe.json",s.str());std::cout<<s.str();
    return blocks && saved ? 0:2;
}
} // namespace

int main(int argc,char** argv) {
    fs::path settings="sender.ini",logDir="logs";
    int duration=0; bool synthetic=false,trace=false,noTray=false,probeOnly=false,ownsInstance=false;
    try {
        for(int i=1;i<argc;++i) {
            std::string arg=argv[i];
            if(arg=="--stop") { Handle h{OpenEventW(EVENT_MODIFY_STATE,FALSE,stopName)}; if(h.h) SetEvent(h); return h.h?0:1; }
            if(arg=="--help") { std::cout<<"a1-ndi-sender [--config sender.ini] [--duration seconds] [--self-test | --probe-only] [--trace] [--no-tray] [--log-dir logs]\nStop: a1-ndi-sender --stop\n"; return 0; }
            if(arg=="--config"&&i+1<argc) settings=argv[++i];
            else if(arg=="--log-dir"&&i+1<argc) logDir=argv[++i];
            else if(arg=="--duration"&&i+1<argc) { duration=std::stoi(argv[++i]); if(duration<1||duration>86400) throw std::runtime_error("Duration must be 1..86400 seconds"); }
            else if(arg=="--self-test") synthetic=true;
            else if(arg=="--probe-only") probeOnly=true;
            else if(arg=="--trace") trace=true;
            else if(arg=="--no-tray") noTray=true;
            else throw std::runtime_error("Unknown argument: "+arg);
        }
        auto c=config(settings);
        Handle singleton{CreateMutexW(nullptr,FALSE,L"Local\\A1NdiSender.Instance")};
        if(!singleton.h||GetLastError()==ERROR_ALREADY_EXISTS) throw std::runtime_error("A1 sender is already running");
        ownsInstance=true;
        Handle stop{CreateEventW(nullptr,TRUE,FALSE,stopName)}; stopEvent=stop;
        if(!stop.h) throw std::runtime_error("Cannot create stop event");
        SetConsoleCtrlHandler(consoleStop,TRUE); TimerResolution timer;
        fs::create_directories(logDir);
        if(synthetic&&probeOnly) throw std::runtime_error("Choose either --self-test or --probe-only");
        if(probeOnly) return captureOnly(c,duration?duration:10,logDir);
        if(synthetic) return selfTest(c,duration?duration:12);
        saveStatus(logDir/"status.json","{\"running\":true,\"healthy\":false,\"state\":\"starting\"}\n");
        Tick started=qpc(),utcBase=unixTime()-started;
        std::shared_ptr<VideoFrame> inFlight; // survives NDI's last asynchronous send
        AlignedCapture capture(c.vm,c.width,c.height,c.fps,c.monitor,c.bufferMs,c.audioOffsetMs);
        auto& vm=capture.vm;
        auto& desktop=capture.desktop;
        Ndi ndi(c.ndi,c.name);
        std::unique_ptr<Tray> tray; if(!noTray) tray=std::make_unique<Tray>();
        std::ofstream events;
        if(trace) { events.open(logDir/"frames.csv"); events<<"kind,timecode,submit_qpc,content_qpc,samples,peak\n"; }
        std::cout<<"NDI source: "<<ndi.sourceName<<"\nA1 post-master, stereo, 1080p target; holdback="<<c.bufferMs
                 <<"ms, audio offset="<<c.audioOffsetMs<<"ms\nClock: QPC + recovered VM sample clock; AV offset calibration="
                 <<(c.calibrationVerified?"configured":"NOT VERIFIED")<<std::endl;
        Tick nextReport=started+second,lastReport=started;
        uint64_t priorV=0,priorCpu=cpuTime();
        auto& sentV=capture.videoSent; auto& sentA=capture.audioSent;
        auto& lateV=capture.lateVideo; auto& lateA=capture.lateAudio;
        auto& repeatV=capture.repeats; auto& peak=capture.peak;
        while(WaitForSingleObject(stopEvent,0)!=WAIT_OBJECT_0) {
            Tick now=qpc();
            if(duration && now-started>=int64_t(duration)*second) break;
            bool worked=capture.step(now,
                [&](const AudioBlock& a,Tick t) {
                    NdiAudio frame{a.rate,2,a.count,utcBase+t,const_cast<float*>(a.samples.data()),a.count*4,nullptr,0};
                    ndi.audio(frame);
                    if(trace) events<<"audio,"<<frame.timecode<<','<<qpc()<<','<<a.time<<','<<a.count<<','<<capture.peak<<'\n';
                },
                [&](const std::shared_ptr<VideoFrame>& pixels,Tick t) {
                    NdiVideo v;v.width=c.width;v.height=c.height;v.fpsN=c.fps;v.aspect=float(c.width)/float(c.height);
                    v.fourcc=UYVY;v.timecode=utcBase+t;v.data=pixels->pixels.data();v.stride=c.width*2;
                    ndi.video(&v);inFlight=pixels;
                    if(trace) events<<"video,"<<v.timecode<<','<<qpc()<<','<<pixels->time<<",0,0\n";
                });
            if(!worked) WaitForSingleObject(stopEvent,1);
            if(now>=nextReport) {
                Tick interval=now-lastReport;auto cpu=cpuTime();PROCESS_MEMORY_COUNTERS pm{};
                GetProcessMemoryInfo(GetCurrentProcess(),&pm,sizeof(pm));
                double cpuPercent=100.0*double(cpu-priorCpu)/double(interval)/GetActiveProcessorCount(ALL_PROCESSOR_GROUPS);
                std::ostringstream s;s<<std::fixed<<std::setprecision(3);
                bool healthy=vm->lastCallback && now-vm->lastCallback<second && desktop.error().empty() && sentV>0;
                s<<"{\n  \"running\":true,\n  \"healthy\":"<<(healthy?"true":"false")<<",\n  \"source\":"<<jsonString(ndi.sourceName)
                 <<",\n  \"width\":"<<c.width<<",\"height\":"<<c.height<<",\"fps\":"<<c.fps
                 <<",\n  \"audio_source\":\"Voicemeeter Main Callback / A1 post-master\",\n  \"sample_rate\":"<<vm->sampleRate
                 <<",\"audio_block_samples\":"<<vm->blockSize<<",\"audio_peak\":"<<peak
                 <<",\n  \"buffer_ms\":"<<c.bufferMs<<",\"audio_offset_ms\":"<<c.audioOffsetMs
                 <<",\n  \"clock_mode\":\"qpc_and_recovered_audio_sample_clock\",\"calibration_verified\":"<<(c.calibrationVerified?"true":"false")
                 <<",\n  \"video_sent\":"<<sentV<<",\"audio_blocks_sent\":"<<sentA<<",\"send_fps\":"<<double(sentV-priorV)*second/double(interval)
                 <<",\n  \"video_repeats\":"<<repeatV<<",\"late_video_drops\":"<<lateV<<",\"late_audio_drops\":"<<lateA
                 <<",\n  \"audio_queue_blocks\":"<<vm->queue.size()<<",\"video_queue_frames\":"<<desktop.queued()
                 <<",\"audio_overflows\":"<<vm->overflows<<",\"video_overflows\":"<<desktop.overflows
                 <<",\"invalid_audio_blocks\":"<<vm->invalidBlocks<<",\"audio_restarts\":"<<vm->restarts
                 <<",\"capture_reconnects\":"<<desktop.reconnects<<",\n  \"receivers\":"<<ndi.connections()
                 <<",\"cpu_percent_machine\":"<<cpuPercent<<",\"working_set_mb\":"<<double(pm.WorkingSetSize)/1048576
                 <<",\n  \"uptime_seconds\":"<<double(now-started)/second<<",\"capture_error\":"<<jsonString(desktop.error())<<"\n}\n";
                saveStatus(logDir/"status.json",s.str());
                std::cout<<"fps="<<double(sentV-priorV)*second/double(interval)<<" A1 peak="<<peak<<" queue="<<vm->queue.size()
                         <<" CPU="<<cpuPercent<<"% memory="<<pm.WorkingSetSize/1048576<<"MB receivers="<<ndi.connections()<<std::endl;
                if(trace) events.flush();
                lastReport=now;nextReport=now+second;priorCpu=cpu;priorV=sentV;peak=0;
            }
        }
        ndi.video(nullptr);
        saveStatus(logDir/"status.json","{\"running\":false,\"video_sent\":"+std::to_string(sentV)+",\"audio_blocks_sent\":"+std::to_string(sentA)+"}\n");
        std::cout<<"Stopped cleanly. Voicemeeter output paths retained."<<std::endl;
        return 0;
    } catch(const std::exception& e) {
        std::cerr<<"ERROR: "<<e.what()<<std::endl;
        if(ownsInstance) try { fs::create_directories(logDir);auto error="{\"running\":false,\"error\":"+jsonString(e.what())+"}\n";saveStatus(logDir/"error.json",error);saveStatus(logDir/"status.json",error); } catch(...) {}
        return 1;
    }
}
