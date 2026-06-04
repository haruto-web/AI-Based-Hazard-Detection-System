import '../styles/AboutPage.css';

export default function AboutPage() {
  return (
    <div className="about-page">
      {/* Hero Section */}
      <section className="about-hero">
        <h1 className="about-hero-title">HAZORA</h1>
        <p className="about-hero-subtitle">
          An IoT-Based Hazard Detection System with AI Integration for Construction Site Safety
        </p>
        <p className="about-hero-org">Developed for ArchEn Inc.</p>
      </section>

      {/* Introduction */}
      <section className="about-section">
        <h2>About the Project</h2>
        <p>
          HAZORA is an intelligent safety monitoring system designed to improve hazard detection and workplace safety management in construction environments. It integrates ESP32-CAM devices, MQ-135 gas sensors, Artificial Intelligence, and Computer Vision technologies to detect hazards such as missing PPE, unsafe worker behavior, smoke or gas presence, and hazardous environmental conditions.
        </p>
        <p>
          Through this web-based monitoring platform, the system provides real-time hazard detection, notifications, safety recommendations, and data recording features to support site engineers, safety officers, and administrators in managing workplace safety more effectively.
        </p>
      </section>

      {/* System Flow */}
      <section className="about-section">
        <h2>System Flow</h2>
        <div className="system-flow">
          <div className="flow-track">
            <h3>Visual Hazard Detection</h3>
            <div className="flow-steps">
              <div className="flow-step">
                <div className="flow-step-icon">
                  <svg viewBox="0 0 24 24"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                </div>
                <span>ESP32-CAM captures image/video</span>
              </div>
              <div className="flow-arrow"></div>
              <div className="flow-step">
                <div className="flow-step-icon">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                </div>
                <span>AI Detection processes frames</span>
              </div>
              <div className="flow-arrow"></div>
              <div className="flow-step">
                <div className="flow-step-icon">
                  <svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </div>
                <span>Detects: Hard hat, No hard hat, Safety vest, Safety shoes</span>
              </div>
              <div className="flow-arrow"></div>
              <div className="flow-step">
                <div className="flow-step-icon">
                  <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                </div>
                <span>Results sent to Web Dashboard with notifications and alerts</span>
              </div>
            </div>
          </div>

          <div className="flow-track">
            <h3>Environmental Monitoring</h3>
            <div className="flow-steps">
              <div className="flow-step">
                <div className="flow-step-icon">
                  <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/></svg>
                </div>
                <span>ESP32 Module with MQ-135 Gas Sensor</span>
              </div>
              <div className="flow-arrow"></div>
              <div className="flow-step">
                <div className="flow-step-icon">
                  <svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                </div>
                <span>Detects harmful gases: Ammonia, Nitrogen Oxides, Benzene, Smoke, CO2</span>
              </div>
              <div className="flow-arrow"></div>
              <div className="flow-step">
                <div className="flow-step-icon">
                  <svg viewBox="0 0 24 24"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <span>Triggers buzzer alarm and sends data to Website/App</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Objectives */}
      <section className="about-section">
        <h2>Project Objectives</h2>
        <div className="objectives">
          <div className="objective-card">
            <h4>General Objective</h4>
            <p>
              To design, develop, implement, and evaluate HAZORA — an IoT-Based Hazard Detection System with AI Integration that utilizes IoT devices, AI, and computer vision technologies to detect construction site hazards, provide real-time monitoring, and support workplace safety management.
            </p>
          </div>
          <div className="objective-card">
            <h4>Design & Develop</h4>
            <p>
              To design and develop an IoT-based hazard detection prototype integrating ESP32-CAM devices, MQ-135 gas sensors, AI, and computer vision for monitoring hazards in construction site environments.
            </p>
          </div>
          <div className="objective-card">
            <h4>Implement</h4>
            <p>
              To implement the HAZORA system at ArchEn Inc. by enabling real-time hazard detection, safety monitoring, notification, and reporting through a web-based platform for site engineers, safety officers, and administrators.
            </p>
          </div>
          <div className="objective-card">
            <h4>Evaluate</h4>
            <p>
              To evaluate performance, functionality, and usability in terms of hazard detection accuracy, real-time monitoring capability, and user acceptability within ArchEn Inc.
            </p>
          </div>
        </div>
      </section>

      {/* Technologies */}
      <section className="about-section">
        <h2>Technologies Used</h2>
        <div className="tech-grid">
          <div className="tech-item">
            <h4>Hardware</h4>
            <ul>
              <li>ESP32-CAM (Camera Module)</li>
              <li>MQ-135 Gas Sensor</li>
              <li>Buzzer Alarm</li>
              <li>ESP32 Microcontroller</li>
            </ul>
          </div>
          <div className="tech-item">
            <h4>Software & AI</h4>
            <ul>
              <li>TensorFlow.js (AI Detection)</li>
              <li>Computer Vision (PPE Detection)</li>
              <li>React 19 (Web Dashboard)</li>
              <li>Firebase (Auth & Database)</li>
            </ul>
          </div>
          <div className="tech-item">
            <h4>Communication</h4>
            <ul>
              <li>Wi-Fi (ESP32 to Network)</li>
              <li>MJPEG Streaming (Port 81)</li>
              <li>HTTP REST API</li>
              <li>Real-time Notifications</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Footer note */}
      <section className="about-section about-footer-note">
        <p>Technological Institute of the Philippines</p>
        <p>Capstone Project 2025-2026</p>
      </section>
    </div>
  );
}
