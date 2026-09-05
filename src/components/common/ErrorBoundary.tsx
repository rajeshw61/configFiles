import { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled runtime error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            padding: '2rem',
            textAlign: 'center',
            background: '#090d16',
            color: '#f8fafc',
          }}
        >
          <div
            style={{
              padding: '2rem',
              maxWidth: '560px',
              background: '#0e1424',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <ShieldAlert style={{ width: '40px', height: '40px', color: '#f43f5e' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
              An Unexpected Runtime Error Occurred
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
              The application encountered an unexpected error while processing this configuration. Your data has not left your browser.
            </p>
            {this.state.error && (
              <pre
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: '#050811',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#fda4af',
                  textAlign: 'left',
                  overflowX: 'auto',
                  maxHeight: '120px',
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RotateCcw style={{ width: '14px', height: '14px' }} />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
