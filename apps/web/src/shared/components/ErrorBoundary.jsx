import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback(this.state.error, () => this.setState({ hasError: false, error: null, errorInfo: null }))
          : this.props.fallback;
      }
      return (
        <div id="error-boundary-content" style={{ padding: '2rem', background: '#fee2e2', color: '#991b1b', fontFamily: 'monospace', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
          <h2>React Render Error</h2>
          <pre id="error-message">{this.state.error && this.state.error.toString()}</pre>
          <pre id="error-stack">{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
