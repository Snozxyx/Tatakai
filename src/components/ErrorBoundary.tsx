import React from 'react';
import { logClientError } from '@/lib/errorLogger';
import ErrorPage from '@/pages/ErrorPage';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId?: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, errorId: null };

  async componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ hasError: true, error });
    try {
      const res = await logClientError(error, { reactInfo: info });
      this.setState({ errorId: res?.errorId ?? null });
      try {
        const { captureException } = await import('@/lib/sentry');
        captureException(error, { reactInfo: info, errorId: res?.errorId });
      } catch {}
    } catch {}
  }

  resetError = () => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorPage
          error={this.state.error}
          resetError={this.resetError}
          errorId={this.state.errorId}
        />
      );
    }
    return this.props.children;
  }
}
