/** The clan's fan crest is a simple vector mark; all scene artwork is bundled. */
export function UchihaBannerMark() {
  return <div className="uchiha-banner-mark" aria-hidden="true">
    <svg viewBox="0 0 80 100" fill="none">
      <path d="M8 38a32 32 0 0 1 64 0v3H8z" fill="#d9404b" />
      <path d="M8 45h64a32 32 0 0 1-27 26v22H35V71A32 32 0 0 1 8 45" fill="#e8dfdc" />
    </svg>
    <span>UCHIHA</span>
  </div>;
}
