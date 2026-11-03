import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { homePathFor, useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Tasks from './pages/Tasks.jsx';
import MyTasks from './pages/MyTasks.jsx';
import Reports from './pages/Reports.jsx';
import Users from './pages/Users.jsx';
import ActivityLog from './pages/ActivityLog.jsx';
import NotFound from './pages/NotFound.jsx';

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homePathFor(user.role)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="reports" element={<Reports />} />
          <Route element={<ProtectedRoute roles={['admin', 'owner']} />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="tasks" element={<Tasks />} />
          </Route>
          <Route element={<ProtectedRoute roles={['worker']} />}>
            <Route path="my-tasks" element={<MyTasks />} />
          </Route>
          <Route element={<ProtectedRoute roles={['admin', 'owner']} />}>
            <Route path="users" element={<Users />} />
          </Route>
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="activity" element={<ActivityLog />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
