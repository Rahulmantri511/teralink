import Link from 'next/link';

export const metadata = {
  title: "Contact Us — TeraLink",
  description: "Get in touch with TeraLink. Our support contact options for customer queries and merchant billing relations.",
  alternates: { canonical: "https://teralink.in/contact" },
  openGraph: {
    title: "Contact Us — TeraLink",
    description: "Contact TeraLink for support, billing, or general queries.",
    url: "https://teralink.in/contact",
    type: "website",
  },
  twitter: { card: "summary", title: "Contact Us — TeraLink", description: "Reach out to the TeraLink support team." },
  robots: { index: true, follow: true },
};

export default function ContactUs() {
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
        .contact-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        .legal-body {
          background: rgba(17, 20, 34, 0.65);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 32px;
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
        .legal-h2 {
          font-size: 1.1rem;
          font-weight: 700;
          color: #e2e4f0;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .legal-p {
          font-size: 0.92rem;
          line-height: 1.8;
          color: rgba(255,255,255,0.65);
          margin-bottom: 24px;
        }
        .info-card {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .info-item {
          display: flex;
          gap: 12px;
          font-size: 0.9rem;
          color: rgba(255,255,255,0.7);
        }
        .info-icon {
          color: #6366f1;
          font-size: 1.1rem;
          flex-shrink: 0;
          width: 20px;
        }
        .info-label {
          font-weight: 600;
          color: #fff;
          margin-bottom: 4px;
        }
        .info-value {
          line-height: 1.6;
        }
        .contact-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .input-group label {
          font-size: 0.82rem;
          font-weight: 500;
          color: rgba(255,255,255,0.5);
        }
        .input-group input, .input-group textarea {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 10px 14px;
          color: #fff;
          font-size: 0.9rem;
          font-family: inherit;
          transition: all 0.2s;
        }
        .input-group input:focus, .input-group textarea:focus {
          outline: none;
          border-color: #6366f1;
          background: rgba(99,102,241,0.03);
        }
        .send-btn {
          background: linear-gradient(135deg, #6366f1, #a855f7);
          border: none;
          border-radius: 10px;
          color: #fff;
          padding: 12px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }
        .send-btn:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
        @media (max-width: 768px) {
          .contact-grid {
            grid-template-columns: 1fr;
            gap: 32px;
          }
        }
      `}</style>

      <main className="legal-page" role="main">
        <div className="legal-container">
          <Link href="/" className="back-btn">
            ← Back to Player
          </Link>

          <header className="legal-header">
            <div className="legal-badge">Get in Touch</div>
            <h1 className="legal-h1">Contact Us</h1>
          </header>

          <div className="contact-grid">
            <div className="legal-body">
              <h2 className="legal-h2">Business Identity</h2>
              <p className="legal-p">
                For partnerships, payment inquiries, support issues, or legal matters, please reach out to us using the details below. We aim to respond within 24–48 hours.
              </p>

              <div className="info-card">
                <div className="info-item">
                  <span className="info-icon">👤</span>
                  <div>
                    <div className="info-label">Merchant / Entity Name</div>
                    <div className="info-value">Rahul Dilipbhai Mantri</div>
                  </div>
                </div>

                <div className="info-item">
                  <span className="info-icon">📍</span>
                  <div>
                    <div className="info-label">Registered Office Address</div>
                    <div className="info-value">
                      105, Shanti Niketan Apartments, Near Civil Lines Metro Station,<br />
                      Civil Lines, Jaipur, Rajasthan, 302006, India
                    </div>
                  </div>
                </div>

                <div className="info-item">
                  <span className="info-icon">✉️</span>
                  <div>
                    <div className="info-label">Customer Support Email</div>
                    <div className="info-value">rahulmantri2002@gmail.com</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="legal-body">
              <h2 className="legal-h2">Send Support Message</h2>
              <form className="contact-form" onSubmit={(e) => e.preventDefault()}>
                <div className="input-group">
                  <label htmlFor="user-name">Your Name</label>
                  <input type="text" id="user-name" required placeholder="John Doe" />
                </div>

                <div className="input-group">
                  <label htmlFor="user-email">Your Email</label>
                  <input type="email" id="user-email" required placeholder="john@example.com" />
                </div>

                <div className="input-group">
                  <label htmlFor="user-msg">Message / Support Query</label>
                  <textarea id="user-msg" rows={4} required placeholder="Explain your query..." />
                </div>

                <button type="submit" className="send-btn">Send Support Message</button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
