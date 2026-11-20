import '../styles/BrandLogo.css';

// The official PROtv logo artwork (transparent background), used wherever the site shows the PROtv wordmark.
// `large` serves the 1200 px file for big placements such as the homepage hero; everything else uses 480 px.
export default function BrandLogo({ className = '', large = false, decorative = false }) {
  return (
    <img
      className={`ptv-logo ${className}`.trim()}
      src={large ? '/brand/protv-logo-1200.webp' : '/brand/protv-logo-480.webp'}
      width={large ? 1200 : 480}
      height={large ? 333 : 133}
      alt={decorative ? '' : 'PROtv'}
      decoding="async"
      draggable="false"
    />
  );
}
