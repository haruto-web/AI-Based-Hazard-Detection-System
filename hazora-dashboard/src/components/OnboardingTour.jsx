import { useState, useEffect, useCallback } from 'react';
import '../styles/OnboardingTour.css';

const TOUR_STEPS = [
  {
    target: '[aria-label="Dashboard navigation"]',
    title: 'Sidebar Navigation',
    content: 'Use the sidebar to switch between Dashboard, Live Streams, Reports, and your Profile.',
    position: 'right',
  },
  {
    target: '.sidebar-nav-btn.active',
    title: 'Active Page',
    content: 'The highlighted item shows which page you are currently on.',
    position: 'right',
  },
  {
    target: '.search-input',
    title: 'Search',
    content: 'Quickly search for cameras, reports, or settings from anywhere.',
    position: 'bottom',
  },
  {
    target: '.theme-toggle-btn',
    title: 'Theme Toggle',
    content: 'Switch between dark and light mode to suit your preference.',
    position: 'bottom',
  },
  {
    target: '.notif-btn',
    title: 'Notifications',
    content: 'Get real-time alerts when PPE violations are detected. The badge shows unread count.',
    position: 'bottom',
  },
  {
    target: '.profile-btn',
    title: 'Your Profile',
    content: 'Access your profile settings or logout from here.',
    position: 'bottom-left',
  },
  {
    target: '.analytics-title, .streams-view, .reports-page-title',
    title: 'Main Content',
    content: 'This is where your analytics, live camera feeds, or reports are displayed depending on the selected page.',
    position: 'top',
  },
  {
    target: '.export-btn',
    title: 'Export Reports',
    content: 'Export your safety data as PDF or CSV for offline records and sharing with stakeholders.',
    position: 'bottom',
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
