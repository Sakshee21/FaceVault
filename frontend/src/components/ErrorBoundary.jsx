import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card border-red-800 bg-red-900/10">
          <p className="text-red-400 font-semibold">Something went wrong</p>
          <p className="text-xs text-gray-500 mt-1 font-mono break-all">
            {this.state.error.message}
          </p>
          <button
            className="btn-secondary text-sm mt-3"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
