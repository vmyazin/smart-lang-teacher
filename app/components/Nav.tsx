import { NavLink } from "react-router";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  "pk-nav-link" + (isActive ? " is-active" : "");

export default function Nav({ right }: { right?: React.ReactNode } = {}) {
  return (
    <nav className="pk-nav">
      <NavLink to="/session" className="pk-logo" aria-label="Parla home">
        <span className="blob" />
        Parla
      </NavLink>
      <div className="pk-nav-links">
        <NavLink to="/session" className={linkClass}>Practice</NavLink>
        <NavLink to="/history" className={linkClass}>History</NavLink>
        <NavLink to="/profile" className={linkClass}>Profile</NavLink>
        <NavLink to="/settings/keys" className={linkClass}>API keys</NavLink>
      </div>
      {right}
    </nav>
  );
}
