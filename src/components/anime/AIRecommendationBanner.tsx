import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from '@/contexts/AuthContext';

export function AIRecommendationBanner() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();

    return (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 md:p-8 transition-colors hover:border-foreground/20">

            <div className="relative z-10 flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between md:gap-8">
                
                {/* Text Content */}
                <div className="flex-1 space-y-4">
                    {/* Modern, subdued badge */}
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        <span>{t(user ? 'discover.tailoredForYou' : 'discover.suggestionsLabel')}</span>
                    </div>
                    
                    <div className="space-y-2">
                        <h2 className="text-2xl font-medium tracking-tight text-foreground md:text-3xl lg:text-4xl">
                            {t('discover.nextStory')}
                        </h2>
                        <p className="max-w-2xl text-base text-muted-foreground md:text-lg leading-relaxed">
                            {t(user ? 'discover.discoverDescription' : 'discover.guestDescription')}
                        </p>
                    </div>
                </div>

                {/* Call to Action */}
                <div className="flex w-full shrink-0 flex-col items-center gap-3 md:w-auto md:items-end">
                    <Button
                        size="lg"
                        onClick={() => navigate('/recommendations')}
                        className="group h-12 w-full md:w-auto rounded-xl bg-primary px-8 text-base font-medium text-primary-foreground transition-[color,background-color,border-color,opacity] duration-200 hover:bg-primary/90   shadow-sm"
                    >
                        {t('discover.viewSuggestions')}
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-1" />
                    </Button>
                    {user && <p className="text-xs text-muted-foreground">
                        {t('discover.updatesAsYouWatch')}
                    </p>}
                </div>
            </div>
        </div>
    );
}
