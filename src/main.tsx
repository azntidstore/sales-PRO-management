import React, { StrictMode } from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { safeStorage } from './utils/safeStorage';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: { componentStack: string } | null;
}

class ErrorBoundary extends (React.Component as any) {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("REACT RUNTIME ERROR BOUNDARY:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          fontFamily: 'monospace',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          lineHeight: '1.5'
        }}>
          <h1 style={{ color: '#ef4444', margin: '0 0 0.5rem 0' }}>🚨 React Component Interruption</h1>
          <p style={{ color: '#94a3b8', margin: 0 }}>An unexpected error occurred during rendering flow.</p>
          <div style={{
            backgroundColor: '#ef444410',
            borderLeft: '4px solid #ef4444',
            padding: '1rem',
            borderRadius: '0.25rem'
          }}>
            <p style={{ fontWeight: 'bold', color: '#f43f5e', margin: '0 0 0.5rem 0' }}>
              {this.state.error?.name}: {this.state.error?.message}
            </p>
          </div>
          <pre style={{
            backgroundColor: '#1e293b',
            padding: '1rem',
            borderRadius: '0.375rem',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            fontSize: '0.85rem'
          }}>
            {this.state.error?.stack || 'No stack trace available'}
          </pre>
          <h3>Component Tree Context:</h3>
          <pre style={{
            backgroundColor: '#1e293b',
            padding: '1rem',
            borderRadius: '0.375rem',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            fontSize: '0.85rem'
          }}>
            {this.state.errorInfo?.componentStack || 'No component stack trace available'}
          </pre>
          <button 
            onClick={() => {
              safeStorage.clear();
              try { sessionStorage.clear(); } catch (e) {}
              window.location.reload();
            }}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontWeight: 'bold',
              alignSelf: 'flex-start'
            }}
          >
            Clear Local Cache & Reboot App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

