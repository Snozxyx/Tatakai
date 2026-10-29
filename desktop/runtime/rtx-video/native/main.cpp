// Tatakai's isolated Windows x64 RTX Video transport. NVIDIA APIs are supplied
// by the separately acquired official RTX Video SDK, not vendored here.
// This software contains source code provided by NVIDIA Corporation.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <d3d11_4.h>
#include <dxgi1_2.h>
#include <dxgi1_4.h>
#include <wrl/client.h>
#include <io.h>
#include <fcntl.h>
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>
#include <nvsdk_ngx.h>
#include <nvsdk_ngx_helpers_vsr.h>
using Microsoft::WRL::ComPtr;
using json = nlohmann::json;

static void check(HRESULT result, const char* operation) {
    if (FAILED(result)) throw std::runtime_error(std::string(operation) + " failed (" + std::to_string(static_cast<unsigned long>(result)) + ")");
}
static void ngx(NVSDK_NGX_Result result, const char* operation) {
    if (NVSDK_NGX_FAILED(result)) throw std::runtime_error(std::string(operation) + " failed (NGX " + std::to_string(static_cast<unsigned long>(result)) + ")");
}
static void emit(const json& event) { std::cout << event.dump() << '\n' << std::flush; }

class Vsr {
    ComPtr<ID3D11Device> device;
    ComPtr<ID3D11DeviceContext> context;
    ComPtr<IDXGIAdapter3> memoryAdapter;
    NVSDK_NGX_Parameter* parameters = nullptr;
    NVSDK_NGX_Handle* feature = nullptr;
    bool initialized = false;
    ComPtr<ID3D11Texture2D> input;
    ComPtr<ID3D11Texture2D> inferenceOutput;
    UINT iw = 0, ih = 0, ow = 0, oh = 0;
    HANDLE parent = nullptr;
    struct SharedOutput { ComPtr<ID3D11Texture2D> texture; HANDLE local = nullptr; HANDLE remote = nullptr; };
    std::map<std::string, SharedOutput> outstanding;
    void closeOutput(SharedOutput& output) {
        if (output.remote && parent) {
            HANDLE localCopy = nullptr;
            if (DuplicateHandle(parent, output.remote, GetCurrentProcess(), &localCopy, 0, FALSE, DUPLICATE_SAME_ACCESS | DUPLICATE_CLOSE_SOURCE)) CloseHandle(localCopy);
        }
        if (output.local) CloseHandle(output.local);
    }
public:
    std::string adapterName;
    int quality = 2, outputCap = 1080;
    explicit Vsr(DWORD parentPid = 0) {
        ComPtr<IDXGIFactory1> factory;
        check(CreateDXGIFactory1(IID_PPV_ARGS(&factory)), "CreateDXGIFactory");
        ComPtr<IDXGIAdapter1> selected;
        for (UINT index = 0; ; ++index) {
            ComPtr<IDXGIAdapter1> adapter;
            if (factory->EnumAdapters1(index, &adapter) == DXGI_ERROR_NOT_FOUND) break;
            DXGI_ADAPTER_DESC1 desc{}; adapter->GetDesc1(&desc);
            if (desc.VendorId == 0x10de && !(desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE)) { selected = adapter; break; }
        }
        if (!selected) throw std::runtime_error("No NVIDIA hardware adapter found.");
        selected.As(&memoryAdapter);
        DXGI_ADAPTER_DESC1 desc{}; selected->GetDesc1(&desc);
        int length = WideCharToMultiByte(CP_UTF8, 0, desc.Description, -1, nullptr, 0, nullptr, nullptr);
        std::vector<char> name(length); WideCharToMultiByte(CP_UTF8, 0, desc.Description, -1, name.data(), length, nullptr, nullptr); adapterName = name.data();
        D3D_FEATURE_LEVEL level;
        check(D3D11CreateDevice(selected.Get(), D3D_DRIVER_TYPE_UNKNOWN, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION, &device, &level, &context), "D3D11 device");
        wchar_t tempPath[MAX_PATH];
        if (!GetTempPathW(MAX_PATH, tempPath)) throw std::runtime_error("Could not locate writable NVIDIA cache storage.");
        const std::wstring cachePath = std::wstring(tempPath) + L"TatakaiRTX";
        CreateDirectoryW(cachePath.c_str(), nullptr);
        ngx(NVSDK_NGX_D3D11_Init(0, cachePath.c_str(), device.Get()), "NVIDIA initialization"); initialized = true;
        ngx(NVSDK_NGX_D3D11_GetCapabilityParameters(&parameters), "NVIDIA capabilities");
        int available = 0; parameters->Get(NVSDK_NGX_Parameter_VSR_Available, &available);
        if (!available) throw std::runtime_error("RTX Video is unavailable on this GPU/driver. Update the NVIDIA driver.");
        NVSDK_NGX_Feature_Create_Params create{};
        ngx(NGX_D3D11_CREATE_VSR_EXT(context.Get(), &feature, parameters, &create), "RTX Video feature creation");
        if (parentPid) {
            parent = OpenProcess(PROCESS_DUP_HANDLE, FALSE, parentPid);
            if (!parent) throw std::runtime_error("Could not open the Electron texture owner.");
        }
    }
    ~Vsr() {
        for (auto& item : outstanding) closeOutput(item.second);
        outstanding.clear();
        if (parent) CloseHandle(parent);
        if (feature) NVSDK_NGX_D3D11_ReleaseFeature(feature);
        if (parameters) NVSDK_NGX_D3D11_DestroyParameters(parameters);
        if (initialized) NVSDK_NGX_D3D11_Shutdown1(device.Get());
    }
    void release(const std::string& id) {
        auto item = outstanding.find(id);
        if (item != outstanding.end()) { closeOutput(item->second); outstanding.erase(item); }
    }
    json process(const json& message, const std::vector<uint8_t>& bytes) {
        const auto started = std::chrono::steady_clock::now();
        const int width = message.at("width"), height = message.at("height");
        const std::string id = message.at("id");
        if (width <= 0 || width > 1920 || height <= 0 || height > 1080 || bytes.size() != size_t(width) * height * 4) throw std::runtime_error("Invalid input frame.");
        if (outstanding.size() >= 16) throw std::runtime_error("RTX texture consumer is not releasing output frames.");
        const double ratio = std::min(2.0, std::min(double(outputCap) / height, 1920.0 / width));
        const UINT outWidth = std::max(1u, UINT(width * ratio)), outHeight = std::max(1u, UINT(height * ratio));
        if (iw != UINT(width) || ih != UINT(height) || ow != outWidth || oh != outHeight) {
            input.Reset(); inferenceOutput.Reset();
            D3D11_TEXTURE2D_DESC texture{};
            texture.Width = width; texture.Height = height; texture.MipLevels = texture.ArraySize = texture.SampleDesc.Count = 1;
            texture.Format = DXGI_FORMAT_B8G8R8A8_UNORM; texture.Usage = D3D11_USAGE_DEFAULT;
            texture.BindFlags = D3D11_BIND_SHADER_RESOURCE | D3D11_BIND_RENDER_TARGET;
            check(device->CreateTexture2D(&texture, nullptr, &input), "Input texture");
            texture.Width = outWidth; texture.Height = outHeight; texture.BindFlags |= D3D11_BIND_UNORDERED_ACCESS;
            check(device->CreateTexture2D(&texture, nullptr, &inferenceOutput), "Inference texture");
            iw = width; ih = height; ow = outWidth; oh = outHeight;
        }
        context->UpdateSubresource(input.Get(), 0, nullptr, bytes.data(), width * 4, 0);
        NVSDK_NGX_D3D11_VSR_Eval_Params eval{};
        eval.pInput = input.Get(); eval.pOutput = inferenceOutput.Get();
        eval.InputSubrectSize.Width = width; eval.InputSubrectSize.Height = height;
        eval.OutputSubrectSize.Width = ow; eval.OutputSubrectSize.Height = oh;
        eval.QualityLevel = static_cast<NVSDK_NGX_VSR_QualityLevel>(quality);
        ngx(NGX_D3D11_EVALUATE_VSR_EXT(context.Get(), feature, parameters, &eval), "RTX Video processing");
        SharedOutput output;
        D3D11_TEXTURE2D_DESC desc{}; inferenceOutput->GetDesc(&desc);
        desc.BindFlags = D3D11_BIND_SHADER_RESOURCE | D3D11_BIND_RENDER_TARGET;
        desc.MiscFlags = D3D11_RESOURCE_MISC_SHARED_NTHANDLE | D3D11_RESOURCE_MISC_SHARED;
        check(device->CreateTexture2D(&desc, nullptr, &output.texture), "Shared output texture");
        context->CopyResource(output.texture.Get(), inferenceOutput.Get());
        ComPtr<IDXGIResource1> resource; check(output.texture.As(&resource), "Shared resource");
        check(resource->CreateSharedHandle(nullptr, DXGI_SHARED_RESOURCE_READ | DXGI_SHARED_RESOURCE_WRITE, nullptr, &output.local), "Shared handle");
        if (!parent || !DuplicateHandle(GetCurrentProcess(), output.local, parent, &output.remote, 0, FALSE, DUPLICATE_SAME_ACCESS)) { CloseHandle(output.local); throw std::runtime_error("Could not transfer the output texture handle."); }
        const auto remote = reinterpret_cast<uintptr_t>(output.remote);
        outstanding.emplace(id, std::move(output));
        // Ensure producer commands have completed before Chromium imports the texture.
        D3D11_QUERY_DESC queryDesc{D3D11_QUERY_EVENT, 0}; ComPtr<ID3D11Query> fence;
        check(device->CreateQuery(&queryDesc, &fence), "GPU completion query");
        context->End(fence.Get()); context->Flush();
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
        while (context->GetData(fence.Get(), nullptr, 0, 0) == S_FALSE) {
            if (std::chrono::steady_clock::now() > deadline) throw std::runtime_error("RTX GPU work timed out.");
            Sleep(0);
        }
        char handle[32]; snprintf(handle, sizeof(handle), "%llx", static_cast<unsigned long long>(remote));
        DXGI_QUERY_VIDEO_MEMORY_INFO memory{};
        if (memoryAdapter) memoryAdapter->QueryVideoMemoryInfo(0, DXGI_MEMORY_SEGMENT_GROUP_LOCAL, &memory);
        const double elapsed = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started).count();
        return {{"type", "texture"}, {"id", id}, {"width", ow}, {"height", oh}, {"handle", handle}, {"processingMs", elapsed}, {"gpuMemoryBytes", memory.CurrentUsage}};
    }
};

