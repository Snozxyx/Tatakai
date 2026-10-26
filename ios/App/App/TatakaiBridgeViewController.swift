import Capacitor

final class TatakaiBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(TatakaiLocalProxyPlugin())
        bridge?.registerPluginInstance(TatakaiExtensionHttpPlugin())
        bridge?.registerPluginInstance(TatakaiDownloadsPlugin())
        // HLS → MP4 remux for offline downloads (AVFoundation passthrough —
        // the iOS counterpart to desktop ffmpeg and Android TatakaiMux).
        bridge?.registerPluginInstance(TatakaiMuxPlugin())
        bridge?.registerPluginInstance(TatakaiMediaPlugin())
    }
}
