import { Routes, Route } from 'react-router-dom'
import { useThemeStore } from './store/themeStore'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import TextEditorPage from './pages/TextEditorPage'
import TextsPage from './pages/TextsPage'
import ChatPage from './pages/ChatPage'
import CostsPage from './pages/CostsPage'
import SettingsPage from './pages/SettingsPage'

function App() {
  const { theme } = useThemeStore()

  return (
    <div className={theme}>
      <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="texts" element={<TextsPage />} />
            <Route path="texts/:id" element={<TextEditorPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="costs" element={<CostsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </div>
    </div>
  )
}

export default App
