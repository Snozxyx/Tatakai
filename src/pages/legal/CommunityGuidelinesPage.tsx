import { useNavigate } from "react-router-dom";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Users, AlertTriangle } from "lucide-react";
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';

type RuleSection = {
  id: string;
  n: number;
  title: string;
  tagline: string;
  intro?: string;
  notAllowed?: string[];
  fine?: string[];
  zeroTolerance?: string;
};

const RULES: RuleSection[] = [
  {
    id: 'respect',
    n: 1,
    title: 'Be respectful',
    tagline: 'Disagree with the take, not the person.',
    intro: `Arguing about anime and manga is the point of this place. Insulting or targeting the people you're arguing with is not.`,
    notAllowed: [
      `Insults, name-calling and personal attacks, including "jokes" at someone's expense that they clearly aren't in on.`,
      `Telling anyone to hurt or kill themselves, in any phrasing or abbreviation. It is never banter.`,
      `Sexual remarks directed at another user.`,
      `Following someone around the site to dunk on or downvote everything they post.`,
      `Dogpiling: rallying others to pile onto a user, their comments, or their profile.`,
      `Callout posts or polls about a named user, guilty or not. Report rule breaks; don't hold a public trial.`,
      `Dragging real-world politics or religion into the comments to start a fight.`,
    ],
    fine: [
      `Blunt criticism of a series, an episode, a chapter, a translation, or an opinion.`,
      `Heated arguments, as long as they stay about the argument.`,
    ],
  },
  {
    id: 'hate',
    n: 2,
    title: 'No hate speech',
    tagline: `What matters is what you're doing with the word, not that the word exists.`,
    intro: `Slurs used to harass someone or to push prejudice are not allowed anywhere: comments, posts, images, GIFs, usernames, bios, and the names of your lists, tier lists, and communities.`,
    notAllowed: [
      `Using a slur at someone, or about a group, in any spelling, language, or abbreviation. Censoring letters or putting it in an image doesn't change what you meant.`,
      `Slurs as casual filler or a general-purpose insult, even with nobody specific in mind.`,
      `Hateful "jokes" of any flavor, including praising hate figures or downplaying atrocities.`,
      `Attacking someone over their race, religion, gender, sexuality, disability, or nationality.`,
      `Posting hate symbols, or images and GIFs that carry the same message.`,
    ],
    fine: [
      `Lyrics, quotes, and other cultural references. We're not policing every use of a word.`,
      `Discussing a slur used in the anime or manga itself, or its history.`,
    ],
  },
  {
    id: 'sfw',
    n: 3,
    title: 'Keep it safe for work',
    tagline: 'Match the space you’re in. The 18+ gate exists; everything outside it stays SFW.',
    intro: `Adult series sit behind the 18+ content setting, and discussing them frankly there is fine. Everything outside that gate is a SFW space. Anything attached to your identity stays SFW everywhere, because avatars and usernames follow you around the site.`,
    notAllowed: [
      `Posting pornographic or sexually explicit images, GIFs, or text outside the 18+ areas.`,
      `Explicit fan fiction and graphic sexual scenarios outside the 18+ areas.`,
      `NSFW avatars, banners, bios, and usernames anywhere.`,
      `Explicit names or descriptions on public lists, tier lists, and communities. Collect what you want; the label everyone sees stays SFW.`,
    ],
    fine: [
      `Frank discussion of an adult series in its own comment section. That's what the gate is for.`,
    ],
    zeroTolerance: `Sexualizing minors, real or fictional, is an instant permanent ban. "She's actually 500 years old" will not save you.`,
  },
  {
    id: 'spoilers',
    n: 4,
    title: 'Tag your spoilers',
    tagline: 'Use the spoiler tag. It exists so everyone can read and watch at their own pace.',
    intro: `If you've read or watched ahead in the source material, good for you. The comments under episode 12 are for episode 12.`,
    notAllowed: [
      `Untagged spoilers for the current series, including events the adaptation hasn't reached yet.`,
      `Spoilers in post titles, where tags can't hide them.`,
      `Spoilers for other series nobody asked about.`,
      `Spoiling on purpose to upset people, or harassing someone who tagged their spoiler correctly.`,
    ],
    fine: [
      `Discussing anything, however major, behind a spoiler tag.`,
      `Theories and guesses. Tag them if they're informed by the source material.`,
    ],
  },
  {
    id: 'spam',
    n: 5,
    title: `Don't spam`,
    tagline: 'One good comment beats twenty copy-pasted ones.',
    intro: `Comment sections live and die by signal to noise. Flooding them with the same message, meme chains, or machine-generated filler buries the actual discussion.`,
    notAllowed: [
      `Posting the same comment, GIF, or copypasta across many episodes, chapters, or series.`,
      `Coordinated comment chains that flood a section with the same message.`,
      `"First", single-emoji chains, and other filler posted just for visibility or reputation.`,
      `AI-generated comments, reviews, and posts. We want your take, not a chatbot's.`,
      `Flooding the forums with thread after thread, or the polls with poll after poll.`,
      `Ping lists: mass-mentioning a wall of users under a post. Tagging a couple of friends is fine; a 60-mention copy-paste is not.`,
      `Reposting anything a moderator removed. Removed means removed.`,
    ],
    fine: [
      `A lively back-and-forth in a busy thread. Activity isn't spam; mindless duplication is.`,
    ],
  },
  {
    id: 'advertising',
    n: 6,
    title: `No advertising`,
    tagline: `Don't use Tatakai to promote your stuff, or anyone else's.`,
    intro: `This applies to comments, forums, profiles, lists, and communities. If the point of a post is to send people somewhere else or make money, it doesn't belong here.`,
    notAllowed: [
      `Promoting or linking other streaming or reading sites and apps, including "it's already up on ___".`,
      `Advertising Discord servers, games, products, or services, including sneaking plugs into otherwise normal comments.`,
      `Self-promoting your channel, site, or project without staff permission.`,
      `Asking users for money, donations, or off-platform contact.`,
      `Scam, phishing, or otherwise malicious links. These get a ban, not a warning.`,
    ],
    fine: [
      `Recommending series that are on Tatakai, including your own watch lists and playlists.`,
      `The social links on your profile. That's what the field is for.`,
    ],
  },
  {
    id: 'reputation',
    n: 7,
    title: `Don't farm reputation`,
    tagline: `Reputation measures whether people liked your contribution, not how hard you grinded for it.`,
    intro: `Earn likes and reactions by being funny, insightful, or helpful. The moment you start engineering them it's farming, and farmed reputation gets wiped.`,
    notAllowed: [
      `Begging for likes ("nice episode, like me pls"), like-for-like trades, and fishing for reactions.`,
      `Boosting yourself with alt accounts, or groups that like each other on schedule.`,
      `Buying or selling likes, follows, or accounts.`,
      `Follow-for-follow threads, chains, and bios. "I follow back" is still farming.`,
      `Low-effort bait posted purely to harvest reactions. Ragebait counts even if you don't care about the score.`,
      `Mass-following hundreds of accounts hoping for follow-backs. Every follow pings a real person.`,
      `Posting rep-farming guides or methods. "For educational purposes" changes nothing.`,
    ],
    fine: [
      `Popular comments earning lots of reactions. That's the system working.`,
      `Joking about rep farming. Just don't actually do it.`,
    ],
  },
  {
    id: 'votes',
    n: 8,
    title: `Don't weaponize votes`,
    tagline: `The downvote and report buttons are for bad contributions, not for people you dislike.`,
    intro: `Reacting to a comment you think is bad is the button working. Turning it on a person is what this rule is about, and votes cast that way get reversed.`,
    notAllowed: [
      `Mass-downvoting a user's history because of who they are or one argument you had.`,
      `Creating accounts whose main activity is downvoting someone.`,
      `Brigading: coordinating with others, on or off the site, to vote anything up or down.`,
      `Scripted or automated voting of any kind.`,
      `Nuking ratings: mass low-rating series you obviously haven't watched or read, or rating a series down over an adaptation, a hiatus, or anything that isn't the series itself.`,
      `Gaming the top review slot by pumping your own review with alts or burying rivals.`,
      `Mass-reporting people you don't like, or filing false reports to get someone banned. Reports are for rule breaks, not for winning arguments.`,
    ],
  },
  {
    id: 'accounts',
    n: 9,
    title: 'One person, one account',
    tagline: 'Alt accounts used to break any other rule make it worse, not safer.',
    intro: `Having a second account isn't a crime by itself. Using one to manipulate the site is.`,
    notAllowed: [
      `Alts for voting, rep farming, evading blocks, or dodging rate limits.`,
      `Creating a new account to get around a ban. It resets nothing and extends everything.`,
      `Bot accounts.`,
    ],
    fine: [
      `A separate account for your adult reading or watching. Keep it away from votes, reputation, and everything else on this list.`,
    ],
  },
  {
    id: 'privacy',
    n: 10,
    title: 'Respect privacy, yours and theirs',
    tagline: `If it isn't yours to share, don't post it.`,
    notAllowed: [
      `Posting anyone's personal information: name, face, location, socials, private conversations, anything.`,
      `Sharing someone's private content without their consent.`,
      `Impersonating other users or Tatakai staff, "as a joke" included. Usernames posing as staff, the site, or another user get reset.`,
      `Fishing for a stranger's age, photos, or socials, or pushing someone off the site. If they might be a minor, this goes straight to a ban.`,
    ],
    zeroTolerance: `Doxxing or deliberately endangering another user is an instant permanent ban.`,
  },
];

