import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useThemeStore } from './store/themeStore'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import TextEditorPage from './pages/TextEditorPage'
import TextsPage from './pages/TextsPage'
import ChatPage from './pages/ChatPage'
import CostsPage from './pages/CostsPage'
import SettingsPage from './pages/SettingsPage'
import PromptEditorPage from './pages/PromptEditorPage'
import LoginPage from './pages/LoginPage'
import { useEffect, useState } from 'react'
import { authAPI } from './api/client'

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const [isChecking, setIsChecking] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token')

      if (!token) {
        setIsAuthenticated(false)
        setIsChecking(false)
        return
      }

      try {
        // Verify token with backend
        const response = await authAPI.verify(token)

        if (response.data.valid) {
          setIsAuthenticated(true)
        } else {
          localStorage.removeItem('auth_token')
          setIsAuthenticated(false)
        }
      } catch (error) {
        // If verification fails (e.g., auth is disabled), allow access
        if (error.response?.status === 401) {
          localStorage.removeItem('auth_token')
          setIsAuthenticated(false)
        } else {
          // Auth might be disabled on server, allow access
          setIsAuthenticated(true)
        }
      } finally {
        setIsChecking(false)
      }
    }

    checkAuth()
  }, [location.pathname])

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

function App() {
  const { theme } = useThemeStore()

  return (
    <div className={theme}>
      <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="texts" element={<TextsPage />} />
            <Route path="texts/:id" element={<TextEditorPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="chat/:chatId" element={<ChatPage />} />
            <Route path="costs" element={<CostsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/prompt" element={<PromptEditorPage />} />
          </Route>
        </Routes>
      </div>
    </div>
  )
}

export default App
