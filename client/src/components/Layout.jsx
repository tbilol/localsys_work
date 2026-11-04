import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ClipboardList,
  FileText,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { professionLabel, roleLabel } from '../constants.js';
import uz from '../lib/uz.js';
import { Avatar } from './ui.jsx';

const NAV = [
  { to: '/dashboard', label: uz.nav_dashboard, icon: LayoutDashboard, roles: ['admin', 'owner'] },
  { to: '/tasks', label: uz.nav_tasks, icon: ClipboardList, roles: ['admin', 'owner'] },
  { to: '/my-tasks', label: uz.nav_my_tasks, icon: ListChecks, roles: ['worker'] },
  { to: '/reports', label: uz.nav_reports, icon: FileText, roles: ['admin', 'owner', 'worker'] },
  { to: '/users', label: uz.nav_users, icon: Users, roles: ['admin', 'owner'] },
  { to: '/activity', label: uz.nav_activity, icon: Activity, roles: ['admin'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [location.pathname]);

  const items = NAV.filter((i) => i.roles.includes(user.role));
  const current = items.find((i) => location.pathname.startsWith(i.to));

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app">
      <div className={`backdrop${open ? ' show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label={uz.nav_main}>
        <nav className="nav">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <Avatar name={user.fullName} />
            <div className="meta">
              <div className="name">{user.fullName}</div>
              <div className="role">
                {roleLabel(user.role)}
                {professionLabel(user) ? ` · ${professionLabel(user)}` : ''}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-block logout-btn" onClick={handleLogout}>
            <LogOut size={18} /> {uz.logout}
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon" onClick={() => setOpen(true)} aria-label={uz.open_menu}>
            <Menu size={22} />
          </button>
          <div className="topbar-title">{current?.label}</div>
          <Avatar name={user.fullName} size={32} />
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
