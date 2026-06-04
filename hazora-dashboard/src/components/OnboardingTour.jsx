import { useState, useEffect, useCallback } from 'react';
import '../styles/OnboardingTour.css';

const TOUR_STEPS = [
  {
    target: '[aria-label="Dashboard navigation"]',
    title: 'Welcome to HAZORA',
    content: 'This is your AI-Based Hazard Detection System dashboard. The sidebar lets you navigate between all major sections: Analytics Dashboard, Live Camera Streams, Safety Reports, and your Profile settings.',
    position: 'right',
  },
  {
    target: '.sidebar-nav-btn.active',
    title: 'Analytics Dashboard',
    content: 'The Dashboard shows your safety overview at a glance: total detected workers, hard hat compliance rate, violation counts, gas/smoke alerts, most common hazards, safety performance charts, and a full incident log with timestamps.',
    position: 'right',
  },
  {
    target: '.sidebar-nav-item:nth-child(2) .sidebar-nav-btn',
    title: 'Live Streams',
    content: 'Monitor up to 3 ESP32-CAM feeds in real time. Each stream box has its own IP input — just enter the camera IP and connect. You can run AI detection (person counting, face detection) on any active stream.',
    position: 'right',
  },
  {
    target: '.sidebar-nav-item:nth-child(3) .sidebar-nav-btn',
    title: 'Reports',
    content: 'View, generate, and download safety reports. Filter by site and time period. Export as PDF for printing or CSV for data analysis. Reports include incident summaries, compliance rates, and violation breakdowns.',
    position: 'right',
  },
  {
    target: '.search-input',
    title: 'Quick Search',
    content: 'Search across the entire system — find specific cameras, incidents, reports, or settings instantly from any page.',
    position: 'bottom',
  },
  {
    target: '.theme-toggle-btn',
    title: 'Dark / Light Mode',
    content: 'Toggle between dark mode (for low-light monitoring environments) and light mode (for office use). Your preference is saved automatically.',
    position: 'bottom',
  },
  {
    target: '.notif-btn',
    title: 'Real-Time Notifications',
    content: 'Receive instant alerts when PPE violations are detected — no hard hat, missing vest, or safety shoes. The orange badge shows your unread alert count. Click to view details and mark as read.',
    position: 'bottom',
  },
  {
    target: '.profile-btn',
    title: 'Profile & Account',
    content: 'View your profile, edit your name/phone/role, or logout. Your access level is determined by your role (Site Officer, Manager, HSE Head, etc.) — some features may be view-only depending on your position.',
    position: 'bottom-left',
  },
  {
    target: '.export-btn',
    title: 'Export Safety Reports',
    content: 'Generate downloadable reports from your analytics data. Choose PDF (for printing and sharing with stakeholders) or CSV (for spreadsheet analysis). Reports include all incidents within your selected time period.',
    position: 'bottom',
  },
  {
    target: '.app-footer',
    title: 'Need Help?',
    content: 'The footer contains contact information for the development team. Reach out via email or phone if you need technical support or have questions about the system.',
    position: 'top',
  },
];

export default function OnboardingTour({ userId, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [isVisible, setIsVisible] = useState(true);

  const findTarget = useCallback(() => {
    const step = TOUR_STEPS[currentStep];
    if (!step) return null;

    // Try each selector (comma-separated fallback)
    const selectors = step.target.split(',').map(s => s.trim());
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }, [currentStep]);

  useEffect(() => {
    function updatePosition() {
      const el = findTarget();
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
        // Scroll element into view if needed
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        setTargetRect(null);
      }
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    const interval = setInterval(updatePosition, 500); // re-check in case layout shifts

    return () => {
      window.removeEventListener('resize', updatePosition);
      clearInterval(interval);
    };
  }, [currentStep, findTarget]);

  function handleNext() {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  }

  function handleSkip() {
    handleFinish();
  }

  function handleFinish() {
    setIsVisible(false);
    try {
      localStorage.setItem(`hazora_tour_completed_${userId}`, 'true');
    } catch {
      // localStorage unavailable
    }
    onComplete?.();
  }

  if (!isVisible) return null;

  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;

  // Calculate tooltip position
  let tooltipStyle = {};
  if (targetRect) {
    const padding = 12;
    switch (step.position) {
      case 'right':
        tooltipStyle = {
          top: targetRect.top + targetRect.height / 2,
          left: targetRect.right + padding,
          transform: 'translateY(-50%)',
        };
        break;
      case 'bottom':
        tooltipStyle = {
          top: targetRect.bottom + padding,
          left: targetRect.left + targetRect.width / 2,
          transform: 'translateX(-50%)',
        };
        break;
      case 'bottom-left':
        tooltipStyle = {
          top: targetRect.bottom + padding,
          left: targetRect.right,
          transform: 'translateX(-100%)',
        };
        break;
      case 'top':
        tooltipStyle = {
          top: targetRect.top - padding,
          left: targetRect.left + targetRect.width / 2,
          transform: 'translate(-50%, -100%)',
        };
        break;
      default:
        tooltipStyle = {
          top: targetRect.bottom + padding,
          left: targetRect.left + targetRect.width / 2,
          transform: 'translateX(-50%)',
        };
    }
  }

  return (
    <div className="onboarding-overlay">
      {/* Spotlight cutout on the target */}
      {targetRect && (
        <div
          className="onboarding-spotlight"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        />
      )}

      {/* Tooltip */}
      <div className="onboarding-tooltip" style={tooltipStyle}>
        <div className="onboarding-tooltip-header">
          <h4>{step.title}</h4>
          <span className="onboarding-step-count">
            {currentStep + 1} / {TOUR_STEPS.length}
          </span>
        </div>
        <p className="onboarding-tooltip-content">{step.content}</p>
        <div className="onboarding-tooltip-actions">
          <button className="onboarding-skip-btn" onClick={handleSkip}>
            Skip Tour
          </button>
          <button className="onboarding-next-btn" onClick={handleNext}>
            {isLast ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
