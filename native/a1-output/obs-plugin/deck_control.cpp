// A local-only pipe, serviced on OBS's UI thread. It exists even with no sources
// and needs neither a scene-specific Lua script nor WebSocket credentials.
#include <windows.h>
#include <obs-module.h>
#include <obs-frontend-api.h>
#include <filesystem>
#include <string>
#include <cstring>
#include <stdexcept>
#include <ctime>
#include "deck_control.hpp"

namespace {
HANDLE pipeHandle = INVALID_HANDLE_VALUE;
UINT_PTR timerId = 0;
ULONGLONG connectedAt = 0;
bool connected = false, replied = false;
std::string input;
constexpr wchar_t pipeName[] = L"\\\\.\\pipe\\chzzk-a1-local-v2";
struct Data {
    obs_data_t* p;
    explicit Data(obs_data_t* value = nullptr):p(value ? value : obs_data_create()) {}
    ~Data() { obs_data_release(p); }
};
struct Source { obs_source_t* p = nullptr; ~Source(){ if(p) obs_source_release(p); } };
struct Found { obs_source_t* p = nullptr; int count = 0; };
bool findSource(void* data, obs_source_t* source) {
    auto& found = *static_cast<Found*>(data);
    if(std::strcmp(obs_source_get_id(source), "a1_local_sync") == 0) {
        ++found.count;
        if(!found.p) found.p = obs_source_get_ref(source);
    }
    return true;
}
std::string handle(const std::string& text) {
    Data response;
    obs_data_set_int(response.p, "version", 2);
    obs_data_set_bool(response.p, "ok", false);
    try {
        auto raw = obs_data_create_from_json(text.c_str());
        if(!raw) throw std::runtime_error("Invalid request");
        Data request(raw);
        if(obs_data_get_int(request.p,"version") != 2) throw std::runtime_error("Unsupported protocol");
        std::string action = obs_data_get_string(request.p,"action");
        std::string requestId = obs_data_get_string(request.p,"id");
        if(action!="status" && (requestId.empty() || requestId.size()>64)) throw std::runtime_error("Invalid request id");
        obs_data_set_string(response.p,"request_id",requestId.c_str());
        if(action!="status" && action!="start" && action!="stop" && action!="apply")
            throw std::runtime_error("Unsupported command");
        if(action!="status" && obs_data_get_int(request.p,"expires_at") < static_cast<long long>(std::time(nullptr))*1000)
            throw std::runtime_error("Request expired; retry from Stream Deck");
        Found found; obs_enum_sources(findSource, &found); Source source{found.p};
        if(found.count > 1) throw std::runtime_error("A1 캡처 소스가 여러 개입니다. 하나만 남기고 다시 시도해 주세요.");
        Source sceneSource{obs_frontend_get_current_scene()};
        auto scene = sceneSource.p ? obs_scene_from_source(sceneSource.p) : nullptr;
        if(action=="start" || action=="apply") {
            if(!scene) throw std::runtime_error("OBS에서 장면을 하나 만든 뒤 다시 시도해 주세요.");
            std::string config = obs_data_get_string(request.p,"config_path");
            auto file = std::filesystem::path(std::u8string(config.begin(),config.end()));
            if(!file.is_absolute() || (file.filename()!=L"local-capture.ini" && file.filename()!=L"sender.ini") || !std::filesystem::is_regular_file(file))
                throw std::runtime_error("캡처 설정 파일을 읽을 수 없습니다. 저장 후 다시 시도해 주세요.");
            if(!source.p) {
                // OBS chooses an available source name; do not replace unrelated sources.
                source.p = obs_source_create("a1_local_sync","A1 Desktop + Audio",nullptr,nullptr);
                if(!source.p) throw std::runtime_error("캡처 소스를 만들지 못했습니다. OBS를 다시 열고 재시도해 주세요.");
            }
            auto item = obs_scene_find_source_recursive(scene, obs_source_get_name(source.p));
            if(!item) {
                item = obs_scene_add(scene,source.p);
                if(!item) throw std::runtime_error("현재 장면에 소스를 추가하지 못했습니다. 다시 시도해 주세요.");
                obs_video_info video{};
                if(obs_get_video_info(&video)) {
                    vec2 bounds{static_cast<float>(video.base_width),static_cast<float>(video.base_height)};
                    obs_sceneitem_set_bounds_type(item,OBS_BOUNDS_SCALE_INNER);
                    obs_sceneitem_set_bounds(item,&bounds);
                }
            }
            obs_sceneitem_set_visible(item,true);
            Data settings(obs_source_get_settings(source.p));
            obs_data_set_string(settings.p,"config_path",config.c_str());
            obs_data_set_string(settings.p,"deck_config_path",config.c_str());
            obs_data_set_bool(settings.p,"test_pattern",false);
            obs_data_set_string(settings.p,"deck_request_id",requestId.c_str());
            obs_source_update(source.p,settings.p);
            obs_frontend_save();
        } else if(action=="stop" && source.p) {
            Data settings(obs_source_get_settings(source.p));
            std::string previous=obs_data_get_string(settings.p,"config_path");
            if(!previous.empty()) obs_data_set_string(settings.p,"deck_config_path",previous.c_str());
            obs_data_set_string(settings.p,"config_path","");
            obs_data_set_string(settings.p,"deck_request_id",requestId.c_str());
            obs_source_update(source.p,settings.p);
            obs_frontend_save();
        }
        obs_data_set_bool(response.p,"source_present",source.p!=nullptr);
        obs_data_set_bool(response.p,"source_attached",scene && source.p && obs_scene_find_source_recursive(scene,obs_source_get_name(source.p)));
        obs_data_set_string(response.p,"scene_name",sceneSource.p ? obs_source_get_name(sceneSource.p) : "");
        if(source.p) {
            Data settings(obs_source_get_settings(source.p));
            std::string current=obs_data_get_string(settings.p,"config_path");
            obs_data_set_bool(response.p,"capture_requested",!current.empty());
            obs_data_set_string(response.p,"config_path",current.empty() ? obs_data_get_string(settings.p,"deck_config_path") : current.c_str());
        }
        obs_data_set_bool(response.p,"recording",obs_frontend_recording_active());
        obs_data_set_bool(response.p,"streaming",obs_frontend_streaming_active());
        obs_data_set_bool(response.p,"ok",true);
    } catch(const std::exception& error) { obs_data_set_string(response.p,"error",error.what()); }
    return std::string(obs_data_get_json(response.p))+"\n";
}
void resetClient() {
    DisconnectNamedPipe(pipeHandle); connected=false; replied=false; input.clear();
}
void CALLBACK poll(HWND, UINT, UINT_PTR, DWORD) {
    if(pipeHandle==INVALID_HANDLE_VALUE) return;
    if(!connected) {
        if(!ConnectNamedPipe(pipeHandle,nullptr) && GetLastError()!=ERROR_PIPE_CONNECTED) return;
        connected=true; connectedAt=GetTickCount64();
    }
    if(GetTickCount64()-connectedAt>5000) { resetClient(); return; }
    char buffer[4096]; DWORD size=0;
    if(!ReadFile(pipeHandle,buffer,sizeof(buffer),&size,nullptr)) {
        if(GetLastError()!=ERROR_NO_DATA) resetClient();
        return;
    }
    if(replied || !size) return;
    input.append(buffer,size);
    if(input.size()>16384) {resetClient(); return;}
    if(input.find('\n')==std::string::npos) return;
    auto response=handle(input);
    DWORD written=0;
    if(!WriteFile(pipeHandle,response.data(),static_cast<DWORD>(response.size()),&written,nullptr) || written!=response.size()) {resetClient();return;}
    replied=true; // Retain the response until the client reads it and disconnects.
}
}
void startDeckControl() {
    pipeHandle=CreateNamedPipeW(pipeName,PIPE_ACCESS_DUPLEX|FILE_FLAG_FIRST_PIPE_INSTANCE,
        PIPE_TYPE_BYTE|PIPE_READMODE_BYTE|PIPE_NOWAIT|PIPE_REJECT_REMOTE_CLIENTS,1,16384,16384,0,nullptr);
    if(pipeHandle==INVALID_HANDLE_VALUE) {blog(LOG_WARNING,"[A1 Local] Cannot create local control pipe: %lu",GetLastError());return;}
    timerId=SetTimer(nullptr,0,50,poll);
    if(!timerId) stopDeckControl();
}
void stopDeckControl() {
    if(timerId) {KillTimer(nullptr,timerId);timerId=0;}
    if(pipeHandle!=INVALID_HANDLE_VALUE) {CloseHandle(pipeHandle);pipeHandle=INVALID_HANDLE_VALUE;}
}
