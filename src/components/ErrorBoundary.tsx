import React, { Component, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  context?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  componentStack: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    errorMessage: '',
    componentStack: '',
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      errorMessage: error.message,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const context = this.props.context ?? 'App';
    console.error(
      `[ErrorBoundary:${context}] Uncaught render error:`,
      error,
      info.componentStack
    );
    this.setState({ componentStack: info.componentStack ?? '' });
  }

  private handleReload = (): void => {
    this.setState({ hasError: false, errorMessage: '', componentStack: '' });
  };

  private handleHardReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const context = this.props.context ?? 'Application';

    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-4 bg-bg-primary p-8 text-center font-sans text-text-primary">
        <AlertTriangle size={36} color="#ff4444" className="mb-1" />
        <h2 className="m-0 text-lg font-semibold text-text-primary">
          {context} crashed
        </h2>
        <p className="m-0 max-w-[320px] text-sm leading-normal text-text-secondary">
          An unexpected error occurred. Your data is safe — click below to
          recover.
        </p>
        {this.state.errorMessage && (
          <code className="block max-w-[360px] truncate rounded-md bg-destructive/10 px-2.5 py-1.5 text-sm text-destructive">
            {this.state.errorMessage}
          </code>
        )}
        <div className="mt-2 flex gap-2">
          <Button
            variant="outline"
            onClick={this.handleReload}
            className="flex cursor-default items-center gap-1.5 rounded-md border-0 bg-bg-component px-3.5 py-2 text-sm font-medium text-text-secondary"
          >
            <RefreshCw size={13} />
            Try to recover
          </Button>
          <Button
            variant="destructive"
            onClick={this.handleHardReload}
            className="flex cursor-default items-center gap-1.5 rounded-md border-0 bg-destructive px-3.5 py-2 text-sm font-medium text-destructive-foreground"
          >
            <RefreshCw size={13} />
            Reload UI
          </Button>
        </div>
      </div>
    );
  }
}
