import Link from 'next/link';

export const metadata = {
  title: "About Us — TeraLink",
  description: "Learn more about TeraLink, our mission to simplify cloud storage streaming, and the SaaS productivity features we offer for users and developers.",
  alternates: { canonical: "https://teralink.in/about" },
  openGraph: {
    title: "About Us — TeraLink",
    description: "Learn more about TeraLink, our mission to simplify cloud storage streaming, and the features we offer.",
    url: "https://teralink.in/about",
    type: "website",
  },
  twitter: { card: "summary", title: "About Us — TeraLink", description: "Learn more about TeraLink and our mission." },
  robots: { index: true, follow: true },
};

export default function AboutUs() {
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
        .legal-section {
          margin-bottom: 32px;
        }
        .legal-section:last-child { margin-bottom: 0; }
        .legal-h2 {
          font-size: 1.1rem;
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
          font-size: 0.92rem;
          line-height: 1.8;
          color: rgba(255,255,255,0.65);
          margin-bottom: 16px;
        }
        .legal-p:last-child { margin-bottom: 0; }
        .legal-ul {
          list-style: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }
        .legal-li {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 0.92rem;
          line-height: 1.7;
          color: rgba(255,255,255,0.65);
        }
        .legal-li::before {
          content: '✓';
          color: #34d399;
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
        }
        .footer-note-link:hover {
          color: #a5b4fc;
          text-decoration: underline;
        }
      `}</style>

      <main className="legal-page" role="main">
        <div className="legal-container">
          <Link href="/" className="back-btn">
            ← Back to Player
          </Link>

          <header className="legal-header">
            <div className="legal-badge">SaaS Utility Profile</div>
            <h1 className="legal-h1">About Us</h1>
          </header>

          <article className="legal-body">
            <section className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">1</span> What is TeraLink?
              </h2>
              <p className="legal-p">
                TeraLink is a cloud-based link management and personal media organization utility designed to simplify how users catalog, verify, and stream their own publicly shared cloud media files. Built as a SaaS workflow helper, our platform resolves public cloud storage link structures, detects file types, and allows high-definition browser-based media organization.
              </p>
              <p className="legal-p">
                Our technology is designed for productivity, allowing individuals and team members to access media directly in their browsers without installing third-party client apps, avoiding slow loading speeds, and optimizing the streaming layout.
              </p>
            </section>

            <section className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">2</span> What We Do &amp; Supported Features
              </h2>
              <p className="legal-p">
                TeraLink works as a metadata interpreter and link utility. Here is what we offer as part of our core subscription and support services:
              </p>
              <ul className="legal-ul">
                <li className="legal-li">
                  <strong>Metadata Extraction:</strong> Resolving cloud folders to analyze structure, sizes, and file types.
                </li>
                <li className="legal-li">
                  <strong>Advanced Media Optimizer:</strong> Encoding streams using standard HLS formats to allow responsive playback on Android, iOS, and PC.
                </li>
                <li className="legal-li">
                  <strong>Workflow Acceleration:</strong> Resolving links through high-speed cloud queues to reduce processing times.
                </li>
                <li className="legal-li">
                  <strong>Premium API Integration:</strong> Offering usage-based data fetch APIs for developers who want to integrate link metadata resolution in their own tools.
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">3</span> What Users Pay For
              </h2>
              <p className="legal-p">
                While the basic link processing is free, our premium subscription plans offer distinct value-added features for power users and developers:
              </p>
              <ul className="legal-ul">
                <li className="legal-li">
                  <strong>Priority Queue Processing:</strong> Bypassing wait times during peak traffic hours.
                </li>
                <li className="legal-li">
                  <strong>Batch Processing:</strong> Uploading and resolving multiple links at once.
                </li>
                <li className="legal-li">
                  <strong>Ad-Free Experience:</strong> Using our platform interface completely free of display ads.
                </li>
                <li className="legal-li">
                  <strong>API Tokens:</strong> Credits to query our high-speed parsing API from external applications.
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">4</span> Business Operations &amp; Identity
              </h2>
              <p className="legal-p">
                TeraLink is operated as a software-as-a-service (SaaS) provider. We are committed to transparency, compliance, and strict adhere to terms of service of both cloud platforms and payment gateways. 
              </p>
              <p className="legal-p">
                For customer support, billing inquiries, or data protection questions, please visit our <Link href="/contact" style={{color:'#a5b4fc',textDecoration:'underline'}}>Contact Page</Link> or email us at **rahulmantri2002@gmail.com**.
              </p>
            </section>

            <div className="footer-note">
              <span className="footer-note-text">© {new Date().getFullYear()} TeraLink. All rights reserved.</span>
              <Link href="/" className="footer-note-link">Back to home</Link>
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
