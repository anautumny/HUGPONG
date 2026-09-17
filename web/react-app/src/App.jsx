import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import ConsentBanner from './components/ConsentBanner';
import LoadingScreen from './components/LoadingScreen';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';
import LegalPage from './pages/LegalPage';
import WorkspacePage from './pages/WorkspacePage';

function AppRoutes() {
  const { status } = useAuth();
  if (status === 'resolving') return <LoadingScreen />;
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/privacy" element={<LegalPage document="privacy" />} />
      <Route path="/terms" element={<LegalPage document="terms" />} />
      <Route path="/cookies" element={<LegalPage document="cookies" />} />
      <Route path="/workspace/:workspace/:section?" element={<WorkspacePage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

export default function App() { return <AuthProvider><AppRoutes /><ConsentBanner /></AuthProvider>; }
