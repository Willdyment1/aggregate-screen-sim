import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional fallback UI; a default is shown if omitted. */
  fallback?: (reset: () => void) => ReactNode;
  label?: string;
}
interface State {
  error: Error | null;
}

/**
 * Contains render/runtime errors in a subtree so they can never white-screen the
 * whole app. Shows a small fallback with a "Try again" reset instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('Caught by ErrorBoundary:', error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.reset);
      return (
        <div className="error-fallback">
          <strong>{this.props.label ?? 'This section'} hit a snag.</strong>{' '}
          <button className="secondary" onClick={this.reset}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
