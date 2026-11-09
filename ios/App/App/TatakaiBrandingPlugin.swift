import Capacitor
import Foundation
import UIKit

@objc(TatakaiBrandingPlugin)
public final class TatakaiBrandingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TatakaiBrandingPlugin"
    public let jsName = "TatakaiBranding"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSelection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSelection", returnType: CAPPluginReturnPromise)
    ]
    private let names = ["light": "AppIconLight", "dark": "AppIconDark", "monochrome": "AppIconMonochrome", "legacy": "AppIconLegacy"]
    private var changing = false
    private func response(success: Bool = true) -> [String: Any] {
        let alternate = UIApplication.shared.alternateIconName
        let variant = names.first(where: { $0.value == alternate })?.key ?? (traitCollection.userInterfaceStyle == .dark ? "dark" : "light")
        let mode = alternate == nil ? "auto" : (names.first(where: { $0.value == alternate })?.key ?? "auto")
        return ["success": success, "mode": mode, "variant": variant]
    }
    private var traitCollection: UITraitCollection { bridge?.viewController?.traitCollection ?? UIScreen.main.traitCollection }
    @objc func getCapabilities(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["success": true, "supported": UIApplication.shared.supportsAlternateIcons, "platform": "ios", "automatic": false,
                "limitations": ["customization.launcherIos"]])
        }
    }
    @objc func getSelection(_ call: CAPPluginCall) { DispatchQueue.main.async { call.resolve(self.response()) } }
    @objc func setSelection(_ call: CAPPluginCall) {
        let mode = call.getString("mode") ?? "auto"
        guard mode == "auto" || names[mode] != nil else { call.reject("Choose a supported Tatakai icon", "INVALID_ICON"); return }
        DispatchQueue.main.async {
            guard !self.changing else { call.reject("An icon change is already running", "BUSY"); return }
            guard UIApplication.shared.supportsAlternateIcons else { call.reject("Alternate app icons are unavailable", "UNAVAILABLE"); return }
            let name = mode == "auto" ? nil : self.names[mode]
            if UIApplication.shared.alternateIconName == name { call.resolve(self.response()); return }
            self.changing = true
            UIApplication.shared.setAlternateIconName(name) { error in
                DispatchQueue.main.async {
                    self.changing = false
                    var result = self.response(success: error == nil)
                    if let error { result["error"] = error.localizedDescription }
                    if error == nil { UserDefaults.standard.set(mode, forKey: "tatakai_branding_mode") }
                    call.resolve(result)
                }
            }
        }
    }
}
