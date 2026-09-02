import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuth } from './auth/AuthContext';
import { metaFor } from './seo';
import { LandingPage } from './pages/LandingPage';
import { AboutPage } from './pages/AboutPage';
import { PricingPage } from './pages/PricingPage';
import { FeaturesPage } from './pages/FeaturesPage';
import { FaqPage } from './pages/FaqPage';
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

/**
 * Заголовок и описание вкладки при переходах.
 *
 * В готовом HTML они уже правильные — их ставит предрендер. Но при
 * переходе внутри приложения страница не перезагружается, и без этого
 * во вкладке до конца сеанса висел бы заголовок первой открытой.
 */
function useDocumentMeta(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = metaFor(pathname);
    document.title = meta.title;

    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute('content', meta.description);
  }, [pathname]);
}

export function App(): ReactElement {
  const { user, loading } = useAuth();
  useDocumentMeta();

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
      <Route path="/features" element={<FeaturesPage />} />
      <Route path="/faq" element={<FaqPage />} />
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
