/** Abstract illustrated placeholder portrait. Not a real person. Uses theme tokens only. */
export function WardenPortrait({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 400 480" role="img" aria-label={label} className="h-full w-full">
      <rect width="400" height="480" className="fill-surface-2" />
      {/* neck */}
      <rect x="176" y="270" width="48" height="70" rx="14" className="fill-muted-foreground" />
      {/* shoulders / jacket */}
      <path d="M20 480 C30 360 120 322 200 322 C280 322 370 360 380 480 Z" className="fill-secondary" />
      {/* collar + tie */}
      <path d="M166 326 L200 392 L234 326 Z" className="fill-surface" />
      <path d="M192 380 L208 380 L215 450 L200 464 L185 450 Z" className="fill-primary" />
      {/* head */}
      <ellipse cx="200" cy="205" rx="64" ry="80" className="fill-muted-foreground" />
      {/* hair */}
      <path d="M134 195 C128 110 272 110 266 195 C250 150 150 150 134 195 Z" className="fill-navy-deep" />
    </svg>
  );
}
