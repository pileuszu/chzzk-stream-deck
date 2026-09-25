#include "config.hpp"
#include <iostream>

int main() {
    const auto file = a1::fs::temp_directory_path() / ("a1-config-test-" + std::to_string(GetCurrentProcessId()) + ".ini");
    struct Cleanup { a1::fs::path file; ~Cleanup(){ std::error_code ec; a1::fs::remove(file,ec); } } cleanup{file};
    auto accepts = [&](const std::string& text, bool video=false) {
        { std::ofstream out(file); out << text; }
        try { a1::config(file,video); return true; } catch(...) { return false; }
    };
    if (!accepts("output_mode=audio_only\nbuffer_ms=0\naudio_offset_ms=0\n") ||
        accepts("output_mode=audio_only\nbuffer_ms=-1\n") ||
        accepts("output_mode=audio_only\nbuffer_ms=0\naudio_offset_ms=0.1\n") ||
        accepts("output_mode=audio_only\nbuffer_ms=0\n",true) ||
        accepts("output_mode=audio_video\nbuffer_ms=0\n") ||
        accepts("buffer_ms=199\n") ||
        !accepts("buffer_ms=200\naudio_offset_ms=-100\n") ||
        !accepts("output_mode=audio_only\nbuffer_ms=100\naudio_offset_ms=-100\n") ||
        accepts("output_mode=audio_only\nbuffer_ms=2001\n")) {
        std::cerr << "Output settings boundary failed\n"; return 1;
    }
    std::cout << "Audio-only zero holdback and video/OBS limits verified\n";
}
