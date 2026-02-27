import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Layout.css';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <NavLink to="/">Accesorii Mall</NavLink>
          </div>
          <nav className="nav">
            <NavLink to="/" end>Stoc</NavLink>
            <NavLink to="/raport-vanzari">Raport 30/60/90 zile</NavLink>
            <NavLink to="/transferuri">Transferuri</NavLink>
          </nav>
          <div className="user-bar">
            <span className="user-name">{user?.full_name || user?.email}</span>
            <span className="user-role">{user?.role === 'admin' ? 'Admin' : 'Manager'}</span>
            <button type="button" onClick={handleLogout} className="btn-logout">Deconectare</button>
          </div>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
