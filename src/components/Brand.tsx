// US FLOOR wordmark with the DESIGN STUDIO line, matching the Design Center logo layout.
// The wordmark SVG is cropped to its letters (1406.1 x 172.66), so the red line spans exactly the same width.

const ASPECT = 1406.1 / 172.66;

export function Brand({ size = 28, invert = false }: { size?: number; invert?: boolean }) {
  const height = size * 0.64; // cap height of the letters for a given brand size
  const width = height * ASPECT;
  return (
    <span className="brand" style={{ width }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={invert ? "/US_FLOOR_Wordmark_White.svg" : "/US_FLOOR_Wordmark_Black.svg"}
        alt="US FLOOR"
        width={width}
        height={height}
        style={{ width, height, display: "block" }}
      />
      <span className="brand-sub" style={{ fontSize: Math.max(size * 0.3, 8) }}>
        <span className="brand-rule" />
        <span>DESIGN STUDIO</span>
        <span className="brand-rule" />
      </span>
    </span>
  );
}
