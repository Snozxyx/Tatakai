import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export function AIRecommendationBanner() {
    const navigate = useNavigate();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-12"
        >
            <GlassPanel className="p-8 relative overflow-hidden group border-primary/20 bg-gradient-to-r from-primary/10 via-background to-secondary/10">
                {/* Animated background shapes */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-colors" />
                <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-secondary/10 rounded-full blur-3xl group-hover:bg-secondary/20 transition-colors" />

                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex-1 text-center md:text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-bold mb-4">
                            <Sparkles className="w-3 h-3" />
                            NEW: AI RECOMMENDATIONS
                        </div>
                        <h2 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">
                            Looking for your next <span className="text-primary italic">Adventure?</span>
                        </h2>
                        <p className="text-muted-foreground text-lg max-w-xl">
                            Our machine learning engine has analyzed your watch history to find hidden gems you'll absolutely love.
                        </p>
                    </div>

                    <div className="flex flex-col items-center gap-4">
                        <Button
                            size="lg"
                            onClick={() => navigate('/recommendations')}
                            className="px-8 py-6 text-lg font-bold group rounded-2xl glow-primary"
                        >
                            See My Suggestions
                            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Button>
                        <p className="text-xs text-muted-foreground">98.4% Match Accuracy Guaranteed</p>
                    </div>
                </div>
            </GlassPanel>
        </motion.div>
    );
}
