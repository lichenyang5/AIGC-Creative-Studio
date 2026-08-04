import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'
import './index.css'
import CreatePage from './pages/CreatePage.tsx'
import { AppLayout } from './components/AppLayout.tsx'
import { RequireAuth } from './components/RequireAuth.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { EditorPage } from './pages/EditorPage.tsx'
import { LibraryPage } from './pages/LibraryPage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { ProfilePage } from './pages/ProfilePage.tsx'

/** 应用入口：集中声明路由、公共布局和认证保护边界。 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider><BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/create" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}><Route element={<AppLayout />}>
          <Route path="/create" element={<CreatePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/editor/imported/:assetId" element={<EditorPage />} />
          <Route path="/editor/:taskId/:imageIndex" element={<EditorPage />} />
        </Route></Route>
        <Route path="*" element={<Navigate to="/create" replace />} />
      </Routes>
    </BrowserRouter></AuthProvider>
  </StrictMode>,
)
