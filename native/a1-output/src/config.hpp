#pragma once
#include "common.hpp"
#include <fstream>

namespace a1 {
namespace fs = std::filesystem;
struct Config {
    std::string name="A1 Desktop Sync";
    int width=1920,height=1080,fps=60,monitor=0,bufferMs=500;
    double audioOffsetMs=0;
    bool calibrationVerified=false;
    fs::path ndi=L"C:\\Program Files\\NDI\\NDI 6 Tools\\Runtime\\Processing.NDI.Lib.x64.dll";
    fs::path vm=L"C:\\Program Files (x86)\\VB\\Voicemeeter\\VoicemeeterRemote64.dll";
};
std::string trim(std::string s) {
    auto first=s.find_first_not_of(" \t\r\n");
    if(first==std::string::npos) return {};
    return s.substr(first,s.find_last_not_of(" \t\r\n")-first+1);
}
Config config(const fs::path& path) {
    Config c; std::ifstream f(path);
    if(!f) throw std::runtime_error("Cannot read sender.ini: "+path.string());
    std::string line; int lineno=0;
    while(std::getline(f,line)) {
        ++lineno; line=trim(line); if(line.empty()||line[0]=='#') continue;
        auto pos=line.find('='); if(pos==std::string::npos) throw std::runtime_error("Invalid config line "+std::to_string(lineno));
        auto k=trim(line.substr(0,pos)), v=trim(line.substr(pos+1));
        auto integer=[&] { size_t n=0; int x=std::stoi(v,&n); if(n!=v.size()) throw std::runtime_error("Invalid number: "+k); return x; };
        if(k=="name") c.name=v;
        else if(k=="width") c.width=integer(); else if(k=="height") c.height=integer();
        else if(k=="fps") c.fps=integer(); else if(k=="monitor") c.monitor=integer();
        else if(k=="buffer_ms") c.bufferMs=integer();
        else if(k=="audio_offset_ms") { size_t n=0; c.audioOffsetMs=std::stod(v,&n); if(n!=v.size()) throw std::runtime_error("Invalid audio offset"); }
        else if(k=="calibration_verified") { if(v!="true"&&v!="false") throw std::runtime_error("Invalid calibration flag"); c.calibrationVerified=v=="true"; }
        else if(k=="ndi_dll") c.ndi=fs::path(std::u8string(v.begin(),v.end()));
        else if(k=="voicemeeter_dll") c.vm=fs::path(std::u8string(v.begin(),v.end()));
        else throw std::runtime_error("Unknown configuration key: "+k);
    }
    if(c.width<320||c.width>3840||c.width%2||c.height<180||c.height>2160||c.fps<15||c.fps>60||c.monitor<0||
       c.bufferMs<200||c.bufferMs>2000||!std::isfinite(c.audioOffsetMs)||std::abs(c.audioOffsetMs)>c.bufferMs-100||
       c.name.empty()||c.name.size()>150) throw std::runtime_error("Invalid dimensions, fps, buffer, name or audio offset");
    return c;
}
} // namespace a1
