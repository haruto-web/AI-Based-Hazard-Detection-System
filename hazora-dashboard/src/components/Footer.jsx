import '../styles/Footer.css';

const TEAM = [
  { name: 'Jaycee Thea Guarino', email: 'mjtguarino@tip.edu.ph', phone: '0915-648-2883' },
  { name: 'Antonio Jr. Nerida', email: 'majnerida@tip.edu.ph', phone: '0956-639-1688' },
  { name: 'Ven Andrew Mirasol', email: 'mvamirasol@tip.edu.ph', phone: '0992-149-7659' },
];

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="footer-row">
        <span className="footer-brand-text">HAZORA</span>
        <span className="footer-divider"></span>
        <div className="footer-team-inline">
          {TEAM.map((m) => (
            <span key={m.email} className="footer-member">
              <strong>{m.name}</strong>
              <a href={`mailto:${m.email}`}>{m.email}</a>
              <span>{m.phone}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="footer-bottom-row">
        <span>&copy; {currentYear} Hazora &middot; Technological Institute of the Philippines</span>
      </div>
    </footer>
  );
}