int main(int argc, char** argv) {
    SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
    try {
        if (argc == 2 && std::string(argv[1]) == "--probe") {
            Vsr engine; emit({{"protocol", 1}, {"sdk", "nvidia-rtx-video"}, {"initialized", true}, {"adapter", engine.adapterName}}); return 0;
        }
        if (argc != 4 || std::string(argv[1]) != "--serve" || std::string(argv[2]) != "--parent-pid") throw std::runtime_error("Use --probe or --serve --parent-pid PID.");
        _setmode(_fileno(stdin), _O_BINARY);
        Vsr engine(static_cast<DWORD>(std::stoul(argv[3])));
        for (;;) {
            uint32_t sizes[2];
            if (!std::cin.read(reinterpret_cast<char*>(sizes), sizeof(sizes))) break;
            if (!sizes[0] || sizes[0] > 16384 || sizes[1] > 1920 * 1080 * 4) throw std::runtime_error("Invalid frame packet.");
            std::string header(sizes[0], '\0'); std::vector<uint8_t> pixels(sizes[1]);
            if (!std::cin.read(header.data(), header.size()) || !std::cin.read(reinterpret_cast<char*>(pixels.data()), pixels.size())) throw std::runtime_error("Truncated frame packet.");
            const auto message = json::parse(header); const std::string type = message.at("type");
            if (type == "configure") {
                const std::string quality = message.at("quality");
                if (quality != "light" && quality != "balanced" && quality != "high") throw std::runtime_error("Invalid quality.");
                engine.quality = quality == "light" ? 1 : quality == "high" ? 3 : 2;
                engine.outputCap = message.at("maxOutputHeight");
                if (engine.outputCap < 240 || engine.outputCap > 1080) throw std::runtime_error("Invalid output cap.");
                emit({{"type", "configured"}});
            } else if (type == "frame") emit(engine.process(message, pixels));
            else if (type == "release") engine.release(message.at("id"));
            else if (type == "stop") break;
            else throw std::runtime_error("Unknown command.");
        }
        return 0;
    } catch (const std::exception& error) {
        emit({{"type", "error"}, {"protocol", 1}, {"initialized", false}, {"reason", error.what()}, {"message", error.what()}}); return 1;
    }
}
