import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { Analytics } from '@vercel/analytics/react'

// M-1 (fleet-sweep audit 2026-08-18,
// ../docs/audit-sweep-families-2026-08-18.md): keep the licence key out of the
// Vercel Web Analytics beacon. The purchase email links to /?key=<licence>, and
// the shipped tracker sends location.href VERBATIM - it only blanks the query
// string on the branch where a `route` prop is supplied, and none is here. The
// strip in App.jsx lands after a network round-trip, so the pageview fires with
// the key still in the URL: 1.25 s of exposure, measured on the live site.
// beforeSend is Vercel's own documented hook for this and runs before the event
// leaves the page.
//
// Strip ONLY `key`. Over-stripping is its own defect (Growroom's audit filed it
// as one): utm_* parameters and the hash are legitimate analytics data. The
// cheap substring test first means an ordinary pageview - which is nearly all of
// them - returns the very same object, so nothing here can take analytics down.
function redactLicenceKey(event) {
  const url = String(event?.url || "");
  if (!url.includes("key=")) return event;
  try {
    // A base, so a path-only url from a future SDK version parses instead of
    // throwing. An absolute url ignores it and keeps its own origin.
    const u = new URL(url, "https://thehomesteadplan.com");
    if (!u.searchParams.has("key")) return event;
    u.searchParams.delete("key");
    const qs = u.searchParams.toString();
    const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(url);
    return { ...event, url: isAbsolute ? u.toString() : u.pathname + (qs ? `?${qs}` : "") + u.hash };
  } catch {
    // We could not inspect a URL that carries something shaped like a key.
    // Dropping one event beats forwarding a credential on a guess.
    return null;
  }
}

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
    React.createElement(Analytics, { beforeSend: redactLicenceKey })
  )
)
