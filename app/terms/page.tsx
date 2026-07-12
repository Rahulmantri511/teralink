import Link from 'next/link';

export const metadata = {
  title: "Terms & Conditions — TeraLink",
  description: "Read the Terms & Conditions for TeraLink, the free online TeraBox video player and downloader. Understand your rights and responsibilities when using our service.",
  alternates: { canonical: "https://teralink.in/terms" },
  openGraph: {
    title: "Terms & Conditions — TeraLink",
    description: "TeraLink's terms and conditions for using our free TeraBox streaming service.",
    url: "https://teralink.in/terms",
    type: "website",
  },
  twitter: { card: "summary", title: "Terms & Conditions — TeraLink", description: "TeraLink's terms and conditions." },
  robots: { index: true, follow: true },
};

export default function TermsAndConditions() {
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
            <div className="legal-badge">📄 Legal Document</div>
            <h1 className="legal-h1">Terms &amp; Conditions</h1>
            <div className="legal-updated">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>

          <div className="legal-body">
            <p className="legal-intro">
              Welcome to <strong style={{color: '#c7d2fe'}}>TeraLink</strong>. By accessing or using our website, you agree to comply with and be bound by the following terms and conditions. Please read them carefully. If you disagree with any part of these terms, please discontinue use of our service immediately.
            </p>

            <div className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">1</span>
                Description of Service
              </h2>
              <p className="legal-p">
                TeraLink provides a web-based utility tool designed to parse and stream publicly shared video and file links from the cloud storage service TeraBox. The service is provided purely as a convenient streaming and download interface. We:
              </p>
              <ul className="legal-ul">
                <li className="legal-li">Do not host, store, or modify any files processed through our platform.</li>
                <li className="legal-li">Act solely as a proxy and player for publicly accessible, user-shared TeraBox links.</li>
                <li className="legal-li">Do not require user accounts, registration, or payment of any kind.</li>
              </ul>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">2</span>
                Permitted Use
              </h2>
              <p className="legal-p">
                You agree to use TeraLink only for lawful, personal, and non-commercial purposes. By using this service, you confirm that:
              </p>
              <ul className="legal-ul">
                <li className="legal-li">You are solely responsible for ensuring that the content you stream or download does not violate any copyright, trademark, or intellectual property laws.</li>
                <li className="legal-li">You will not use TeraLink for any illegal activity, distribution of malware, or unauthorized access.</li>
                <li className="legal-li">You will not attempt to reverse-engineer, scrape, or exploit our infrastructure in any way that could harm other users.</li>
              </ul>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">3</span>
                Disclaimers and Limitations of Liability
              </h2>
              <p className="legal-p">
                TeraLink is provided on an &quot;as is&quot; and &quot;as available&quot; basis without any warranties of any kind, either express or implied. We do not warrant that the service will be uninterrupted, error-free, or free from viruses or other harmful components.
              </p>
              <p className="legal-p">
                TeraLink is not affiliated, associated, authorized, endorsed by, or in any way officially connected with TeraBox, Flextech Inc., or any of their subsidiaries or affiliates. The official TeraBox website can be found at <span style={{color: '#a5b4fc'}}>https://www.terabox.com</span>.
              </p>
              <p className="legal-p">
                Under no circumstances shall TeraLink be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use of, or inability to use, our service.
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">4</span>
                Links to Third-Party Sites
              </h2>
              <p className="legal-p">
                Our service may redirect to third-party web sites or services (such as TeraBox CDN servers) that are not owned or controlled by TeraLink. We have no control over, and assume no responsibility for, the content, privacy policies, or practices of any third-party websites or services. We encourage you to review the terms and privacy policy of any third-party sites you visit.
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">5</span>
                Intellectual Property
              </h2>
              <p className="legal-p">
                All content shared via TeraBox links belongs to their respective copyright owners. TeraLink does not claim ownership of any files processed through our service. Users are responsible for ensuring they have the right to access and download any content they interact with through our platform.
              </p>
            </div>

            <div className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">6</span>
                Changes to Terms
              </h2>
              <p className="legal-p">
                We reserve the right, at our sole discretion, to modify or replace these Terms at any time. Changes will be effective immediately upon posting. By continuing to access or use our website after those revisions become effective, you agree to be bound by the revised terms. We encourage you to review this page periodically.
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
