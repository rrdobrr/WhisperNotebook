import { Outlet, Link, useLocation } from 'react-router-dom'
import { Home, FileText, MessageSquare, DollarSign, Settings, Moon, Sun } from 'lucide-react'
import { useThemeStore } from '../store/themeStore'

export default function Layout() {
  const location = useLocation()
  const { theme, toggleTheme } = useThemeStore()

  const navigation = [
    { name: 'Главная', path: '/', icon: Home },
    { name: 'Тексты', path: '/texts', icon: FileText },
    { name: 'Чат', path: '/chat', icon: MessageSquare },
    { name: 'Затраты', path: '/costs', icon: DollarSign },
    { name: 'Настройки', path: '/settings', icon: Settings },
  ]

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-primary-600 dark:text-primary-400">
            WhisperTranscriber
          </h1>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="w-5 h-5 mr-3" />
                <span className="font-medium">{item.name}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-center px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {theme === 'light' ? (
              <>
                <Moon className="w-5 h-5 mr-2" />
                <span>Темная тема</span>
              </>
            ) : (
              <>
                <Sun className="w-5 h-5 mr-2" />
                <span>Светлая тема</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
