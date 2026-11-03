import { Link } from '../lib/router';

/** The Kokoon Labs wordmark, same files as the LMS (public/brand). Light and dark versions; CSS shows the right one. */
export function BrandLogo({ to, className }: { to?: string; className?: string }) {
  const imgs = (
    <>
      <img src="brand/kokoon-logo.png" alt="Kokoon Labs" className="logo-img logo-light" />
      <img src="brand/kokoon-logo-white.png" alt="" aria-hidden="true" className="logo-img logo-dark" />
    </>
  );
  return to ? <Link to={to} className={`logo ${className ?? ''}`} title="Kokoon IoT Studio">{imgs}</Link> : <span className={`logo ${className ?? ''}`}>{imgs}</span>;
}
