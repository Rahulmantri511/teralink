"use client";

import { useState } from "react";
import Link from "next/link";
import { BlogPost } from "../../lib/blog";

interface BlogSearchListProps {
  posts: BlogPost[];
}

export default function BlogSearchList({ posts }: BlogSearchListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPosts = posts.filter((post) => {
    const query = searchQuery.toLowerCase();
    return (
      post.title.toLowerCase().includes(query) ||
      post.summary.toLowerCase().includes(query) ||
      post.category.toLowerCase().includes(query) ||
      post.keywords.some((keyword) => keyword.toLowerCase().includes(query))
    );
  });

  return (
    <>
      <style>{`
        .search-container {
          margin-bottom: 40px;
          position: relative;
          z-index: 10;
        }
        .search-input-wrapper {
          position: relative;
          max-width: 500px;
          margin: 0 auto;
        }
        .search-icon {
          position: absolute;
          left: 18px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 1.1rem;
          color: var(--text2);
          pointer-events: none;
        }
        .search-input {
          width: 100%;
          padding: 16px 18px 16px 48px;
          background: rgba(17, 20, 34, 0.65);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--border);
          border-radius: var(--r-xl);
          color: #fff;
          font-family: inherit;
          font-size: 0.95rem;
          outline: none;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .search-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 25px rgba(99, 102, 241, 0.25);
          background: rgba(17, 20, 34, 0.8);
        }
        .search-clear {
          position: absolute;
          right: 18px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text2);
          font-size: 1.2rem;
          cursor: pointer;
          padding: 4px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }
        .search-clear:hover {
          color: #fff;
        }
        .blog-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
          margin-bottom: 48px;
        }
        .blog-card {
          background: rgba(17, 20, 34, 0.6);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--border);
          border-radius: var(--r-xl);
          padding: 28px;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          text-decoration: none;
          color: inherit;
          height: 100%;
        }
        .blog-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
        }
        .blog-card:hover {
          transform: translateY(-6px);
          border-color: rgba(99, 102, 241, 0.35);
          background: rgba(17, 20, 34, 0.75);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4), 
                      0 0 20px rgba(99, 102, 241, 0.08);
        }
        .blog-card:hover .blog-card-title {
          color: #a5b4fc;
        }
        .blog-card:hover .read-more-link {
          gap: 8px;
          color: #a5b4fc;
        }
        .blog-card-badge {
          align-self: flex-start;
          padding: 4px 12px;
          border-radius: 100px;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 18px;
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.25);
          color: #a5b4fc;
        }
        .blog-card-icon-wrap {
          font-size: 1.8rem;
          margin-bottom: 12px;
        }
        .blog-card-title {
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          font-size: 1.25rem;
          font-weight: 700;
          color: #fff;
          line-height: 1.35;
          margin-bottom: 12px;
          transition: color 0.2s;
        }
        .blog-card-desc {
          font-size: 0.9rem;
          line-height: 1.6;
          color: var(--text2);
          margin-bottom: 24px;
          flex-grow: 1;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .blog-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 18px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          font-size: 0.78rem;
          color: var(--text3);
        }
        .blog-card-meta {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .blog-card-meta-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .read-more-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-weight: 600;
          color: rgba(165, 180, 252, 0.8);
          transition: all 0.2s;
        }
        .no-results {
          text-align: center;
          padding: 60px 20px;
          background: rgba(17, 20, 34, 0.4);
          border: 1px dashed var(--border);
          border-radius: var(--r-xl);
          color: var(--text2);
        }
        .no-results-icon {
          font-size: 2.5rem;
          margin-bottom: 12px;
          display: block;
        }
        .no-results-title {
          font-size: 1.15rem;
          font-weight: 600;
          color: #fff;
          margin-bottom: 6px;
        }
      `}</style>

      <div className="search-container">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search articles, keywords, or topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search blog posts"
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => setSearchQuery("")}
              title="Clear search"
              aria-label="Clear search query"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {filteredPosts.length > 0 ? (
        <div className="blog-grid">
          {filteredPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="blog-card"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="blog-card-badge">{post.category}</span>
                <span className="blog-card-icon-wrap">{post.icon}</span>
              </div>
              <h2 className="blog-card-title">{post.title}</h2>
              <p className="blog-card-desc">{post.summary}</p>
              <div className="blog-card-footer">
                <div className="blog-card-meta">
                  <span className="blog-card-meta-item">
                    📅 {post.publishedAt}
                  </span>
                  <span className="blog-card-meta-item">
                    ⏱️ {post.readingTime}
                  </span>
                </div>
                <span className="read-more-link">
                  Read Article →
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="no-results">
          <span className="no-results-icon">📂</span>
          <h3 className="no-results-title">No articles found</h3>
          <p>We couldn&apos;t find any posts matching &ldquo;{searchQuery}&rdquo;. Try another search term.</p>
        </div>
      )}
    </>
  );
}
