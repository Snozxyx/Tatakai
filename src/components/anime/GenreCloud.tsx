import { useNavigate } from "react-router-dom";

interface GenreCloudProps {
  genres: string[];
}

export function GenreCloud({ genres }: GenreCloudProps) {
  const navigate = useNavigate();

  const handleGenreClick = (genre: string) => {
    navigate(`/genre/${genre.toLowerCase()}`);
  };

  return (
    <section className="mb-24">
      <h3 className="font-display text-2xl font-semibold tracking-tight mb-8 px-2">
        Explore Genres
      </h3>
      <div className="flex flex-wrap gap-4">
        {genres.slice(0, 12).map((genre) => (
          <button
            key={genre}
            onClick={() => handleGenreClick(genre)}
            className="group relative overflow-hidden rounded-2xl px-6 py-4 border border-border/30 bg-muted/30 hover:bg-muted/50 transition-all"
          >
            <span className="relative z-10 text-lg font-bold text-muted-foreground group-hover:text-foreground transition-colors">
              {genre}
            </span>
            <div className="absolute bottom-0 left-0 h-1 w-full bg-primary transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
          </button>
        ))}
      </div>
    </section>
  );
}
