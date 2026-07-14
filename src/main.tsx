import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ui/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary
      label="The app"
      fallback={(reset) => (
        <div className="error-fallback app-crash">
          <strong>Something went wrong.</strong>
          <p>The app hit an unexpected error. Your inputs are safe — reloading fixes it.</p>
          <button className="secondary" onClick={reset}>
            Try again
          </button>{' '}
          <button className="secondary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      )}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
