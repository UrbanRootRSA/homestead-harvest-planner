import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { Analytics } from '@vercel/analytics/react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("UI crash:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', {
        style: {
          maxWidth: 480, margin: '80px auto', padding: '32px 24px',
          textAlign: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#2C2418'
        }
      },
        React.createElement('h1', {
          style: { fontFamily: "'DM Serif Display', serif", fontSize: 28, marginBottom: 12, fontWeight: 400 }
        }, 'Something went wrong'),
        React.createElement('p', {
          style: { fontSize: 15, color: '#6B5D4F', marginBottom: 24, lineHeight: 1.5 }
        }, 'The planner hit an unexpected error. Reload the page to try again.'),
        React.createElement('button', {
          onClick: function () { window.location.reload(); },
          style: {
            background: '#2D5A27', color: '#FEFCF8', border: 'none', borderRadius: 8,
            padding: '12px 28px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Plus Jakarta Sans', sans-serif"
          }
        }, 'Reload')
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(React.StrictMode, null,
    React.createElement(ErrorBoundary, null,
      React.createElement(App, null)
    ),
    React.createElement(Analytics, null)
  )
)
