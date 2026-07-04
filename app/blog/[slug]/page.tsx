import Link from "next/link";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { getPostBySlug, getAllPosts } from "../../../lib/blog";

// Next.js 15+ App Router type definition for page params
type Props = {
  params: Promise<{ slug: string }>;
};

// Generate static HTML for all blog posts at build time
export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

// Generate dynamic metadata for each blog post
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: "Post Not Found | TeraLink",
    };
  }

  return {
    title: `${post.title} | TeraLink Blog`,
    description: post.metaDescription,
    alternates: {
      canonical: `https://teralink.in/blog/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.metaDescription,
      url: `https://teralink.in/blog/${post.slug}`,
      type: "article",
      publishedTime: post.publishedAt,
      authors: ["TeraLink"],
      section: post.category,
      tags: post.keywords,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.metaDescription,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  // Get related posts (exclude current post, limit to 2)
  const allPosts = getAllPosts();
  const relatedPosts = allPosts
    .filter((p) => p.slug !== post.slug)
    .slice(0, 2);

  // Generate Article JSON-LD schema markup
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.metaDescription,
    "image": "https://teralink.in/icon.svg",
    "datePublished": post.publishedAt,
    "author": {
      "@type": "Organization",
      "name": "TeraLink",
      "url": "https://teralink.in"
    },
    "publisher": {
      "@type": "Organization",
      "name": "TeraLink",
      "logo": {
        "@type": "ImageObject",
        "url": "https://teralink.in/icon.svg"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://teralink.in/blog/${post.slug}`
    }
  };

  return (
    <>
      {/* Inject Article JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <style>{`
        .post-page {
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
        .post-container {
          width: 100%;
          max-width: 820px;
          position: relative;
          z-index: 1;
        }
        .nav-links {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
          width: 100%;
        }
        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: rgba(165, 180, 252, 0.8);
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 500;
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
        .home-btn {
          font-size: 0.88rem;
          color: var(--text2);
          text-decoration: none;
          transition: color 0.2s;
        }
        .home-btn:hover {
          color: #fff;
        }
        .post-header {
          margin-bottom: 32px;
        }
        .post-badge {
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
        .post-h1 {
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          font-size: clamp(1.8rem, 4.5vw, 2.6rem);
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.02em;
          margin-bottom: 16px;
          line-height: 1.2;
        }
        .post-meta {
          font-size: 0.85rem;
          color: var(--text3);
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .post-meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .post-body {
          background: rgba(17, 20, 34, 0.65);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--border);
          border-radius: var(--r-xl);
          padding: 40px;
          position: relative;
          overflow: hidden;
          margin-bottom: 40px;
        }
        .post-body::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(99,102,241,0.35), transparent);
        }
        
        /* Article markup styling */
        .article-content {
          font-size: 0.98rem;
          line-height: 1.8;
          color: rgba(255, 255, 255, 0.75);
        }
        .article-content p {
          margin-bottom: 24px;
        }
        .article-content h2 {
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          font-size: 1.4rem;
          font-weight: 700;
          color: #fff;
          margin-top: 40px;
          margin-bottom: 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          padding-bottom: 8px;
        }
        .article-content h3 {
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          font-size: 1.15rem;
          font-weight: 600;
          color: #e2e4f0;
          margin-top: 28px;
          margin-bottom: 12px;
        }
        .article-content ul, .article-content ol {
          margin-bottom: 24px;
          padding-left: 20px;
        }
        .article-content li {
          margin-bottom: 10px;
        }
        .article-content strong {
          color: #c7d2fe;
          font-weight: 600;
        }
        .article-content code {
          background: rgba(99, 102, 241, 0.12);
          color: #a5b4fc;
          padding: 2px 6px;
          border-radius: 6px;
          font-family: monospace;
          font-size: 0.85em;
          border: 1px solid rgba(99, 102, 241, 0.2);
        }
        .article-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 28px 0;
          font-size: 0.88rem;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          overflow: hidden;
        }
        .article-content th, .article-content td {
          padding: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .article-content th {
          background: rgba(99,102,241,0.15);
          color: #fff;
          font-weight: 700;
          text-align: left;
        }
        
        /* Banner call to action */
        .inline-cta {
          display: flex;
          align-items: center;
          gap: 16px;
          background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1));
          border: 1px solid rgba(99,102,241,0.25);
          border-radius: var(--r-md);
          padding: 20px;
          margin-bottom: 28px;
        }
        .inline-cta-icon {
          font-size: 1.8rem;
        }
        .inline-cta-text {
          font-size: 0.88rem;
          line-height: 1.5;
          color: var(--text);
        }
        .inline-cta-link {
          color: #a5b4fc;
          text-decoration: underline;
          font-weight: 600;
        }

        /* Large Bottom CTA card */
        .bottom-cta {
          background: linear-gradient(135deg, rgba(17,20,34,0.85) 0%, rgba(30,34,54,0.85) 100%);
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: var(--r-xl);
          padding: 32px;
          text-align: center;
          position: relative;
          overflow: hidden;
          margin-top: 40px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .bottom-cta::before {
          content: '';
          position: absolute;
          top: -50%; left: -50%; width: 200%; height: 200%;
          background: radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 60%);
          pointer-events: none;
        }
        .bottom-cta-title {
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          font-size: 1.4rem;
          font-weight: 800;
          color: #fff;
          margin-bottom: 12px;
        }
        .bottom-cta-desc {
          font-size: 0.92rem;
          color: var(--text2);
          margin-bottom: 24px;
          max-width: 500px;
          margin-left: auto;
          margin-right: auto;
          line-height: 1.6;
        }
        .cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          color: #fff;
          font-weight: 700;
          text-decoration: none;
          padding: 14px 28px;
          border-radius: var(--r-md);
          font-size: 0.95rem;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.35);
        }
        .cta-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
          filter: brightness(1.1);
        }
        
        /* Related posts */
        .related-posts-section {
          width: 100%;
          margin-top: 56px;
          padding-top: 40px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .related-title {
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          font-size: 1.2rem;
          font-weight: 700;
          color: #fff;
          margin-bottom: 24px;
        }
        .related-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .related-card {
          background: rgba(17, 20, 34, 0.4);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          padding: 20px;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s;
        }
        .related-card:hover {
          background: rgba(17, 20, 34, 0.65);
          border-color: rgba(99, 102, 241, 0.25);
          transform: translateY(-3px);
        }
        .related-card-title {
          font-size: 0.98rem;
          font-weight: 600;
          color: #fff;
          line-height: 1.4;
          margin-bottom: 8px;
        }
        .related-card-meta {
          font-size: 0.78rem;
          color: var(--text3);
        }

        /* Footer */
        .footer {
          width: 100%;
          border-top: 1px solid var(--border);
          background: rgba(8, 10, 20, 0.8);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          padding: 60px 16px 40px;
          margin-top: 80px;
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
          .post-body { padding: 24px; }
          .related-grid { grid-template-columns: 1fr; }
          .footer-grid { grid-template-columns: 1fr; gap: 32px; }
        }
      `}</style>

      <div className="post-page">
        <div className="post-container">
          <div className="nav-links">
            <Link href="/blog" className="back-btn">
              ← Back to Blog
            </Link>
            <Link href="/" className="home-btn">
              ⚡ Go to TeraLink Home
            </Link>
          </div>

          <article>
            <header className="post-header">
              <span className="post-badge">{post.category}</span>
              <h1 className="post-h1">{post.title}</h1>
              <div className="post-meta">
                <span className="post-meta-item">
                  👤 By TeraLink Editorial
                </span>
                <span className="post-meta-item">
                  📅 Published: {post.publishedAt}
                </span>
                <span className="post-meta-item">
                  ⏱️ {post.readingTime}
                </span>
              </div>
            </header>

            <div className="post-body">
              {/* Top Call to Action */}
              <div className="inline-cta">
                <span className="inline-cta-icon">⚡</span>
                <div className="inline-cta-text">
                  <strong>Tired of limitations?</strong> Paste your shared TeraBox link on the <Link href="/" className="inline-cta-link">TeraLink Homepage</Link> to stream videos instantly in HD and generate high-speed download links. No app install required!
                </div>
              </div>

              {/* Render article contents */}
              <div
                className="article-content"
                dangerouslySetInnerHTML={{ __html: post.content }}
              />

              {/* Bottom Large Call to Action */}
              <div className="bottom-cta">
                <h3 className="bottom-cta-title">Play Your TeraBox Link Instantly</h3>
                <p className="bottom-cta-desc">
                  Bypass speed limits, preview cuts, and forced app installations. Stream or download your TeraBox files immediately with TeraLink.
                </p>
                <Link href="/" className="cta-btn">
                  ▶ Stream TeraBox Link Free
                </Link>
              </div>
            </div>
          </article>

          {/* Related Articles Section */}
          {relatedPosts.length > 0 && (
            <div className="related-posts-section">
              <h3 className="related-title">Related Guides &amp; Articles</h3>
              <div className="related-grid">
                {relatedPosts.map((relatedPost) => (
                  <Link
                    key={relatedPost.slug}
                    href={`/blog/${relatedPost.slug}`}
                    className="related-card"
                  >
                    <h4 className="related-card-title">{relatedPost.title}</h4>
                    <div className="related-card-meta">
                      📅 {relatedPost.publishedAt} | {relatedPost.category}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
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
