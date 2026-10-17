import { useState } from "react";
export function TVTitleLogo({ logo, title }: { logo?: string; title: string }) {
  const [square, setSquare] = useState(false);
  const [failed, setFailed] = useState<string>();
  return (
    <h1 className={logo && failed !== logo ? "tv-title-logo" : undefined}>
      {logo && failed !== logo ? (
        <img src={logo} alt={title} className={square ? "tv-logo-square" : undefined} onLoad={event => setSquare(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight < 1.6)} onError={() => setFailed(logo)} />
      ) : (
        title
      )}
    </h1>
  );
}
