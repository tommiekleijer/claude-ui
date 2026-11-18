import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'vertex/tokens.css';
import App from './App';
import './global.scss';
import { openTab } from './store';

openTab();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
