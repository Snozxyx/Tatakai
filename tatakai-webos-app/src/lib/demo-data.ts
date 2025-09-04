// Demo data for development when APIs are not available
export const demoHomeData = {
  success: true,
  data: {
    genres: ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance", "Thriller"],
    spotlightAnimes: [
      {
        id: "attack-on-titan-112",
        name: "Attack on Titan",
        poster: "https://cdn.aniwatch.to/anime/poster/attack-on-titan-112.png",
        description: "Humanity fights for survival against giant humanoid Titans that threaten their existence.",
        type: "TV",
        episodes: { sub: 75, dub: 75 },
        rating: "9.0",
        genres: ["Action", "Drama", "Fantasy"]
      },
      {
        id: "demon-slayer-55",
        name: "Demon Slayer: Kimetsu no Yaiba",
        poster: "https://cdn.aniwatch.to/anime/poster/demon-slayer-kimetsu-no-yaiba-55.png",
        description: "A young boy becomes a demon slayer to save his sister and avenge his family.",
        type: "TV",
        episodes: { sub: 32, dub: 32 },
        rating: "8.7",
        genres: ["Action", "Adventure", "Drama"]
      },
      {
        id: "one-piece-100",
        name: "One Piece",
        poster: "https://cdn.aniwatch.to/anime/poster/one-piece-100.png",
        description: "Follow Monkey D. Luffy and his crew as they search for the legendary treasure One Piece.",
        type: "TV",
        episodes: { sub: 1000, dub: 600 },
        rating: "9.5",
        genres: ["Action", "Adventure", "Comedy"]
      }
    ],
    trendingAnimes: [
      {
        id: "jujutsu-kaisen-534",
        name: "Jujutsu Kaisen",
        poster: "https://cdn.aniwatch.to/anime/poster/jujutsu-kaisen-534.png",
        type: "TV",
        episodes: { sub: 24, dub: 24 },
        rank: 1
      },
      {
        id: "chainsaw-man-17406",
        name: "Chainsaw Man",
        poster: "https://cdn.aniwatch.to/anime/poster/chainsaw-man-17406.png",
        type: "TV",
        episodes: { sub: 12, dub: 12 },
        rank: 2
      },
      {
        id: "spy-x-family-17977",
        name: "Spy x Family",
        poster: "https://cdn.aniwatch.to/anime/poster/spy-x-family-17977.png",
        type: "TV",
        episodes: { sub: 25, dub: 25 },
        rank: 3
      },
      {
        id: "mob-psycho-100-37",
        name: "Mob Psycho 100",
        poster: "https://cdn.aniwatch.to/anime/poster/mob-psycho-100-37.png",
        type: "TV",
        episodes: { sub: 37, dub: 37 },
        rank: 4
      }
    ],
    latestEpisodeAnimes: [
      {
        id: "bleach-806",
        name: "Bleach: Thousand-Year Blood War",
        poster: "https://cdn.aniwatch.to/anime/poster/bleach-thousand-year-blood-war-17549.png",
        type: "TV",
        episodes: { sub: 26, dub: 13 }
      },
      {
        id: "my-hero-academia-31",
        name: "My Hero Academia",
        poster: "https://cdn.aniwatch.to/anime/poster/my-hero-academia-31.png",
        type: "TV",
        episodes: { sub: 150, dub: 150 }
      }
    ],
    mostPopularAnimes: [
      {
        id: "naruto-3",
        name: "Naruto",
        poster: "https://cdn.aniwatch.to/anime/poster/naruto-3.png",
        type: "TV",
        episodes: { sub: 720, dub: 720 }
      },
      {
        id: "dragon-ball-z-325",
        name: "Dragon Ball Z",
        poster: "https://cdn.aniwatch.to/anime/poster/dragon-ball-z-325.png",
        type: "TV",
        episodes: { sub: 291, dub: 291 }
      }
    ],
    topAiringAnimes: [
      {
        id: "frieren-18542",
        name: "Frieren: Beyond Journey's End",
        poster: "https://cdn.aniwatch.to/anime/poster/frieren-beyond-journeys-end-18542.png",
        jname: "Sousou no Frieren"
      }
    ],
    mostFavoriteAnimes: [
      {
        id: "fullmetal-alchemist-brotherhood-64",
        name: "Fullmetal Alchemist: Brotherhood",
        poster: "https://cdn.aniwatch.to/anime/poster/fullmetal-alchemist-brotherhood-64.png",
        type: "TV",
        episodes: { sub: 64, dub: 64 }
      }
    ],
    latestCompletedAnimes: [
      {
        id: "cyberpunk-edgerunners-17482",
        name: "Cyberpunk: Edgerunners",
        poster: "https://cdn.aniwatch.to/anime/poster/cyberpunk-edgerunners-17482.png",
        type: "ONA",
        episodes: { sub: 10, dub: 10 }
      }
    ],
    top10Animes: {
      today: [],
      week: [],
      month: []
    },
    topUpcomingAnimes: []
  }
}