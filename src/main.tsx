import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './context/AppContext';
import './index.css';

const LOCAL_DATA_RESET_KEY = 'camsgold_local_data_reset_version';
const LOCAL_DATA_RESET_VERSION = '2026-11-empty';

if (localStorage.getItem(LOCAL_DATA_RESET_KEY) !== LOCAL_DATA_RESET_VERSION) {
  const cachedKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => key?.startsWith('cg_') === true);
  cachedKeys.forEach((key) => localStorage.removeItem(key));
  localStorage.setItem(LOCAL_DATA_RESET_KEY, LOCAL_DATA_RESET_VERSION);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
