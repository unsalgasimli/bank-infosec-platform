import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext.js';
import { NotificationProvider } from './context/NotificationContext.js';
import { I18nProvider } from './context/I18nContext.js';
import { App } from './App.js';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <I18nProvider>
        <NotificationProvider>
          <App />
        </NotificationProvider>
      </I18nProvider>
    </AuthProvider>
  </React.StrictMode>
);
