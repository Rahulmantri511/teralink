"use client";

interface GuestLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginClick: () => void;
}

export default function GuestLimitModal({ isOpen, onClose, onLoginClick }: GuestLimitModalProps) {
  if (!isOpen) return null;

  return (
    <div className="limit-overlay" onClick={onClose}>
      <div className="limit-modal" onClick={(e) => e.stopPropagation()}>
        <button className="limit-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="limit-icon">⚡</div>

        <h2>Play Limit Reached</h2>
        
        <p className="limit-desc">
          Guests can watch up to <strong>5 videos or downloads</strong>. Create a free account to continue streaming with no limits.
        </p>

        <div className="limit-features">
          <div className="feature-item">
            <span className="check">✓</span>
            <div>
              <strong>Unlimited plays:</strong> Stream files of any size without restriction.
            </div>
          </div>
          <div className="feature-item">
            <span className="check">✓</span>
            <div>
              <strong>High-speed downloads:</strong> Unlimited high-speed direct links.
            </div>
          </div>
          <div className="feature-item">
            <span className="check">✓</span>
            <div>
              <strong>Cloud streaming:</strong> Optimized player for Android, iOS & PC.
            </div>
          </div>
        </div>

        <button className="create-acc-btn" onClick={() => {
          onClose();
          onLoginClick();
        }}>
          Register / Log In Free
        </button>

        <button className="maybe-later-btn" onClick={onClose}>
          Maybe Later
        </button>
      </div>

      <style jsx>{`
        .limit-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: rgba(4, 5, 12, 0.85);
          backdrop-filter: blur(16px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.25s ease-out;
        }

        .limit-modal {
          background: #111422;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          width: 100%;
          max-width: 440px;
          padding: 32px;
          position: relative;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
          text-align: center;
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .limit-close {
          position: absolute;
          top: 20px;
          right: 20px;
          background: none;
          border: none;
          color: #9499ba;
          cursor: pointer;
          padding: 8px;
          border-radius: 50%;
          transition: all 0.2s;
        }

        .limit-close:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
        }

        .limit-icon {
          font-size: 3rem;
          color: #6366f1;
          background: rgba(99, 102, 241, 0.1);
          width: 80px;
          height: 80px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          border: 1px solid rgba(99, 102, 241, 0.2);
        }

        .limit-modal h2 {
          font-size: 1.6rem;
          font-weight: 800;
          color: #fff;
          margin-bottom: 12px;
        }

        .limit-desc {
          font-size: 0.95rem;
          color: #9499ba;
          line-height: 1.5;
          margin-bottom: 24px;
        }

        .limit-desc strong {
          color: #fff;
        }

        .limit-features {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 16px;
          padding: 16px;
          text-align: left;
          margin-bottom: 24px;
        }

        .feature-item {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
          font-size: 0.88rem;
          color: #e2e4f0;
          line-height: 1.4;
        }

        .feature-item:last-child {
          margin-bottom: 0;
        }

        .feature-item strong {
          color: #fff;
        }

        .check {
          color: #34d399;
          font-weight: 700;
        }

        .create-acc-btn {
          width: 100%;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          border: none;
          border-radius: 14px;
          color: #fff;
          padding: 14px;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 12px;
        }

        .create-acc-btn:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }

        .maybe-later-btn {
          width: 100%;
          background: none;
          border: none;
          color: #9499ba;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          padding: 8px;
          transition: all 0.2s;
        }

        .maybe-later-btn:hover {
          color: #fff;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
