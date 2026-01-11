import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsAPI, authAPI } from '../api/client'
import { Save, CheckCircle, Loader2, Download, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import ConfirmDialog from '../components/ConfirmDialog'

export default function SettingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [defaultMethod, setDefaultMethod] = useState('local')
  const [defaultLanguage, setDefaultLanguage] = useState('auto')
  const [defaultModel, setDefaultModel] = useState('gpt-4')
  const [addTimestamps, setAddTimestamps] = useState(true)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  // Download progress state
  const [downloadProgress, setDownloadProgress] = useState({
    percentage: 0,
    status: 'idle',
    message: '',
    files: {}
  })

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settingsAPI.get()
      return response.data
    },
  })


  const { data: modelStatus } = useQuery({
    queryKey: ['model-status'],
    queryFn: async () => {
      const response = await settingsAPI.getModelStatus()
      return response.data
    },
  })

  useEffect(() => {
    if (settings) {
      setDefaultMethod(settings.default_transcription_method)
      setDefaultLanguage(settings.default_language)
      setDefaultModel(settings.default_model)
      setAddTimestamps(settings.add_timestamps)
    }
  }, [settings])

  const updateMutation = useMutation({
    mutationFn: (data) => settingsAPI.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['settings'])
      toast.success('Настройки сохранены')
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error.response?.data?.detail || error.message}`)
    },
  })

  const downloadModelMutation = useMutation({
    mutationFn: async () => {
      // Start listening to progress updates via SSE
      const eventSource = new EventSource('/api/settings/download-progress')

      eventSource.onmessage = (event) => {
        try {
          const progress = JSON.parse(event.data)
          setDownloadProgress(progress)

          // Close connection when complete or error
          if (progress.status === 'complete' || progress.status === 'error') {
            eventSource.close()
          }
        } catch (err) {
          console.error('Failed to parse progress:', err)
        }
      }

      eventSource.onerror = () => {
        eventSource.close()
      }

      // Start the actual download
      return await settingsAPI.downloadModel()
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries(['model-status'])
      toast.success('Модель успешно скачана')
      // Reset progress after a delay
      setTimeout(() => {
        setDownloadProgress({ percentage: 0, status: 'idle', message: '', files: {} })
      }, 3000)
    },
    onError: (error) => {
      toast.error(`Ошибка скачивания модели: ${error.response?.data?.detail || error.message}`)
      setDownloadProgress({ percentage: 0, status: 'error', message: error.message, files: {} })
    },
  })

  const handleSave = () => {
    updateMutation.mutate({
      default_transcription_method: defaultMethod,
      default_language: defaultLanguage,
      default_model: defaultModel,
      add_timestamps: addTimestamps,
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Настройки</h1>

      <div className="space-y-4 sm:space-y-6">
        {/* OpenAI API Info */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">OpenAI API</h2>

          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              API ключ настраивается через переменную окружения <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">OPENAI_API_KEY</code> в Railway.
            </p>

            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                Для проверки баланса и управления биллингом используйте OpenAI Dashboard:
              </p>
              <a
                href="https://platform.openai.com/account/usage"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                platform.openai.com/account/usage →
              </a>
            </div>
          </div>
        </div>

        {/* Local Model */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Локальная модель транскрибации</h2>

          <div className="space-y-3 sm:space-y-4">
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              Для локальной транскрибации необходимо скачать модель Whisper (large-v2).
              Модель занимает около 3 GB и будет сохранена в постоянном хранилище.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <button
                onClick={() => downloadModelMutation.mutate()}
                disabled={downloadModelMutation.isPending || modelStatus?.downloaded}
                className="px-3 sm:px-4 py-2 text-sm sm:text-base bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                {downloadModelMutation.isPending ? (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
                {downloadModelMutation.isPending ? 'Скачивание...' : 'Скачать модель'}
              </button>

              {modelStatus?.downloaded && !downloadModelMutation.isPending && (
                <div className="flex items-center text-sm text-green-600">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Модель скачана
                </div>
              )}
            </div>

            {/* Progress Bar */}
            {downloadProgress.status !== 'idle' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {downloadProgress.message || 'Скачивание...'}
                  </span>
                  <span className="font-medium text-primary-600">
                    {downloadProgress.percentage.toFixed(1)}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${downloadProgress.percentage}%` }}
                  />
                </div>

                {/* File-level progress (optional detailed view) */}
                {Object.keys(downloadProgress.files).length > 0 && (
                  <details className="text-xs text-gray-500 dark:text-gray-400">
                    <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                      Детали скачивания ({Object.keys(downloadProgress.files).length} файлов)
                    </summary>
                    <div className="mt-2 space-y-1 pl-4">
                      {Object.entries(downloadProgress.files).map(([fileName, fileProgress]) => (
                        <div key={fileName} className="flex justify-between">
                          <span className="truncate max-w-xs">{fileName}</span>
                          <span>{fileProgress.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {modelStatus?.path && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Путь: {modelStatus.path}
              </p>
            )}
          </div>
        </div>

        {/* Default Settings */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Настройки по умолчанию</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Метод транскрибации</label>
              <select
                value={defaultMethod}
                onChange={(e) => setDefaultMethod(e.target.value)}
                className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg"
              >
                <option value="local">Локальная модель</option>
                <option value="api">OpenAI API</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Язык</label>
              <select
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
                className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg"
              >
                <option value="auto">Автоопределение</option>
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Модель LLM</label>
              <select
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg"
              >
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
              </select>
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={addTimestamps}
                  onChange={(e) => setAddTimestamps(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm font-medium">Добавлять таймкоды по умолчанию</span>
              </label>
            </div>
          </div>
        </div>

        {/* Summary Prompt Settings */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Промпт для конспекта</h2>

          <div className="space-y-3">
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              Настройте промпт, который будет использоваться при создании конспектов.
              Изменения применяются сразу, без перезапуска приложения.
            </p>

            <button
              onClick={() => navigate('/settings/prompt')}
              className="w-full px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm sm:text-base font-medium"
            >
              Редактировать промпт для конспекта
            </button>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="w-full px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4 sm:w-5 sm:h-5" />
          {updateMutation.isPending ? 'Сохранение...' : 'Сохранить настройки'}
        </button>

        {/* Logout Button */}
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center gap-2 mt-4"
        >
          <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
          Выйти из аккаунта
        </button>
      </div>

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={() => authAPI.logout()}
        title="Выход из аккаунта"
        message="Вы уверены, что хотите выйти? Вам потребуется ввести пароль при следующем входе."
        confirmText="Выйти"
        cancelText="Отмена"
        type="danger"
      />
    </div>
  )
}
