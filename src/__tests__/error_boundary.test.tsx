import React from 'react';
import { describe, it, expect } from 'vitest';
import ReactDOMServer from 'react-dom/server';
import { ErrorBoundary } from '../components/common/ErrorBoundary';

describe('ErrorBoundary Component', () => {
  it('updates state via getDerivedStateFromError', () => {
    const testError = new Error('Simulated crash');
    const newState = ErrorBoundary.getDerivedStateFromError(testError);

    expect(newState.hasError).toBe(true);
    expect(newState.error).toBe(testError);
  });

  it('renders children when no error exists in state', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(
        ErrorBoundary,
        null,
        React.createElement('div', null, 'Normal Content')
      )
    );

    expect(html).toContain('Normal Content');
  });

  it('renders fallback UI when hasError is true', () => {
    const boundary = new ErrorBoundary({ children: React.createElement('div', null, 'Normal') });
    boundary.state = {
      hasError: true,
      error: new Error('Critical test error'),
    };

    const rendered = boundary.render();
    const html = ReactDOMServer.renderToStaticMarkup(rendered as React.ReactElement);

    expect(html).toContain('An Unexpected Runtime Error Occurred');
    expect(html).toContain('Critical test error');
    expect(html).toContain('Reload Application');
  });
});
