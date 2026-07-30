import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AppLayout } from './components/AppLayout.tsx'
import { EditorPage } from './pages/EditorPage.tsx'
import { LibraryPage } from './pages/LibraryPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/create" replace />} />
        <Route element={<AppLayout />}>
          <Route path="/create" element={<App />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/editor/:taskId/:imageIndex" element={<EditorPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/create" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
