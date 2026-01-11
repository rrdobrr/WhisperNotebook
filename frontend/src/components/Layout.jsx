import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { Home, FileText, MessageSquare, DollarSign, Settings, Moon, Sun, Menu, X } from 'lucide-react'
import { useThemeStore } from '../store/themeStore'

export default function Layout() {
  const location = useLocation()
  const { theme, toggleTheme } = useThemeStore()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const navigation = [
    { name: 'Главная', path: '/', icon: Home },
    { name: 'Тексты', path: '/texts', icon: FileText },
    { name: 'Чат', path: '/chat', icon: MessageSquare },
    { name: 'Затраты', path: '/costs', icon: DollarSign },
    { name: 'Настройки', path: '/settings', icon: Settings },
  ]

  const closeMobileMenu = () => setIsMobileMenuOpen(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-primary-600 dark:text-primary-400">
          WhisperNotebook
        </h1>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <Menu className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:relative z-40
        w-64 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col
        transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        h-screen
      `}>
        <div className="p-6">
          <h1 className="text-2xl font-bold text-primary-600 dark:text-primary-400">
            WhisperNotebook
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
                onClick={closeMobileMenu}
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
      <div className="flex-1 overflow-y-auto md:ml-0 pt-14 md:pt-0">
        <Outlet />
      </div>
    </div>
  )
}
