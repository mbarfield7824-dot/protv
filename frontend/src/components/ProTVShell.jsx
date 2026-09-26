import '../styles/ProTV2.css';

export default function ProTVShell({ children }) {
  return (
    <div className="ptv">
      <div className="ptv-atmosphere" aria-hidden="true">
        <span className="ptv-glow ptv-glow--violet" />
        <span className="ptv-glow ptv-glow--blue" />
        <span className="ptv-glow ptv-glow--low" />
      </div>
      {children}
    </div>
  );
}
