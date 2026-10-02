import Link from "next/link";
import BrandMark from "@/components/Brand";

export default function NotFound() {
  return (
    <div className="auth-screen">
      <main className="auth-main">
        <section className="auth-card">
          <span className="brand">
            <BrandMark />
            <span className="brand-name">Parcel</span>
          </span>
          <h1>Page not found</h1>
          <p>The page you are looking for does not exist or has moved.</p>
          <div className="form-stack">
            <Link className="primary-button" href="/">
              Back to the map
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
