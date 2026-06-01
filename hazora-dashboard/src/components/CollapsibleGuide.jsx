import { useState, useRef } from 'react';
import '../styles/CollapsibleGuide.css';

export default function CollapsibleGuide({ title, defaultOpen = false, children }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef(null);

  function toggle() {
    setIsOpen((prev) => !prev);
  }

  return (
    <div className="collapsible-guide">
      <button
        className="collapsible-header"
        onClick={toggle}
        aria-expanded={isOpen}
      >
        <span className="collapsible-title">{title}</span>
        <span className={`chevron ${isOpen ? 'open' : ''}`}>
          {isOpen ? '▼' : '▶'}
        </span>
      </button>
      <div
        ref={contentRef}
        className={`collapsible-content ${isOpen ? 'expanded' : 'collapsed'}`}
        role="region"
        aria-label={title}
      >
        {children}
      </div>
    </div>
  );
}
