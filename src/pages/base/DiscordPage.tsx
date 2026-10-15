import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import {
  ArrowLeft, ExternalLink, Shield, Star, Zap, Trophy,
  Swords, Sparkles, BookOpen, Dices, MessageSquare, Bot,
  Crown, Heart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';

/* ─── Bot Links ──────────────────────────────────────────────────────── */
const BOT_INVITE_URL  = 'https://discord.com/oauth2/authorize?client_id=1465759908363530370&permissions=8&scope=bot%20applications.commands';
const SUPPORT_URL     = 'https://dsc.gg/tatakai';

/* ─── Feature cards ──────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: <Sparkles className="w-5 h-5" />,
    get title() { return uiI18n.t('app.gacha_system_4a50b88e'); },
    desc:  'Pull anime characters across 6 rarity tiers. Build your dream collection with banners, pity, and fusion.',
    color: 'text-yellow-400',
    bg:    'bg-yellow-400/10 border-yellow-400/20',
  },
  {
    icon: <Swords className="w-5 h-5" />,
    get title() { return uiI18n.t('app.1v1_pvp_battles_badaa7f1'); },
    desc:  'Challenge others to turn-based fights using your gacha characters. Earn coins and climb ranks.',
    color: 'text-red-400',
    bg:    'bg-red-400/10 border-red-400/20',
  },
  {
    icon: <BookOpen className="w-5 h-5" />,
    get title() { return uiI18n.t('app.solo_rpg_story_6162e203'); },
    desc:  'Play through 5 chapters of anime-inspired solo adventure with boss fights and loot.',
    color: 'text-sky-400',
    bg:    'bg-sky-400/10 border-sky-400/20',
  },
  {
    icon: <Trophy className="w-5 h-5" />,
    get title() { return uiI18n.t('app.economy_leveling_1dc7063d'); },
    desc:  'Earn XP, coins, and gems. Daily rewards, streaks, a shop, gambling, and server leaderboards.',
    color: 'text-emerald-400',
    bg:    'bg-emerald-400/10 border-emerald-400/20',
  },
  {
    icon: <Dices className="w-5 h-5" />,
    get title() { return uiI18n.t('app.quiz_mini_games_5bbe1f4f'); },
    desc:  'Anime trivia, daily fortune, smash/pass, waifu wars, and more fun commands.',
    color: 'text-violet-400',
    bg:    'bg-violet-400/10 border-violet-400/20',
  },
  {
    icon: <Star className="w-5 h-5" />,
    get title() { return uiI18n.t('app.anime_search_0c5dd10d'); },
    desc:  'Look up any anime or character with rich embeds. Direct links to open on Tatakai.',
    color: 'text-orange-400',
    bg:    'bg-orange-400/10 border-orange-400/20',
  },
  {
    icon: <Shield className="w-5 h-5" />,
    get title() { return uiI18n.t('app.moderation_suite_bf7ff893'); },
    desc:  'Anti-spam, anti-link, warnings with auto-action, seal/exile/imprison — themed mod tools.',
    color: 'text-rose-400',
    bg:    'bg-rose-400/10 border-rose-400/20',
  },
  {
    icon: <Zap className="w-5 h-5" />,
    get title() { return uiI18n.t('app.per_server_settings_b99dcc9a'); },
    desc:  'Toggle features per guild — welcome messages, auto-roles, log channels, and more.',
    color: 'text-cyan-400',
    bg:    'bg-cyan-400/10 border-cyan-400/20',
  },
];

/* ─── Slash commands showcase ────────────────────────────────────────── */
const COMMANDS = [
  { name: '/anime search',   desc: 'Look up any anime with rich info' },
  { name: '/gacha pull',     desc: 'Pull a random anime character' },
  { name: '/battle challenge', desc: 'Challenge someone to PvP' },
  { name: '/economy daily',  desc: 'Claim daily coins & gems' },
  { name: '/story play',     desc: 'Continue your solo RPG adventure' },
  { name: '/quiz play',      desc: 'Anime trivia with coin rewards' },
  { name: '/fortune',        desc: 'Daily anime-themed fortune' },
  { name: '/smashpass',      desc: 'Vote on anime characters' },
  { name: '/mod seal',       desc: 'Kick a user (Tatakai-style)' },
  { name: '/settings view',  desc: 'View guild configuration' },
];

export default function DiscordPage() {
  useUiTranslation();
  const navigate = useNavigate();
  const isDesktopApp = useIsDesktopApp();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className={`relative z-10 ${isDesktopApp ? 'pl-6' : 'pl-6 md:pl-32'} pr-6 py-6 max-w-[1100px] mx-auto pb-28 md:pb-8`}>

        {/* ─── Back ──────────────────────────────────────────────────── */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          {uiI18n.t('app.back_b52b36b7')}
        </button>

        {/* ─── Hero ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative rounded-2xl overflow-hidden mb-8 border border-white/5"
        >
          {/* blurry gradient bg */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#5865F2]/20 via-background to-violet-900/10 pointer-events-none" />
          {/* grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,.4) 1px,transparent 1px),' +
                'linear-gradient(90deg,rgba(255,255,255,.4) 1px,transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />

          <div className="relative px-8 py-12 flex flex-col md:flex-row items-center gap-8">
            {/* Bot avatar */}
            <div className="flex-shrink-0 w-24 h-24 rounded-2xl bg-gradient-to-br from-[#5865F2] to-violet-600 flex items-center justify-center shadow-2xl shadow-[#5865F2]/30">
              <Bot className="w-12 h-12 text-white" />
            </div>

            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                <h1 className="text-3xl md:text-4xl font-black tracking-tight">
                  {uiI18n.t('app.tatakai_bot_b9c08690')}
                </h1>
                <Badge className="bg-[#5865F2]/20 text-[#7289DA] border-[#5865F2]/30 text-xs">
                  v3.0
                </Badge>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {uiI18n.t('app.online_c3e839df')}
                </Badge>
              </div>
              <p className="text-muted-foreground text-base max-w-xl">
                {uiI18n.t('app.the_ultimate_anime_discord_bot_gacha_pulls_pvp_b_1f97985e')}
              </p>

              {/* Quick stats */}
              <div className="flex items-center justify-center md:justify-start gap-6 mt-4 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <MessageSquare className="w-4 h-4 text-[#5865F2]" />
                  <span className="font-semibold text-foreground">30+</span>
                  <span className="text-muted-foreground">{uiI18n.t('app.slash_commands_0711b3e7')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Crown className="w-4 h-4 text-yellow-400" />
                  <span className="font-semibold text-foreground">28</span>
                  <span className="text-muted-foreground">{uiI18n.t('app.collectible_characters_a10adb75')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Heart className="w-4 h-4 text-rose-400" />
                  <span className="font-semibold text-foreground">{uiI18n.t('app.free_75f52718')}</span>
                  <span className="text-muted-foreground">{uiI18n.t('app.forever_e07f8c4a')}</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="flex flex-col gap-3 items-center">
              <Button
                asChild
                size="lg"
                className="bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold px-8 shadow-lg shadow-[#5865F2]/25 transition-all duration-200 hover:scale-[1.03]"
              >
                <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {uiI18n.t('app.add_to_server_18f4104f')}
                </a>
              </Button>

              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <MessageSquare className="w-3 h-3" />
                {uiI18n.t('app.support_server_3a8e4f04')}
              </a>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ─── Commands Preview ────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-1 rounded-2xl border border-white/5 bg-white/[0.02] p-5"
          >
            <h2 className="font-bold flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-yellow-400" />
              {uiI18n.t('app.popular_commands_4ec222fd')}
            </h2>

            <div className="space-y-2">
              {COMMANDS.map((cmd) => (
                <div
                  key={cmd.name}
                  className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2.5 hover:bg-white/[0.05] transition-colors"
                >
                  <p className="text-sm font-mono font-semibold text-[#7289DA]">{cmd.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{cmd.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ─── Features ───────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="lg:col-span-2"
          >
            <h2 className="font-bold mb-4 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" />
              {uiI18n.t('app.features_fc338f87')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className={cn(
                    'rounded-xl border p-4 flex gap-3 transition-colors hover:bg-white/[0.03]',
                    f.bg
                  )}
                >
                  <div className={cn('mt-0.5 flex-shrink-0', f.color)}>{f.icon}</div>
                  <div>
                    <p className="font-semibold text-sm mb-0.5">{f.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Invite CTA banner ─── */}
            <div className="mt-5 rounded-xl bg-[#5865F2]/10 border border-[#5865F2]/20 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="font-bold">{uiI18n.t('app.ready_to_power_up_your_server_9c1f8995')}</p>
                <p className="text-sm text-muted-foreground">
                  {uiI18n.t('app.add_tatakai_bot_and_unlock_the_full_anime_experi_dd1a9f1f')}
                </p>
              </div>
              <Button
                asChild
                className="bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold flex-shrink-0"
              >
                <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {uiI18n.t('app.add_tatakai_bot_eb7bb7bf')}
                </a>
              </Button>
            </div>
          </motion.div>

        </div>
      </main>

      <MobileNav />
    </div>
  );
}
