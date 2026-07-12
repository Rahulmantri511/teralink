import Link from 'next/link';

export const metadata = {
  title: "Cancellation & Refund Policy — TeraLink",
  description: "Read the Cancellation & Refund Policy for TeraLink subscriptions. Understand our terms regarding digital items, cancellations, and refund request processing.",
  alternates: { canonical: "https://teralink.in/refund" },
  openGraph: {
    title: "Cancellation & Refund Policy — TeraLink",
    description: "TeraLink's refund policy for the Premium Monthly Pass subscription.",
    url: "https://teralink.in/refund",
    type: "website",
  },
  twitter: { card: "summary", title: "Cancellation & Refund Policy — TeraLink", description: "TeraLink's refund and cancellation policy." },
  robots: { index: true, follow: true },
};

export default function CancellationAndRefund() {
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
            <div className="legal-badge">SaaS Billing Terms</div>
            <h1 className="legal-h1">Cancellation &amp; Refund Policy</h1>
          </header>

          <article className="legal-body">
            <section className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">1</span> Subscriptions &amp; Cancellations
              </h2>
              <p className="legal-p">
                All premium accounts on TeraLink are billed on a subscription basis (recurring monthly/annual billing) or a usage credit basis. You have the right to cancel your premium subscription at any time.
              </p>
              <p className="legal-p">
                Upon cancellation of a recurring subscription, your account will remain premium until the end of the current billing cycle. No further recurring charges will be made.
              </p>
            </section>

            <section className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">2</span> Refund Eligibility
              </h2>
              <p className="legal-p">
                Since TeraLink offers digital SaaS processing credits and includes a **free 5-play daily usage limit**, we encourage all users to thoroughly test our service before upgrading. 
              </p>
              <p className="legal-p">
                Our refund terms are as follows:
              </p>
              <ul className="legal-ul">
                <li className="legal-li">
                  <strong>Technical Failures:</strong> If a payment is successfully charged but the premium credits or subscription features fail to activate on your account due to a system error, you are eligible for a full refund.
                </li>
                <li className="legal-li">
                  <strong>7-Day Request Window:</strong> Refund claims must be submitted to our support team within 7 days of the transaction date.
                </li>
                <li className="legal-li">
                  <strong>Unused Credits:</strong> Refunds will only be approved if the user has not resolved any links or consumed any premium API limits under the active billing period.
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">3</span> How to Request a Refund
              </h2>
              <p className="legal-p">
                To request a refund, please send an email to **rahulmantri2002@gmail.com** with the subject line "Refund Request - TeraLink". Please include the following details:
              </p>
              <ul className="legal-ul">
                <li className="legal-li">Your registered email address.</li>
                <li className="legal-li">Transaction ID (e.g. Razorpay Payment ID).</li>
                <li className="legal-li">Date and amount of the transaction.</li>
                <li className="legal-li">A brief description of why you are requesting a refund.</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2 className="legal-h2">
                <span className="section-number">4</span> Processing and Timeline
              </h2>
              <p className="legal-p">
                Once approved, refunds are processed automatically by our billing partner (e.g. Razorpay). The funds will be credited back to your original payment method (Credit/Debit Card, UPI, Netbanking, or Wallet) within **5 to 7 working days**, depending on your bank's processing cycles.
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
