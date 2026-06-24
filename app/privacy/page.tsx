import Link from 'next/link';

export const metadata = {
  title: "Privacy Policy — TeraLink",
  description: "Read the Privacy Policy for TeraLink, the free online TeraBox video player and downloader. We don't collect personal data or store your files.",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicy() {
  return (
    <>
      <style>{`
        .legal-page {
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
        .legal-page::before, .legal-page::after {
          content: '';
          position: fixed;
          border-radius: 50%;
          pointer-events: none;
          z-index: 0;
          filter: blur(120px);
        }
        .legal-page::before {
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%);
          top: -200px; right: -100px;
        }
        .legal-page::after {
          width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%);
          bottom: -100px; left: -100px;
        }
        .legal-container {
          width: 100%;
          max-width: 820px;
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
          margin-bottom: 32px;
          padding: 8px 16px;
          border-radius: 10px;
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
        .legal-header {
          margin-bottom: 36px;
        }
        .legal-badge {
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
        .legal-h1 {
          font-size: clamp(1.8rem, 4vw, 2.4rem);
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.02em;
          margin-bottom: 10px;
          line-height: 1.15;
        }
        .legal-updated {
          font-size: 0.82rem;
          color: rgba(255,255,255,0.35);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .legal-body {
          background: rgba(17, 20, 34, 0.65);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 40px;
          position: relative;
          overflow: hidden;
        }
        .legal-body::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(99,102,241,0.35), transparent);
        }
        .legal-intro {
          font-size: 0.95rem;
          line-height: 1.75;
          color: rgba(255,255,255,0.65);
          margin-bottom: 36px;
          padding-bottom: 24px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .legal-section {
          margin-bottom: 32px;
        }
        .legal-section:last-child { margin-bottom: 0; }
        .legal-h2 {
          font-size: 1.05rem;
          font-weight: 700;
          color: #e2e4f0;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .section-number {
          width: 26px;
          height: 26px;
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2));
          border: 1px solid rgba(99,102,241,0.25);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.72rem;
          font-weight: 800;
          color: #a5b4fc;
          flex-shrink: 0;
        }
        .legal-p {
          font-size: 0.9rem;
          line-height: 1.75;
          color: rgba(255,255,255,0.6);
          margin-bottom: 12px;
        }
        .legal-p:last-child { margin-bottom: 0; }
        .legal-ul {
          list-style: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 12px;
        }
        .legal-li {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 0.9rem;
          line-height: 1.65;
          color: rgba(255,255,255,0.6);
        }
        .legal-li::before {
          content: '→';
          color: #6366f1;
          font-weight: 700;
          flex-shrink: 0;
          margin-top: 0px;
        }
        .footer-note {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid rgba(255,255,255,0.07);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .footer-note-text {
          font-size: 0.78rem;
          color: rgba(255,255,255,0.3);
        }
        .footer-note-link {
          font-size: 0.78rem;
          color: rgba(165,180,252,0.6);
          text-decoration: none;
          transition: color 0.2s;
        }
        .footer-note-link:hover { color: #a5b4fc; }
        @media (max-width: 600px) {
          .legal-body { padding: 24px; }
        }
      `}</style>

      <div className="legal-page">
        <div className="legal-container">
          <Link href="/" className="back-btn">
            ← Back to TeraLink
          </Link>

          <div className="legal-header">
            <div className="legal-badge">🔒 Legal Document</div>
            <h1 className="legal-h1">Privacy Policy</h1>
            <div className="legal-updated">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>

          <div className="legal-body">
            <p className="legal-intro">
              At <strong style={{color: '#c7d2fe'}}>TeraLink</strong>, accessible from our website, one of our main priorities is the privacy of our visitors. This Privacy Policy document outlines the types of information collected by TeraLink, how we use it, and what protections we have in place. By using our service, you agree to the terms of this policy.
            </p>

            <div className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">1</span>
                Information We Do Not Collect
              </h2>
              <p className="legal-p">
                TeraLink is a client-side utility and proxy interface. We are proud to operate without collecting personal data. Specifically:
              </p>
              <ul className="legal-ul">
                <li className="legal-li">We do not host, store, or archive any files, videos, or folders processed through our service.</li>
                <li className="legal-li">We do not require any registration, email addresses, passwords, or personal names.</li>
                <li className="legal-li">All file processing is done dynamically and no data history is kept on our servers.</li>
                <li className="legal-li">TeraBox links you paste are used solely to retrieve and proxy the content — they are not stored.</li>
              </ul>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">2</span>
                Cookies and Web Storage
              </h2>
              <p className="legal-p">
                Like most websites, TeraLink may use browser cookies or local storage to improve your experience. These are limited to functional purposes such as storing your preferences (e.g., last-used quality setting). We do not use cookies for advertising, tracking, or cross-site analytics.
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">3</span>
                Third-Party Services
              </h2>
              <p className="legal-p">
                TeraLink may utilize third-party infrastructure such as Cloudflare Workers or Vercel CDN for proxying and performance. These third-party providers have their own privacy policies. We do not sell, trade, or transfer your data to any third parties for marketing purposes.
              </p>
              <p className="legal-p">
                TeraLink is not affiliated, associated, authorized, endorsed by, or in any way officially connected with TeraBox or any of its subsidiaries or affiliates.
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">4</span>
                Children&apos;s Privacy
              </h2>
              <p className="legal-p">
                TeraLink does not knowingly collect any personally identifiable information from children under the age of 13. If you believe your child has provided us with personal information, please contact us immediately and we will take steps to remove such information.
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">5</span>
                Your Consent
              </h2>
              <p className="legal-p">
                By using our website, you hereby consent to our Privacy Policy and agree to its terms. If you have questions or concerns about this policy, you are welcome to contact us through the information available on our website.
              </p>
            </div>

            <div className="footer-note">
              <span className="footer-note-text">© {new Date().getFullYear()} TeraLink. All rights reserved.</span>
              <Link href="/terms" className="footer-note-link">View Terms &amp; Conditions →</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
