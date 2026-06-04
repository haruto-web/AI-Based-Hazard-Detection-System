import '../styles/Footer.css';

const TEAM = [
  {
    name: 'Jaycee Thea Guarino',
    email: 'mjtguarino@tip.edu.ph',
    phone: '0915-648-2883',
  },
  {
    name: 'Antonio Jr. Nerida',
    email: 'majnerida@tip.edu.ph',
    phone: '0956-639-1688',
  },
  {
    name: 'Ven Andrew Mirasol',
    email: 'mvamirasol@tip.edu.ph',
    phone: '0992-149-7659',
  },
];

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-brand">
          <h3 className="footer-logo">HAZORA</h3>
          <p className="footer-tagline">AI-Based Hazard Detection System</p>
          <p className="footer-copyright">&copy; {currentYear} Hazora. All rights reserved.</p>
        </div>

        <div className="footer-team">
          <h4 className="footer-section-title">Development Team</h4>
          <div className="footer-team-grid">
            {TEAM.map((member) => (
              <div key={member.email} className="footer-member">
                <span className="member-name">{member.name}</span>
                <a href={`mailto:${member.email}`} className="member-email">{member.email}</a>
                <a href={`tel:${member.phone.replace(/-/g, '')}`} className="member-phone">{member.phone}</a>
              </div>
            ))}
          </div>
        </div>

        <div className="footer-links">
          <h4 className="footer-section-title">Quick Links</h4>
          <ul>
            <li>Dashboard</li>
            <li>Live Streams</li>
            <li>Reports</li>
            <li>Profile</li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <p>Technological Institute of the Philippines</p>
      </div>
    </footer>
  );
}
