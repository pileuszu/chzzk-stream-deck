#pragma once
#include <windows.h>
#include <string>
#include <stdexcept>
#include <filesystem>
#include "timing.hpp"

namespace a1 {
inline Tick qpc() noexcept {
    static const int64_t freq = [] { LARGE_INTEGER f; QueryPerformanceFrequency(&f); return f.QuadPart; }();
    LARGE_INTEGER c; QueryPerformanceCounter(&c);
    return (c.QuadPart / freq) * second + (c.QuadPart % freq) * second / freq;
}
inline void check(HRESULT hr, const char* what) {
    if (FAILED(hr)) { char b[128]; sprintf_s(b, "%s (HRESULT 0x%08lx)", what, static_cast<unsigned long>(hr)); throw std::runtime_error(b); }
}
template<class T> T symbol(HMODULE dll, const char* name) {
    auto p = GetProcAddress(dll, name);
    if (!p) throw std::runtime_error(std::string("Missing DLL export: ") + name);
    return reinterpret_cast<T>(p);
}
class Library {
    HMODULE module_{};
public:
    explicit Library(const std::filesystem::path& path) {
        module_ = LoadLibraryExW(path.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
        if (!module_) throw std::runtime_error("Cannot load runtime DLL: " + path.string());
    }
    ~Library() { if (module_) FreeLibrary(module_); }
    operator HMODULE() const { return module_; }
    Library(const Library&) = delete;
    Library& operator=(const Library&) = delete;
};
} // namespace a1
