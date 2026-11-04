import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import uz from '../lib/uz.js';

// Catches render errors anywhere below it and shows a recovery screen instead of a blank page.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center-screen" style={{ padding: 16 }}>
        <div className="card empty" style={{ maxWidth: 440, width: '100%' }} role="alert">
          <div className="empty-icon" style={{ color: 'var(--danger)', background: 'var(--danger-soft)' }}>
            <AlertTriangle size={26} />
          </div>
          <h4>{uz.crash_title}</h4>
          <p>{uz.crash_text}</p>
          <div className="flex gap-8" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              {uz.crash_reload}
            </button>
            <a className="btn btn-secondary" href="/">
              {uz.crash_home}
            </a>
          </div>
        </div>
      </div>
    );
  }
}
