import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './modules/public/LandingPage';
import LoginPage from './modules/auth/LoginPage';
import RegisterPage from './modules/auth/RegisterPage';
import HomeNursingPage from './modules/public/HomeNursingPage';
import AboutPage from './modules/public/AboutPage';
import { AuthProvider } from './context/AuthContext';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="antialiased text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 min-h-screen font-sans">
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Module Routes (Placeholders for now) */}
            <Route path="/services/home-nursing" element={<HomeNursingPage />} />
            <Route path="/services/*" element={<Navigate to="/" replace />} />
            <Route path="/dashboard" element={<Navigate to="/login" replace />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
