/** Eligibility is evaluated by the database; these rules explain the requirements. */
export const BADGE_EARN_RULES = {
  "centurion": {
    "metric": "episodes",
    "threshold": 100
  },
  "millennium": {
    "metric": "episodes",
    "threshold": 1000
  },
  "explorer": {
    "metric": "distinct_anime",
    "threshold": 50
  },
  "reputation": {
    "metric": "community_likes",
    "threshold": 20
  },
  "harem": {
    "metric": "harem",
    "threshold": 5
  },
  "action": {
    "metric": "action",
    "threshold": 5
  },
  "isekai": {
    "metric": "isekai",
    "threshold": 5
  },
  "romance": {
    "metric": "romance",
    "threshold": 5
  },
  "omniscient": {
    "metric": "genres",
    "threshold": 10
  },
  "night-owl": {
    "metric": "night_episodes",
    "threshold": 20
  },
  "binge-lord": {
    "metric": "daily_episodes",
    "threshold": 6
  },
  "critic": {
    "metric": "ratings",
    "threshold": 50
  },
  "commentator": {
    "metric": "comments",
    "threshold": 25
  },
  "tastemaker": {
    "metric": "published_tierlists",
    "threshold": 5
  },
  "manga-sage": {
    "metric": "manga_chapters",
    "threshold": 500
  },
  "doomer": {
    "metric": "dark_titles",
    "threshold": 5
  },
  "completionist": {
    "metric": "completed_titles",
    "threshold": 25
  },
  "trendsetter": {
    "metric": "recent_titles",
    "threshold": 5
  },
  "guild-coin": {
    "metric": "posts",
    "threshold": 10
  },
  "dream-token": {
    "metric": "planned_titles",
    "threshold": 25
  },
  "lucky-medal": {
    "metric": "active_days",
    "threshold": 7
  },
  "challenger-coin": {
    "metric": "active_days",
    "threshold": 30
  },
  "gold-sheaf-ticket": {
    "metric": "ratings",
    "threshold": 100
  },
  "labyrinth-token": {
    "metric": "distinct_titles",
    "threshold": 100
  },
  "tide-shells": {
    "metric": "active_months",
    "threshold": 3
  },
  "dragonbone-stamps": {
    "metric": "distinct_titles",
    "threshold": 250
  },
  "dragon-crystal-abyssal": {
    "metric": "episodes",
    "threshold": 2500
  },
  "bound-dragon-crystal-abyssal": {
    "metric": "episodes",
    "threshold": 5000
  },
  "badge-of-valor-temporal-rift": {
    "metric": "active_days",
    "threshold": 365
  },
  "chapter-pilgrim": {
    "metric": "novel_chapters",
    "threshold": 10
  },
  "scroll-keeper": {
    "metric": "novel_chapters",
    "threshold": 50
  },
  "inkbound-scholar": {
    "metric": "novel_chapters",
    "threshold": 100
  },
  "grand-archivist": {
    "metric": "novel_chapters",
    "threshold": 250
  },
  "celestial-scribe": {
    "metric": "novel_chapters",
    "threshold": 500
  },
  "first-episode": {
    "metric": "episodes",
    "threshold": 1
  },
  "first-manga": {
    "metric": "manga_chapters",
    "threshold": 1
  },
  "first-novel": {
    "metric": "novel_chapters",
    "threshold": 1
  },
  "genre-star": {
    "metric": "genres",
    "threshold": 5
  },
  "discussion-star": {
    "metric": "comments",
    "threshold": 100
  },
  "watch-star": {
    "metric": "episodes",
    "threshold": 500
  },
  "reading-star": {
    "metric": "reading_chapters",
    "threshold": 1000
  },
  "catalog-star": {
    "metric": "distinct_titles",
    "threshold": 500
  }
} as const;
export const MANUAL_HONORS = ['legend', 'diamond', 'mithril', 'hero-coin'] as const;
// OG is the fixed original milestone cohort; staff/entitlement badges remain admin-managed.
