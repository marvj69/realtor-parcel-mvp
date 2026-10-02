"use client";

import { useEffect } from "react";
import BrandMark from "@/components/Brand";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="auth-screen">
      <main className="auth-main">
        <section className="auth-card">
          <span className="brand">
            <BrandMark />
            <span className="brand-name">Parcel</span>
          </span>
          <h1>Something went wrong</h1>
          <p>The workspace hit an unexpected problem. Your saved projects and notes are not affected.</p>
          <div className="form-stack">
            <button className="primary-button" type="button" onClick={reset}>
              Try again
            </button>
          </div>
          {error.digest ? <p className="auth-note">Reference: {error.digest}</p> : null}
        </section>
      </main>
    </div>
  );
}
