import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Sparkles, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function AIRecommendationBanner() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-background via-muted/20 to-primary/5 p-6 md:p-8 lg:p-10 shadow-sm transition-colors hover:border-primary/20">
            {/* Soft, elegant background lighting (No harsh blobs) */}
            <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between md:gap-8">
                
                {/* Text Content */}
                <div className="flex-1 space-y-4">
                    {/* Modern, subdued badge */}
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>{t('discover.tailoredForYou')}</span>
                    </div>
                    
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl lg:text-4xl">
                            {t('discover.discoverPrefix')} <span className="text-primary">{t('discover.favoriteSeries')}</span>
                        </h2>
                        <p className="max-w-2xl text-base text-muted-foreground md:text-lg leading-relaxed">
                            {t('discover.discoverDescription')}
                        </p>
                    </div>
                </div>

                {/* Call to Action */}
                <div className="flex w-full shrink-0 flex-col items-center gap-3 md:w-auto md:items-end">
                    <Button
                        size="lg"
                        onClick={() => navigate('/recommendations')}
                        className="group h-12 w-full md:w-auto rounded-xl bg-primary px-8 text-base font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary/90 hover:ring-4 hover:ring-primary/20 shadow-sm"
                    >
                        {t('discover.viewSuggestions')}
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-1" />
                    </Button>
                    <p className="text-[11px] font-medium text-muted-foreground/70 tracking-wider uppercase">
                        {t('discover.updatesAsYouWatch')}
                    </p>
                </div>
            </div>
        </div>
    );
}