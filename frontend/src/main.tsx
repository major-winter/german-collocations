import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Home } from './routes/Home.tsx';
import { Word } from './routes/Word.tsx';
import './index.css';
import { Layout } from './components/Layout.tsx';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/wort" element={<Navigate to="/" replace />} />
          <Route path="/wort/:word" element={<Word key={location.pathname} />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  </StrictMode>,
);
