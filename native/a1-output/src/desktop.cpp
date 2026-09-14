#include "desktop.hpp"
#include <d3d11.h>
#include <dxgi1_2.h>
#include <d3dcompiler.h>
#include <wrl/client.h>
#include <cstring>

namespace a1 {
using Microsoft::WRL::ComPtr;
namespace {
// Scale and convert on the GPU, then read back only 2 bytes per output pixel.
// Each RGBA render-target texel is four raw bytes U,Y0,V,Y1 for a pixel pair.
const char* shader = R"(
Texture2D image : register(t0);
SamplerState linearClamp : register(s0);
cbuffer Size : register(b0) { float outWidth; float outHeight; float srcAspect; float pad; };
struct V { float4 p:SV_POSITION; };
V vs(uint id:SV_VertexID) {
  V v; float2 uv=float2((id<<1)&2,id&2); v.p=float4(uv*float2(2,-2)+float2(-1,1),0,1); return v;
}
float3 rgb(float2 uv) {
  float dstAspect=outWidth/outHeight;
  if(srcAspect>dstAspect) uv.y=(uv.y-.5)*(srcAspect/dstAspect)+.5;
  else uv.x=(uv.x-.5)*(dstAspect/srcAspect)+.5;
  if(any(uv<0)||any(uv>1)) return 0;
  return image.SampleLevel(linearClamp,uv,0).rgb;
}
float4 ps(V v):SV_TARGET {
  float x=floor(v.p.x)*2;
  float3 a=rgb(float2((x+.5)/outWidth,v.p.y/outHeight));
  float3 b=rgb(float2((x+1.5)/outWidth,v.p.y/outHeight));
  float3 avg=(a+b)*.5;
  float y0=dot(a,float3(.2126,.7152,.0722))*(219.0/255)+16.0/255;
  float y1=dot(b,float3(.2126,.7152,.0722))*(219.0/255)+16.0/255;
  float u=dot(avg,float3(-.114572,-.385428,.5))*(224.0/255)+128.0/255;
  float vv=dot(avg,float3(.5,-.454153,-.045847))*(224.0/255)+128.0/255;
  return float4(u,y0,vv,y1);
}
)";

struct Capture {
    ComPtr<ID3D11Device> device;
    ComPtr<ID3D11DeviceContext> context;
    ComPtr<IDXGIOutputDuplication> duplication;
    ComPtr<ID3D11Texture2D> source, target, staging;
    ComPtr<ID3D11ShaderResourceView> sourceView;
    ComPtr<ID3D11RenderTargetView> targetView;
    ComPtr<ID3D11VertexShader> vertex;
    ComPtr<ID3D11PixelShader> pixel;
    ComPtr<ID3D11SamplerState> sampler;
    ComPtr<ID3D11Buffer> constants;
    int width, height;
    bool acquired = false, haveImage = false;
    Tick imageTime = 0;
    Capture(int w, int h, int monitor): width(w), height(h) {
        ComPtr<IDXGIFactory1> factory; check(CreateDXGIFactory1(IID_PPV_ARGS(&factory)), "CreateDXGIFactory1");
        ComPtr<IDXGIAdapter1> chosenAdapter; ComPtr<IDXGIOutput> chosenOutput;
        int seen = 0;
        for (UINT a = 0; !chosenOutput; ++a) {
            ComPtr<IDXGIAdapter1> adapter;
            if (factory->EnumAdapters1(a, &adapter) == DXGI_ERROR_NOT_FOUND) break;
            for (UINT o = 0;; ++o) {
                ComPtr<IDXGIOutput> output;
                if (adapter->EnumOutputs(o, &output) == DXGI_ERROR_NOT_FOUND) break;
                DXGI_OUTPUT_DESC desc{}; output->GetDesc(&desc);
                if (!desc.AttachedToDesktop) continue;
                if (seen++ == monitor) { chosenAdapter = adapter; chosenOutput = output; break; }
            }
        }
        if (!chosenOutput) throw std::runtime_error("Selected monitor is not attached");
        D3D_FEATURE_LEVEL level;
        check(D3D11CreateDevice(chosenAdapter.Get(),D3D_DRIVER_TYPE_UNKNOWN,nullptr,D3D11_CREATE_DEVICE_BGRA_SUPPORT,
              nullptr,0,D3D11_SDK_VERSION,&device,&level,&context), "D3D11CreateDevice");
        ComPtr<IDXGIOutput1> output1; check(chosenOutput.As(&output1), "IDXGIOutput1");
        check(output1->DuplicateOutput(device.Get(), &duplication), "DuplicateOutput");
        DXGI_OUTDUPL_DESC d{}; duplication->GetDesc(&d);
        if (d.Rotation != DXGI_MODE_ROTATION_IDENTITY && d.Rotation != DXGI_MODE_ROTATION_UNSPECIFIED)
            throw std::runtime_error("Rotated monitors are not supported in this version");
        D3D11_TEXTURE2D_DESC desc{};
        desc.Width=d.ModeDesc.Width; desc.Height=d.ModeDesc.Height;
        desc.MipLevels=desc.ArraySize=1; desc.Format=DXGI_FORMAT_B8G8R8A8_UNORM;
        desc.SampleDesc.Count=1; desc.Usage=D3D11_USAGE_DEFAULT; desc.BindFlags=D3D11_BIND_SHADER_RESOURCE;
        check(device->CreateTexture2D(&desc,nullptr,&source),"source texture");
        check(device->CreateShaderResourceView(source.Get(),nullptr,&sourceView),"source view");
        desc.Width=UINT(w/2); desc.Height=UINT(h); desc.Format=DXGI_FORMAT_R8G8B8A8_UNORM;
        desc.BindFlags=D3D11_BIND_RENDER_TARGET;
        check(device->CreateTexture2D(&desc,nullptr,&target),"UYVY target");
        check(device->CreateRenderTargetView(target.Get(),nullptr,&targetView),"target view");
        desc.BindFlags=0; desc.Usage=D3D11_USAGE_STAGING; desc.CPUAccessFlags=D3D11_CPU_ACCESS_READ;
        check(device->CreateTexture2D(&desc,nullptr,&staging),"readback texture");
        ComPtr<ID3DBlob> vs, ps, errors;
        check(D3DCompile(shader,strlen(shader),nullptr,nullptr,nullptr,"vs","vs_5_0",D3DCOMPILE_OPTIMIZATION_LEVEL3,0,&vs,&errors),"vertex compile");
        check(D3DCompile(shader,strlen(shader),nullptr,nullptr,nullptr,"ps","ps_5_0",D3DCOMPILE_OPTIMIZATION_LEVEL3,0,&ps,&errors),"pixel compile");
        check(device->CreateVertexShader(vs->GetBufferPointer(),vs->GetBufferSize(),nullptr,&vertex),"vertex shader");
        check(device->CreatePixelShader(ps->GetBufferPointer(),ps->GetBufferSize(),nullptr,&pixel),"pixel shader");
        D3D11_SAMPLER_DESC sd{}; sd.Filter=D3D11_FILTER_MIN_MAG_MIP_LINEAR;
        sd.AddressU=sd.AddressV=sd.AddressW=D3D11_TEXTURE_ADDRESS_CLAMP; sd.MaxLOD=D3D11_FLOAT32_MAX;
        check(device->CreateSamplerState(&sd,&sampler),"sampler");
        float sizes[4]={float(w),float(h),float(d.ModeDesc.Width)/float(d.ModeDesc.Height),0};
        D3D11_BUFFER_DESC bd{}; bd.ByteWidth=sizeof(sizes); bd.Usage=D3D11_USAGE_IMMUTABLE; bd.BindFlags=D3D11_BIND_CONSTANT_BUFFER;
        D3D11_SUBRESOURCE_DATA initial{sizes,0,0};
        check(device->CreateBuffer(&bd,&initial,&constants),"size constants");
        context->VSSetShader(vertex.Get(),nullptr,0); context->PSSetShader(pixel.Get(),nullptr,0);
        context->PSSetConstantBuffers(0,1,constants.GetAddressOf()); context->PSSetSamplers(0,1,sampler.GetAddressOf());
        context->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
        D3D11_VIEWPORT viewport{0,0,float(w/2),float(h),0,1}; context->RSSetViewports(1,&viewport);
    }
    ~Capture() { if (acquired) duplication->ReleaseFrame(); }
    std::shared_ptr<VideoFrame> next() {
        ComPtr<IDXGIResource> resource; DXGI_OUTDUPL_FRAME_INFO info{};
        HRESULT hr = duplication->AcquireNextFrame(10, &info, &resource);
        if (hr == DXGI_ERROR_WAIT_TIMEOUT) return {};
        check(hr,"AcquireNextFrame"); acquired=true;
        if (!haveImage || info.LastPresentTime.QuadPart != 0) {
            ComPtr<ID3D11Texture2D> texture; check(resource.As(&texture),"desktop texture");
            context->CopyResource(source.Get(),texture.Get()); haveImage=true;
            LARGE_INTEGER f; QueryPerformanceFrequency(&f);
            auto t=info.LastPresentTime.QuadPart;
            imageTime=t ? (t/f.QuadPart)*second+(t%f.QuadPart)*second/f.QuadPart : qpc();
        } else { duplication->ReleaseFrame(); acquired=false; return {}; }
        check(duplication->ReleaseFrame(),"ReleaseFrame"); acquired=false;
        context->OMSetRenderTargets(1,targetView.GetAddressOf(),nullptr);
        context->PSSetShaderResources(0,1,sourceView.GetAddressOf());
        context->Draw(3,0);
        context->CopyResource(staging.Get(),target.Get());
        D3D11_MAPPED_SUBRESOURCE mapped{};
        check(context->Map(staging.Get(),0,D3D11_MAP_READ,0,&mapped),"GPU readback");
        auto frame=std::make_shared<VideoFrame>(); frame->time=imageTime;
        try {
            frame->pixels.resize(size_t(width)*height*2);
            for(int y=0;y<height;++y)
                memcpy(frame->pixels.data()+size_t(y)*width*2,static_cast<uint8_t*>(mapped.pData)+size_t(y)*mapped.RowPitch,size_t(width)*2);
        } catch (...) { context->Unmap(staging.Get(),0); throw; }
        context->Unmap(staging.Get(),0);
        return frame;
    }
};
} // namespace

