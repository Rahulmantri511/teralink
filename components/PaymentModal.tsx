"use client";

import { useState } from "react";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

export default function PaymentModal({ isOpen, onClose }: PaymentModalProps) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleCheckout = () => {
    setLoading(true);
    // Redirect to our Next.js checkout endpoint which redirects to Polar
    window.location.href = "/checkout?products=457a782c-87b2-4e63-9479-f3bfb0cba897";
  };

  return (
    <div className="pay-overlay" onClick={onClose}>
      <div className="pay-modal" onClick={(e) => e.stopPropagation()}>
        <button className="pay-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="pay-header">
          <div className="pay-logo">👑 TeraLink Premium</div>
          <h2>Upgrade Your Experience</h2>
          <p>Get high-speed direct downloads and unlimited video streaming.</p>
        </div>

        <div className="features-grid">
          <div className="feature-item">
            <span className="feature-icon">⚡</span>
            <div>
              <strong>Super Fast Streaming</strong>
              <p>High-speed CDNs for buffer-free HD video playback.</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon">👑</span>
            <div>
              <strong>Unlimited Plays</strong>
              <p>No daily or lifetime limits. Resolve files as much as you want.</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon">📁</span>
            <div>
              <strong>Large File Support</strong>
              <p>Stream and download files larger than 1GB easily.</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🚫</span>
            <div>
              <strong>Zero Advertisements</strong>
              <p>Clean, distraction-free environment for your files.</p>
            </div>
          </div>
        </div>

        <div className="plans-list">
          <div className="plan-card active-plan">
            <div className="plan-badge">POPULAR</div>
            <h3>Premium Monthly Pass</h3>
            <div className="plan-price">
              <span>₹60</span>
              <small>/ month</small>
            </div>
            <p>30 Days of full unlimited access to all features.</p>
            <button className="upgrade-btn" onClick={handleCheckout} disabled={loading}>
              {loading ? "Redirecting to Checkout..." : "Get Monthly Access"}
            </button>
          </div>
        </div>

        <div className="polar-badge-container">
          <span className="secure-badge">🔒 Secure Payment via Polar.sh</span>
        </div>

        <style>{`
          .pay-overlay {
            position: fixed;
            inset: 0;
            background: rgba(10, 11, 18, 0.85);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            animation: fadeIn 0.2s ease-out;
            padding: 16px;
          }

          .pay-modal {
            background: #111422;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 24px;
            width: 100%;
            max-width: 480px;
            max-height: 95vh;
            overflow-y: auto;
            padding: 32px;
            position: relative;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
            animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            text-align: center;
          }

          .pay-close {
            position: absolute;
            top: 20px;
            right: 20px;
            background: none;
            border: none;
            color: #9499ba;
            cursor: pointer;
            padding: 8px;
            font-size: 1.1rem;
            transition: all 0.2s;
          }

          .pay-close:hover {
            color: #fff;
          }

          .pay-header {
            margin-bottom: 24px;
          }

          .pay-logo {
            font-size: 1rem;
            font-weight: 700;
            color: #6366f1;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 8px;
          }

          .pay-header h2 {
            font-size: 1.5rem;
            font-weight: 800;
            color: #fff;
            margin-bottom: 6px;
          }

          .pay-header p {
            font-size: 0.88rem;
            color: #9499ba;
            line-height: 1.4;
          }

          .features-grid {
            display: flex;
            flex-direction: column;
            gap: 16px;
            text-align: left;
            margin-bottom: 28px;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.04);
            border-radius: 16px;
            padding: 16px;
          }

          .feature-item {
            display: flex;
            gap: 12px;
            align-items: flex-start;
          }

          .feature-icon {
            font-size: 1.25rem;
            flex-shrink: 0;
            margin-top: 2px;
          }

          .feature-item strong {
            display: block;
            font-size: 0.85rem;
            color: #fff;
            margin-bottom: 2px;
          }

          .feature-item p {
            font-size: 0.78rem;
            color: #9499ba;
            line-height: 1.3;
          }

          .plans-list {
            margin-bottom: 20px;
          }

          .plan-card {
            background: rgba(99, 102, 241, 0.04);
            border: 1px solid rgba(99, 102, 241, 0.25);
            border-radius: 18px;
            padding: 24px 20px;
            position: relative;
          }

          .plan-badge {
            position: absolute;
            top: -12px;
            left: 50%;
            transform: translateX(-50%);
            background: #6366f1;
            color: #fff;
            font-size: 0.65rem;
            font-weight: 800;
            padding: 4px 10px;
            border-radius: 100px;
            letter-spacing: 0.05em;
          }

          .plan-card h3 {
            font-size: 1rem;
            color: #fff;
            margin-bottom: 8px;
          }

          .plan-price {
            font-size: 2rem;
            font-weight: 800;
            color: #fff;
            margin-bottom: 8px;
          }

          .plan-price small {
            font-size: 0.85rem;
            color: #9499ba;
            font-weight: 400;
          }

          .plan-card p {
            font-size: 0.8rem;
            color: #9499ba;
            margin-bottom: 18px;
          }

          .upgrade-btn {
            width: 100%;
            background: linear-gradient(135deg, #6366f1, #a855f7);
            border: none;
            border-radius: 12px;
            color: #fff;
            padding: 12px;
            font-weight: 700;
            font-size: 0.95rem;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
          }

          .upgrade-btn:hover {
            transform: translateY(-1px);
            filter: brightness(1.1);
            box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
          }

          .upgrade-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
            filter: none;
          }

          .polar-badge-container {
            font-size: 0.72rem;
            color: #9499ba;
          }

          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes slideUp {
            from { transform: translateY(15px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }

          @media (max-width: 480px) {
            .pay-modal {
              padding: 24px 16px;
            }
            .features-grid {
              padding: 12px;
              gap: 12px;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
