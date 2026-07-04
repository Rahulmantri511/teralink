import Link from "next/link";
import { Metadata } from "next";
import { getAllPosts } from "../../lib/blog";
import BlogSearchList from "./BlogSearchList";

export const metadata: Metadata = {
  title: "TeraLink Blog — Free TeraBox Tutorials & Guides",
  description: "Read helpful guides, tips, and tutorials about TeraBox. Learn how to watch videos online without the app, download at high speed, and resolve links.",
  alternates: {
    canonical: "https://teralink.in/blog",
  },
  openGraph: {
    title: "TeraLink Blog — Free TeraBox Tutorials & Guides",
    description: "Read helpful guides, tips, and tutorials about TeraBox. Learn how to stream and download files without limits.",
    url: "https://teralink.in/blog",
    type: "website",
  },
};

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <>
      <style>{`
        .blog-page {
          min-height: 100vh;
          background: #060812;
          color: rgba(255, 255, 255, 0.85);
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 48px 16px 80px;
          position: relative;
          z-index: 1;
        }
        .blog-container {
          width: 100%;
          max-width: 1000px;
          position: relative;
          z-index: 1;
        }
        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: rgba(165, 180, 252, 0.8);
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 500;
          margin-bottom: 40px;
          padding: 8px 16px;
          border-radius: var(--r-md);
          border: 1px solid rgba(99,102,241,0.2);
          background: rgba(99,102,241,0.06);
          transition: all 0.2s;
        }
        .back-btn:hover {
          color: #a5b4fc;
          background: rgba(99,102,241,0.12);
          border-color: rgba(99,102,241,0.35);
          transform: translateX(-2px);
        }
        .blog-header {
          text-align: center;
          margin-bottom: 48px;
        }
        .blog-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 100px;
          background: rgba(99,102,241,0.1);
          border: 1px solid rgba(99,102,241,0.25);
          font-size: 0.72rem;
          font-weight: 700;
          color: #a5b4fc;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 16px;
        }
        .blog-h1 {
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          font-size: clamp(2.2rem, 5vw, 3rem);
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.02em;
          margin-bottom: 16px;
          line-height: 1.15;
          background: linear-gradient(135deg, #fff 30%, #a5b4fc 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .blog-sub {
          font-size: 1.05rem;
          line-height: 1.6;
          color: var(--text2);
          max-width: 600px;
          margin: 0 auto;
        }
        
        /* Footer */
        .footer {
          width: 100%;
          border-top: 1px solid var(--border);
          background: rgba(8, 10, 20, 0.8);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          padding: 60px 16px 40px;
          margin-top: auto;
          position: relative;
          z-index: 1;
        }
        .footer-grid {
          max-width: 1000px;
          margin: 0 auto 40px;
          display: grid;
          grid-template-columns: 2fr 1fr 1fr;
          gap: 40px;
        }
        .footer-brand {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .footer-logo-text {
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          font-size: 1.3rem;
          font-weight: 800;
          color: #fff;
        }
        .footer-brand p {
          font-size: 0.88rem;
          color: var(--text2);
          line-height: 1.6;
          max-width: 320px;
        }
        .footer-col-title {
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          font-size: 0.82rem;
          font-weight: 700;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 16px;
        }
        .footer-links-list {
          list-style: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .footer-link {
          font-size: 0.88rem;
          color: var(--text2);
          text-decoration: none;
          transition: color 0.2s;
          cursor: pointer;
        }
        .footer-link:hover {
          color: #a5b4fc;
        }
        .footer-bottom {
          max-width: 1000px;
          margin: 0 auto;
          padding-top: 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          text-align: center;
        }
        .footer-copy {
          font-size: 0.82rem;
          color: var(--text3);
        }
        .footer-disclaimer {
          font-size: 0.75rem;
          color: var(--text3);
          max-width: 800px;
          line-height: 1.5;
        }

        @media (max-width: 768px) {
          .footer-grid {
            grid-template-columns: 1fr;
            gap: 32px;
          }
        }
      `}</style>

      <div className="blog-page">
        <div className="blog-container">
          <Link href="/" className="back-btn">
            ← Back to TeraLink
          </Link>

          <header className="blog-header">
            <div className="blog-badge">📚 Resources &amp; Guides</div>
            <h1 className="blog-h1">TeraLink Blog</h1>
            <p className="blog-sub">
              Get the latest tips, guides, and tutorials on how to play, download, and manage TeraBox links online.
            </p>
          </header>

          <main>
            <BlogSearchList posts={posts} />
          </main>
        </div>
      </div>

      <footer className="footer">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="footer-logo-text">⚡ TeraLink</div>
            <p>Free TeraBox video player and direct link downloader. No registration, no limits.</p>
          </div>
          <div>
            <div className="footer-col-title">Legal</div>
            <ul className="footer-links-list">
              <li><Link href="/privacy" className="footer-link">Privacy Policy</Link></li>
              <li><Link href="/terms" className="footer-link">Terms &amp; Conditions</Link></li>
            </ul>
          </div>
          <div>
            <div className="footer-col-title">Supported Domains</div>
            <ul className="footer-links-list">
              {["terabox.com", "terasharefile.com", "1024tera.com", "teraboxapp.com"].map(d => (
                <li key={d}><span className="footer-link" style={{cursor: "default"}}>{d}</span></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p className="footer-copy">© {new Date().getFullYear()} TeraLink. All rights reserved. Not affiliated with TeraBox.</p>
          <p className="footer-disclaimer">We do not host any content on our servers. This service is a tool to play and download publicly shared TeraBox links.</p>
        </div>
      </footer>
    </>
  );
}
