import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

class Guard extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return React.createElement('div', { style: { padding: 24, fontFamily: 'sans-serif' } }, 'Algo salió mal: ' + String(this.state.err.message));
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<Guard><App /></Guard>);