Desktop::Desktop(int w,int h,int fps,int monitor,int bufferMs): width_(w),height_(h),fps_(fps),monitor_(monitor),
    limit_(size_t((bufferMs+1000)*fps/1000+4)) { thread_=std::thread(&Desktop::run,this); }
Desktop::~Desktop() { quit_=true; if(thread_.joinable()) thread_.join(); }
void Desktop::run() noexcept {
    while(!quit_) {
        try {
            Capture c(width_,height_,monitor_);
            { std::lock_guard guard(mutex_); error_.clear(); }
            Tick next=qpc();
            while(!quit_) {
                Tick now=qpc();
                if(now<next) { Sleep(1); continue; }
                next+=second/fps_;
                if(next<now-100*ms) next=now+second/fps_;
                auto frame=c.next();
                if(frame) {
                    std::lock_guard guard(mutex_);
                    if(frames_.size()>=limit_) { frames_.pop_front(); ++overflows; }
                    frames_.push_back(std::move(frame)); ++captures;
                }
            }
        } catch(const std::exception& e) {
            { std::lock_guard guard(mutex_); error_=e.what(); frames_.clear(); current_.reset(); }
            ++reconnects;
            for(int i=0;i<20 && !quit_;++i) Sleep(50);
        }
    }
}
std::shared_ptr<VideoFrame> Desktop::at(Tick t) {
    std::lock_guard guard(mutex_);
    while(!frames_.empty() && frames_.front()->time<=t) { current_=frames_.front(); frames_.pop_front(); }
    return current_;
}
size_t Desktop::queued() const { std::lock_guard guard(mutex_); return frames_.size(); }
std::string Desktop::error() const { std::lock_guard guard(mutex_); return error_; }
} // namespace a1
