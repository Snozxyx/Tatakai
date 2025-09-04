'use client'

import { HomePageData } from '../../lib/api-client'
import { AnimeRow } from './anime-row'

interface ContentRowsProps {
  homeData: HomePageData
}

export function ContentRows({ homeData }: ContentRowsProps) {
  return (
    <div className="space-y-8 pb-16">
      {/* Latest Episodes */}
      <AnimeRow
        title="Latest Episodes"
        animes={homeData.latestEpisodeAnimes}
        rowId="latest-episodes"
      />

      {/* Trending */}
      <AnimeRow
        title="Trending Now"
        animes={homeData.trendingAnimes}
        rowId="trending"
      />

      {/* Top Airing */}
      <AnimeRow
        title="Top Airing"
        animes={homeData.topAiringAnimes}
        rowId="top-airing"
      />

      {/* Most Popular */}
      <AnimeRow
        title="Most Popular"
        animes={homeData.mostPopularAnimes}
        rowId="most-popular"
      />

      {/* Top Upcoming */}
      <AnimeRow
        title="Coming Soon"
        animes={homeData.topUpcomingAnimes}
        rowId="upcoming"
      />

      {/* Top 10 Today */}
      {homeData.top10Animes.today.length > 0 && (
        <AnimeRow
          title="Top 10 Today"
          animes={homeData.top10Animes.today}
          rowId="top10-today"
          showRankings
        />
      )}

      {/* Top 10 This Week */}
      {homeData.top10Animes.week.length > 0 && (
        <AnimeRow
          title="Top 10 This Week"
          animes={homeData.top10Animes.week}
          rowId="top10-week"
          showRankings
        />
      )}

      {/* Top 10 This Month */}
      {homeData.top10Animes.month.length > 0 && (
        <AnimeRow
          title="Top 10 This Month"
          animes={homeData.top10Animes.month}
          rowId="top10-month"
          showRankings
        />
      )}
    </div>
  )
}