export default function CommunityGuidelinesPage() {
  const navigate = useNavigate();
  const isDesktopApp = useIsDesktopApp();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className={`relative z-10 ${isDesktopApp ? 'pl-6' : 'pl-6 md:pl-32'} pr-6 py-6 max-w-[1000px] mx-auto pb-24 md:pb-6`}>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>

        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2 flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            Community Guidelines
          </h1>
          <p className="text-muted-foreground">Last updated: September 28, 2026</p>
        </div>

        <Card className="mb-6">
          <CardContent className="space-y-4 pt-6">
            <p>
              Tatakai is a community-driven, extension-based otaku platform. These rules exist so the comments stay worth reading and everyone can enjoy them. They apply everywhere: comments, forums, reviews, polls, community walls, playlists, tier lists, and your profile.
            </p>
            <p>
              In practice, using Tatakai normally and being cordial with the people around you is enough. Read, watch, comment, and argue about episodes and chapters — none of this will ever come up. The list below is long because it's specific, not because the bar is high.
            </p>
            <p className="font-semibold text-foreground">
              By posting your first comment or post, you confirm you've read and agree to these guidelines.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader><CardTitle className="text-base">On this page</CardTitle></CardHeader>
          <CardContent>
            <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1 list-none">
              {RULES.map((r) => (
                <li key={r.id}>
                  <a href={`#${r.id}`} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    {String(r.n).padStart(2, '0')}&nbsp;&nbsp;{r.title}
                  </a>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <div className="space-y-6">
          {RULES.map((r) => (
            <Card key={r.id} id={r.id} className="scroll-mt-24">
              <CardHeader>
                <CardTitle>{r.n}. {r.title}</CardTitle>
                <p className="text-sm text-muted-foreground font-normal mt-1">{r.tagline}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {r.intro && <p>{r.intro}</p>}
                {r.notAllowed?.length ? (
                  <div>
                    <p className="text-sm font-semibold text-red-400 mb-2">Not allowed</p>
                    <ul className="list-disc list-inside space-y-2 ml-4 text-muted-foreground">
                      {r.notAllowed.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                ) : null}
                {r.fine?.length ? (
                  <div>
                    <p className="text-sm font-semibold text-emerald-400 mb-2">Totally fine</p>
                    <ul className="list-disc list-inside space-y-2 ml-4 text-muted-foreground">
                      {r.fine.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                ) : null}
                {r.zeroTolerance && (
                  <div className="flex items-start gap-3 p-4 rounded-lg border border-red-500/30 bg-red-500/10">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm">
                      <span className="font-semibold text-red-400">Zero tolerance:</span> {r.zeroTolerance}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          <Card id="reporting" className="scroll-mt-24">
            <CardHeader><CardTitle>Reporting</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p>
                See something that breaks these rules? Report it. Every report gets reviewed by a moderator. Pick the reason that actually fits and add details for anything unusual — a clear report gets handled faster. Don't report content just because you disagree with it, and don't organize report campaigns against users. Deliberately false reports are themselves a violation.
              </p>
            </CardContent>
          </Card>

          <Card id="enforcement" className="scroll-mt-24">
            <CardHeader><CardTitle>Enforcement</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p>
                Moderators may remove content, purge votes and farmed reputation, reset usernames and profile content, restrict features, and warn or ban accounts at their discretion. Most first offenses get a removal and a warning. Warnings stack, and enough of them turn into a ban on their own; the worst offenses skip straight there. Vote manipulation gets reversed retroactively, so cheated reputation and review rankings don't survive the cleanup. Bans extend to alt accounts.
              </p>
              <p>
                These guidelines can't list everything. Anything done with the intent to manipulate, harm, or abuse the community, its members, or the platform is not allowed, and reasonable judgement decides the rest. If you think a moderation action was a mistake, or you're unsure whether something is okay to post, ask us on Discord.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
