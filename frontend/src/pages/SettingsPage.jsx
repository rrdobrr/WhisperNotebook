import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsAPI } from '../api/client'
import { Save, Eye, EyeOff, CheckCircle, XCircle, Loader2, Download } from 'lucide-react'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [defaultMethod, setDefaultMethod] = useState('local')
  const [defaultLanguage, setDefaultLanguage] = useState('auto')
  const [defaultModel, setDefaultModel] = useState('gpt-4')
  const [addTimestamps, setAddTimestamps] = useState(true)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settingsAPI.get()
      return response.data
    },
  })

  const { data: balance } = useQuery({
    queryKey: ['openai-balance'],
    queryFn: async () => {
      const response = await settingsAPI.getOpenAIBalance()
      return response.data
    },
    enabled: !!settings?.openai_api_key_set,
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

  const testKeyMutation = useMutation({
    mutationFn: (key) => settingsAPI.testOpenAIKey(key),
    onSuccess: (response) => {
      if (response.data.valid) {
        toast.success('API ключ действителен')
      } else {
        toast.error('API ключ недействителен')
      }
    },
  })

  const downloadModelMutation = useMutation({
    mutationFn: () => settingsAPI.downloadModel(),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['model-status'])
      toast.success('Модель успешно скачана')
    },
    onError: (error) => {
      toast.error(`Ошибка скачивания модели: ${error.response?.data?.detail || error.message}`)
    },
  })

  const handleSave = () => {
    updateMutation.mutate({
      openai_api_key: apiKey || undefined,
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
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Настройки</h1>

      <div className="space-y-6">
        {/* OpenAI API Key */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">OpenAI API</h2>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">API Ключ</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings?.openai_api_key_set ? '***' : 'sk-...'}
                  className="w-full px-4 py-2 pr-10 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg"
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <button
                onClick={() => apiKey && testKeyMutation.mutate(apiKey)}
                disabled={!apiKey || testKeyMutation.isPending}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                {testKeyMutation.isPending ? 'Проверка...' : 'Проверить'}
              </button>
            </div>

            {settings?.openai_api_key_set && (
              <div className="mt-2 flex items-center text-sm text-green-600">
                <CheckCircle className="w-4 h-4 mr-1" />
                API ключ установлен
              </div>
            )}
          </div>

          {balance && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm">
                <strong>Баланс:</strong> {balance.message || balance.available}
              </p>
            </div>
          )}
        </div>

        {/* Local Model */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Локальная модель транскрибации</h2>

          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Для локальной транскрибации необходимо скачать модель Whisper (large-v2).
              Модель занимает около 3 GB и будет сохранена в постоянном хранилище.
            </p>

            <div className="flex items-center gap-4">
              <button
                onClick={() => downloadModelMutation.mutate()}
                disabled={downloadModelMutation.isPending || modelStatus?.downloaded}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                {downloadModelMutation.isPending ? 'Скачивание...' : 'Скачать модель'}
              </button>

              {modelStatus?.downloaded && (
                <div className="flex items-center text-sm text-green-600">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Модель скачана
                </div>
              )}
            </div>

            {modelStatus?.path && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Путь: {modelStatus.path}
              </p>
            )}
          </div>
        </div>

        {/* Default Settings */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Настройки по умолчанию</h2>

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

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-5 h-5" />
          {updateMutation.isPending ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  )
}
