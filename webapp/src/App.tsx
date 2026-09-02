import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuth } from './auth/AuthContext';
import { LandingPage } from './pages/LandingPage';
import { AboutPage } from './pages/AboutPage';
import { PricingPage } from './pages/PricingPage';
import { PlanPage } from './pages/PlanPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ConfirmPage } from './pages/ConfirmPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { BoardsPage } from './pages/BoardsPage';
import { ProfilePage } from './pages/ProfilePage';
import { BoardPage } from './pages/BoardPage';
import { JoinPage } from './pages/JoinPage';
import { LegalPage } from './pages/LegalPage';

export function App(): ReactElement {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="screen-center muted">Загружаем…</div>;
  }

  return (
    <Routes>
      {/* Открыты всем, независимо от входа. Страницы из писем — потому что по
          такой ссылке человек приходит ещё не войдя. Приглашение и сама доска —
          потому что на доску пускают гостя, у которого учётной записи нет
          и не будет. */}
      <Route path="/legal/:page" element={<LegalPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/confirm" element={<ConfirmPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/join/:token" element={<JoinPage />} />
      <Route path="/boards/:boardId" element={<BoardPage />} />

      {user ? (
        <>
          {/* «Главная» из шапки должна вести на главную, а не сразу
              перекидывать на доски — иначе пункт меню просто дублирует
              «Мои доски» и щелчок по нему выглядит как ничего не делающий. */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Navigate to="/boards" replace />} />
          <Route path="/register" element={<Navigate to="/boards" replace />} />
          <Route path="/boards" element={<BoardsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="*" element={<Navigate to="/boards" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}
