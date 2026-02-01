import { Smartphone, Monitor, Download, Zap, Shield, Globe } from "lucide-react";
import { GlassPanel } from "../ui/GlassPanel";
import { Button } from "../ui/button";

export const AppDownloadSection = () => {
    return (
        <section className="relative py-24 px-6 overflow-hidden">
            {/* Background Decorative Elements */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[120px] -z-10" />

            <div className="max-w-[1200px] mx-auto">
                <div className="text-center mb-16 space-y-4">
                    <h2 className="text-4xl md:text-6xl font-bold font-display tracking-tight">
                        Watch Anywhere, <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">Anytime.</span>
                    </h2>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                        Experience Tatakai at its full potential. Download our native apps for a smoother experience,
                        offline viewing, and Discord integration.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8 mb-16">
                    {/* Mobile App */}
                    <GlassPanel className="p-8 group hover:border-primary/50 transition-all duration-500">
                        <div className="flex items-start gap-6">
                            <div className="p-4 rounded-2xl bg-primary/20 text-primary group-hover:scale-110 transition-transform">
                                <Smartphone className="w-10 h-10" />
                            </div>
                            <div className="space-y-4 flex-1">
                                <h3 className="text-2xl font-bold">Mobile App</h3>
                                <p className="text-muted-foreground">
                                    Available for Android and iOS. Built for portability with background downloads and push notifications.
                                </p>
                                <div className="flex flex-wrap gap-3 pt-2">
                                    <Button variant="outline" className="rounded-full gap-2">
                                        <Download className="w-4 h-4" /> Android
                                    </Button>
                                    <Button variant="outline" className="rounded-full gap-2">
                                        <Download className="w-4 h-4" /> iOS
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </GlassPanel>

                    {/* Desktop App */}
                    <GlassPanel className="p-8 group hover:border-purple-500/50 transition-all duration-500">
                        <div className="flex items-start gap-6">
                            <div className="p-4 rounded-2xl bg-purple-500/20 text-purple-400 group-hover:scale-110 transition-transform">
                                <Monitor className="w-10 h-10" />
                            </div>
                            <div className="space-y-4 flex-1">
                                <h3 className="text-2xl font-bold">Desktop App</h3>
                                <p className="text-muted-foreground">
                                    For Windows, Mac, and Linux. Featuring Advanced Discord RPC and high-speed MP4 downloads.
                                </p>
                                <div className="flex flex-wrap gap-3 pt-2">
                                    <Button className="rounded-full gap-2 glow-primary">
                                        <Download className="w-4 h-4" /> Download for Desktop
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </GlassPanel>
                </div>

                {/* Feature Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {[
                        { icon: <Zap className="w-5 h-5" />, title: "Ultra Fast", desc: "Native Performance" },
                        { icon: <Download className="w-5 h-5" />, title: "Offline", desc: "MP4 Support" },
                        { icon: <Shield className="w-5 h-5" />, title: "Secure", desc: "No Trackers" },
                        { icon: <Globe className="w-5 h-5" />, title: "RPC", desc: "Discord Rich Presence" },
                    ].map((feature, i) => (
                        <div key={i} className="text-center space-y-2">
                            <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                {feature.icon}
                            </div>
                            <h4 className="font-bold text-sm">{feature.title}</h4>
                            <p className="text-xs text-muted-foreground">{feature.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
