import { useEffect, useRef, useState } from "react";
import { Disc3, Pause, Play, Volume2 } from "lucide-react";
import type { MidnightLofiConfig } from "./config";

export function LofiMusic({ music }: { music: MidnightLofiConfig["music"] }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(music.volume);
  const [error, setError] = useState(false);
  useEffect(() => {
    setVolume(music.volume);
  }, [music.volume]);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    setPlaying(false);
    setError(false);
  }, [music.url]);
  const toggle = async () => {
    if (!audio.current) return;
    if (playing) audio.current.pause();
    else {
      setError(false);
      try {
        await audio.current.play();
      } catch {
        setError(true);
      }
    }
  };
  return (
    <aside
      className="ml-music"
      aria-label="Lo-fi music player"
      data-playing={playing}
    >
      <audio
        ref={audio}
        src={
          music.url ||
          "/assets/profile-themes/midnight-lofi/after-the-last-train.mp3"
        }
        loop
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          setError(true);
        }}
      />
      <Disc3 className="ml-music-disc" size={42} aria-hidden="true" />
      <div className="ml-music-track">
        <strong>{music.title || "After the last train"}</strong>
        <span>
          {error
            ? "Audio unavailable. Try again or change the audio link."
            : playing
            ? "Now playing · stay a little longer"
            : "A quiet soundtrack for your stay"}
        </span>
      </div>
      <div className="ml-music-wave" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} style={{ animationDelay: `${i * -0.19}s` }} />
        ))}
      </div>
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? "Pause lo-fi music" : "Play lo-fi music"}
      >
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <label className="ml-volume">
        <Volume2 size={15} />
        <span className="sr-only">Music volume</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </label>
    </aside>
  );
}
