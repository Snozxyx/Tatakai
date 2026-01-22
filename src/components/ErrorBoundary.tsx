import React from 'react';
import { logClientError } from '@/lib/errorLogger';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorId?: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorId: null };

  async componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ hasError: true });
    try {
      // Log to our admin table and capture in Sentry
      const res = await logClientError(error, { reactInfo: info });
      this.setState({ errorId: res?.errorId ?? null });
      try {
        const { captureException } = await import('@/lib/sentry');
        captureException(error, { reactInfo: info, errorId: res?.errorId });
      } catch {}
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 text-center">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-400 mb-4">Our team has been notified.</p>
            {this.state.errorId && (
              <p className="text-xs text-gray-500 font-mono">Error ID: {this.state.errorId}</p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
