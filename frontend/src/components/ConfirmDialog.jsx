import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'Подтвердить', cancelText = 'Отмена', type = 'danger' }) {
  if (!isOpen) return null

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  const typeStyles = {
    danger: {
      icon: 'text-red-600',
      button: 'bg-red-600 hover:bg-red-700'
    },
    warning: {
      icon: 'text-orange-600',
      button: 'bg-orange-600 hover:bg-orange-700'
    },
    info: {
      icon: 'text-blue-600',
      button: 'bg-primary-600 hover:bg-primary-700'
    }
  }

  const styles = typeStyles[type] || typeStyles.danger

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <AlertTriangle className={`w-6 h-6 ${styles.icon}`} />
            <h2 className="text-lg sm:text-xl font-bold">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6">
          <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300">{message}</p>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={handleConfirm}
            className={`flex-1 px-4 py-2 text-sm sm:text-base text-white rounded-lg transition-colors ${styles.button}`}
          >
            {confirmText}
          </button>
          {cancelText && (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm sm:text-base bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              {cancelText}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
