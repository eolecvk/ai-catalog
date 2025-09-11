import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class GraphErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Graph Error:', error, errorInfo);
    // TODO: Log to monitoring service when available
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-state">
          <h2>Catalog visualization error</h2>
          <p>Something went wrong while rendering the catalog. Please try again.</p>
          <button 
            className="reset-button"
            onClick={() => this.setState({ hasError: false })}
          >
            Reset Catalog
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GraphErrorBoundary;