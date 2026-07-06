import Link from 'next/link';

export const metadata = {
  title: "DMCA Copyright Policy — TeraLink",
  description: "Read the DMCA & Copyright Policy for TeraLink. We do not host any files on our servers and only act as a proxy player for user-provided links.",
  robots: { index: true, follow: true },
};

export default function DMCAPolicy() {
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
            <div className="legal-badge">⚖️ Copyright Compliance</div>
            <h1 className="legal-h1">DMCA &amp; Copyright Policy</h1>
            <div className="legal-updated">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>

          <div className="legal-body">
            <p className="legal-intro">
              <strong style={{color: '#c7d2fe'}}>TeraLink</strong> is committed to respecting the intellectual property rights of others. We comply with the Digital Millennium Copyright Act (&quot;DMCA&quot;) and similar international copyright laws.
            </p>

            <div className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">1</span>
                Purely Client-Side Proxy Tool
              </h2>
              <p className="legal-p">
                It is important to understand how our service operates:
              </p>
              <ul className="legal-ul">
                <li className="legal-li"><strong>No Content Hosting:</strong> TeraLink does not host, store, download, or index any video files, directories, or media content on our servers.</li>
                <li className="legal-li"><strong>Dynamic Proxying:</strong> Our platform functions purely as a web utility interface. When a user inputs a TeraBox link, our tool dynamically fetches the public streaming URL from TeraBox at the client&apos;s request and plays it.</li>
                <li className="legal-li"><strong>Third-party Files:</strong> The underlying files are hosted entirely on third-party cloud storage (specifically TeraBox / 1024tera). Therefore, TeraLink does not have control over the media content itself.</li>
              </ul>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">2</span>
                Removing Copyrighted Content
              </h2>
              <p className="legal-p">
                Because we do not host any files, removing a link from TeraLink will not delete the source file from the internet. To permanently remove the file, you must contact the hosting provider (**TeraBox / Flextech Inc.**) directly.
              </p>
              <p className="legal-p">
                However, if you wish to block specific TeraBox links from being opened or played through our platform, we will gladly accommodate your request. Please send a request containing:
              </p>
              <ul className="legal-ul">
                <li className="legal-li">Identification of the copyrighted work claimed to be infringed.</li>
                <li className="legal-li">The exact TeraBox URL(s) you wish to block on our platform.</li>
                <li className="legal-li">Your contact information (name, address, telephone number, and email).</li>
                <li className="legal-li">A statement that you have a good-faith belief that the use is not authorized.</li>
              </ul>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">3</span>
                Submit a Request
              </h2>
              <p className="legal-p">
                You can send all copyright blocking and infringement requests to our email:
              </p>
              <p className="legal-p" style={{background: 'rgba(255,255,255,0.04)', padding: '12px 18px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'monospace', fontSize: '1rem', color: '#a5b4fc', display: 'inline-block'}}>
                contact@teralink.in
              </p>
              <p className="legal-p" style={{marginTop: '12px'}}>
                We aim to process and block valid link requests within 24 to 48 hours.
              </p>
            </div>

            <div className="footer-note">
              <span className="footer-note-text">© {new Date().getFullYear()} TeraLink. All rights reserved.</span>
              <Link href="/privacy" className="footer-note-link">View Privacy Policy →</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
