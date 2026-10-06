import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { ErrorView } from './ErrorView';
import { canGoBack } from './backNav';

interface State {
  failed: boolean;
}

/**
 * Последний рубеж: если при отрисовке что-то упало, вместо белого экрана —
 * понятная страница с кнопкой «Обновить».
 *
 * Частая причина — выкладка новой версии, пока вкладка открыта: старая
 * страница просит кусок сборки, которого на сервере уже нет. Обновление
 * страницы это и лечит.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Сбой отрисовки', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    // Без шапки и подвала: они сами могли быть причиной сбоя.
    return (
      <main className="app__main app__main--narrow error-boundary">
        <ErrorView
          code="Ой"
          title="Что-то пошло не так"
          actions={(
            <>
              <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
                Обновить страницу
              </button>
              {/* Роутер здесь уже недоступен — сбой мог случиться в нём
                  самом, — поэтому назад обычной историей браузера. */}
              {canGoBack() ? (
                <button className="btn btn-quiet" type="button" onClick={() => window.history.back()}>
                  Вернуться назад
                </button>
              ) : null}
              <a className="btn btn-quiet" href="/">На главную страницу</a>
            </>
          )}
        >
          <p>
            Страница не смогла открыться. Чаще всего помогает обновить её: возможно,
            сайт только что обновился. Нарисованное на досках не пропало — оно хранится
            на сервере.
          </p>
        </ErrorView>
      </main>
    );
  }
}
