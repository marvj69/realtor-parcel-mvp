"use client";

import BrandMark from "@/components/Brand";
import "./globals.css";

// Replaces the root layout when it fails, so it supplies its own document shell.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <div className="auth-screen">
          <main className="auth-main">
            <section className="auth-card">
              <span className="brand">
                <BrandMark />
                <span className="brand-name">Parcel</span>
              </span>
              <h1>Something went wrong</h1>
              <p>The workspace could not load. Your saved projects and notes are not affected.</p>
              <div className="form-stack">
                <button className="primary-button" type="button" onClick={reset}>
                  Reload
                </button>
              </div>
            </section>
          </main>
        </div>
      </body>
    </html>
  );
}
