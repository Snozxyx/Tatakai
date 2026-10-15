import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Ban, ShieldX, Mail, AlertTriangle, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { StatusVideoBackground } from "@/components/layout/StatusVideoBackground";

const BannedPage = () => {
  useUiTranslation();
  const { t } = useTranslation();
  const { banReason, signOut, user, profile } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 overflow-hidden relative bg-gradient-to-br from-red-950/30 via-background to-background">
      <StatusVideoBackground overlayColor="from-destructive/20 via-background/90 to-background" />

      {/* Japanese decorative elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Large background kanji */}
        <motion.div
          className="absolute top-[5%] left-[5%] text-[12rem] font-bold text-red-500/[0.03] select-none leading-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2 }}
        >
          禁
        </motion.div>
        <motion.div
          className="absolute bottom-[5%] right-[5%] text-[12rem] font-bold text-red-500/[0.03] select-none leading-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2, delay: 0.5 }}
        >
          止
        </motion.div>

        {/* Ink brush stroke effect */}
        <motion.div
          className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/20 to-transparent"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.5, delay: 0.3 }}
        />

        {/* Corner seal marks */}
        <div className="absolute top-4 left-4 w-16 h-16 border-2 border-red-500/20 rounded-full flex items-center justify-center">
          <span className="text-red-500/30 text-2xl font-bold">禁</span>
        </div>
        <div className="absolute top-4 right-4 w-16 h-16 border-2 border-red-500/20 rounded-full flex items-center justify-center">
          <span className="text-red-500/30 text-2xl font-bold rotate-12">印</span>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="border-red-500/30 bg-black/40 backdrop-blur-xl shadow-2xl shadow-red-500/10 overflow-hidden">
          {/* Top decorative bar */}
          <div className="h-1 bg-gradient-to-r from-red-600 via-red-500 to-red-600" />

          <CardContent className="pt-8 pb-8 text-center">
            {/* Ban icon with animation */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              className="mb-6 inline-flex flex-col items-center"
            >
              <div className="relative">
                <div className="w-24 h-24 bg-gradient-to-br from-red-500/20 to-red-600/20 rounded-full flex items-center justify-center">
                  <ShieldX className="w-12 h-12 text-red-500" />
                </div>
                <motion.div
                  className="absolute -top-1 -right-1"
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
                >
                  <Ban className="w-8 h-8 text-red-500" />
                </motion.div>
              </div>

              {/* Japanese text */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-4 text-3xl font-bold text-red-500/60 tracking-[0.2em]"
              >
                禁止
              </motion.p>
              <p className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">{uiI18n.t('app.kinshi_prohibited_04a25423')}</p>
            </motion.div>

            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h1 className="text-2xl md:text-3xl font-display font-bold text-destructive mb-2">
                {t('errors.accountSuspended')}
              </h1>
              <p className="text-muted-foreground">
                {t('errors.accessRestricted')}
              </p>
            </motion.div>

            {/* User info box */}
            {(user || profile) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-4 p-3 bg-red-500/5 border border-red-500/20 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <User className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-foreground">{profile?.display_name || uiI18n.t('app.user_9f8a2389')}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <div className="ml-auto">
                    <span className="px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-bold tracking-wider">
                      禁止
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Reason box */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg"
            >
              <div className="flex items-start gap-3 text-left">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1 flex items-center gap-2">
                    <span className="text-red-400/60 text-xs">理由:</span>
                    {t('errors.suspensionReason')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {banReason || t('errors.defaultBanReason')}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Ban details */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="mt-6 grid grid-cols-2 gap-4 text-sm"
            >
              <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3">
                <p className="text-muted-foreground text-xs mb-1">ステータス</p>
                <p className="font-semibold text-red-400">{t('errors.permanent')}</p>
              </div>
              <div className="bg-muted/50 border border-border/50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs mb-1">日付</p>
                <p className="font-semibold text-foreground">{new Date().toLocaleDateString(uiI18n.language)}</p>
              </div>
            </motion.div>

            {/* Appeal section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="mt-8 space-y-4"
            >
              <p className="text-sm text-muted-foreground">
                <span className="text-red-400/60 mr-1">異議申し立て:</span>
                {uiI18n.t('app.if_you_believe_this_is_a_mistake_you_can_submit__a60feaaa')}
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full gap-2 border-red-500/30 hover:bg-red-500/10 text-red-400 hover:text-red-300"
                  onClick={() => window.open('mailto:appeals@example.com?subject=Ban Appeal')}
                >
                  <Mail className="w-5 h-5" />
                  {uiI18n.t('app.submit_appeal_ab84630e')}
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full text-muted-foreground hover:text-foreground"
                  onClick={() => signOut()}
                >
                  {uiI18n.t('app.sign_out_61fd08ff')}
                </Button>
              </div>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default BannedPage;
