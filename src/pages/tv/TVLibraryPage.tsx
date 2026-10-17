import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { TVPairingModal } from "./TVPairingModal";
export default function TVLibraryPage() {
  const [pairing, setPairing] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="tv-library">
      <h1>My Tatakai</h1>
      <p>Your library, your sources, your people.</p>
      <div className="tv-library-links">
        <button onClick={() => setPairing(true)}>
          {user ? "Sync from a companion device" : "Link your account"}
        </button>
        <Link to="/favorites">Watchlist &amp; favorites</Link>
        <Link to="/downloads">Downloads</Link>
        <Link to="/extensions">Extensions &amp; sources</Link>
        <button onClick={() => navigate("/settings")}>
          Settings &amp; debrid
        </button>
        <Link to="/tv/iptv">IPTV &amp; guide · Experimental</Link>
        <Link to="/community">Community</Link>
        <Link to="/profile">Your profile</Link>
        <Link to="/manga">Manga · Experimental</Link>
        <Link to="/novel">Novels · Experimental</Link>
        {user && (
          <button onClick={() => void signOut()}>Sign out on this TV</button>
        )}
      </div>
      <TVPairingModal open={pairing} onClose={() => setPairing(false)} />
    </div>
  );
}
