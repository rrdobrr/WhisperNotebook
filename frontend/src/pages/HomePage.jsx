import { useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Youtube, Loader2, CheckCircle, FileText, Download, AlertCircle } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { transcriptionAPI, settingsAPI } from '../api/client'
import toast from 'react-hot-toast'
import ConfirmDialog from '../components/ConfirmDialog'

export default function HomePage() {
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [transcriptionMethod, setTranscriptionMethod] = useState('local')
  const [language, setLanguage] = useState('auto')
  const [addTimestamps, setAddTimestamps] = useState(true)
  const [activeTab, setActiveTab] = useState('file') // 'file' or 'youtube'
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [showNoKeyDialog, setShowNoKeyDialog] = useState(false)

  // Query model status
  const { data: modelStatus, refetch: refetchModelStatus } = useQuery({
    queryKey: ['model-status'],
    queryFn: async () => {
      const response = await settingsAPI.getModelStatus()
      return response.data
    },
    refetchInterval: (data) => {
      // Poll every 2 seconds if model is downloading
      if (data?.download_progress?.status === 'downloading') {
        return 2000
      }
      // Otherwise poll every 10 seconds
      return 10000
    },
  })

  // Query OpenAI key status
  const { data: keyStatus } = useQuery({
    queryKey: ['openai-key-status'],
    queryFn: async () => {
      const response = await settingsAPI.getOpenAIKeyStatus()
      return response.data
    },
  })

  // Handle transcription method change
  const handleMethodChange = (newMethod) => {
    // If switching to API method, check if key exists
    if (newMethod === 'api' && !keyStatus?.has_key) {
      setShowNoKeyDialog(true)
      return
    }
    setTranscriptionMethod(newMethod)
  }

  const uploadMutation = useMutation({
    mutationFn: (formData) => transcriptionAPI.uploadFile(formData),
    onSuccess: () => {
      setUploadSuccess(true)
      toast.success('Транскрибация началась!')
    },
    onError: (error) => {
      toast.error(`Ошибка загрузки: ${error.response?.data?.detail || error.message}`)
    },
  })

  const youtubeMutation = useMutation({
    mutationFn: (data) => transcriptionAPI.transcribeYoutube(data),
    onSuccess: () => {
      setUploadSuccess(true)
      setYoutubeUrl('')
      toast.success('Транскрибация началась!')
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error.response?.data?.detail || error.message}`)
    },
  })

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      acceptedFiles.forEach((file) => {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('method', transcriptionMethod)
        formData.append('language', language)
        formData.append('add_timestamps', addTimestamps.toString())

        uploadMutation.mutate(formData)
      })
    },
    multiple: true,
  })

  const handleYoutubeSubmit = (e) => {
    e.preventDefault()
    if (!youtubeUrl) return

    const formData = new FormData()
    formData.append('youtube_url', youtubeUrl)
    formData.append('method', transcriptionMethod)
    formData.append('language', language)
    formData.append('add_timestamps', addTimestamps.toString())

    youtubeMutation.mutate(formData)
  }

  const languages = [
    { code: 'auto', name: 'Автоопределение' },
    { code: 'ru', name: 'Русский' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt', name: 'Português' },
    { code: 'zh', name: '中文' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
  ]

  // Check if local transcription is blocked
  const isModelDownloading = modelStatus?.download_progress?.status === 'downloading'
  const isModelError = modelStatus?.download_progress?.status === 'error'
  const isModelReady = modelStatus?.downloaded === true
  const isLocalMethodBlocked = transcriptionMethod === 'local' && !isModelReady

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">Транскрибация аудио и видео</h1>
      <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-6 sm:mb-8">
        Загрузите файлы или укажите ссылку на YouTube для начала работы
      </p>

      {/* Model Download Progress Banner */}
      {isModelDownloading && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500 rounded-lg p-4 sm:p-6 mb-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <Download className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5 sm:mt-1 animate-bounce" />
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">
                Загрузка модели Whisper
              </h3>
              <p className="text-sm sm:text-base text-blue-700 dark:text-blue-300 mb-3">
                {modelStatus?.download_progress?.message || 'Загрузка модели для локальной транскрибации...'}
              </p>
              {/* Progress Bar */}
              <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-4 mb-2">
                <div
                  className="bg-blue-600 dark:bg-blue-400 h-4 rounded-full transition-all duration-300 flex items-center justify-center text-xs text-white font-medium"
                  style={{ width: `${modelStatus?.download_progress?.percentage || 0}%` }}
                >
                  {modelStatus?.download_progress?.percentage > 10 && `${modelStatus?.download_progress?.percentage}%`}
                </div>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Пожалуйста, подождите. Это может занять несколько минут (~3GB)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Model Download Error Banner */}
      {isModelError && !isModelReady && (
        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-500 rounded-lg p-4 sm:p-6 mb-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5 sm:mt-1" />
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
                Ошибка загрузки модели
              </h3>
              <p className="text-sm sm:text-base text-red-700 dark:text-red-300 mb-3">
                {modelStatus?.download_progress?.message || 'Не удалось загрузить модель Whisper'}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Link
                  to="/settings"
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 text-center"
                >
                  Попробовать снова в настройках
                </Link>
                <button
                  onClick={() => setTranscriptionMethod('api')}
                  className="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Использовать OpenAI API
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 sm:p-6 mb-6 space-y-4">
        <h2 className="text-base sm:text-lg font-semibold mb-4">Настройки транскрибации</h2>

        <div>
          <label className="block text-sm font-medium mb-2">Метод транскрибации</label>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <label className="flex items-start sm:items-center">
              <input
                type="radio"
                value="local"
                checked={transcriptionMethod === 'local'}
                onChange={(e) => handleMethodChange(e.target.value)}
                className="mr-2 mt-1 sm:mt-0"
              />
              <div className="flex flex-col sm:flex-row sm:items-center">
                <span>Локальная модель</span>
                <span className="text-xs text-gray-500 sm:ml-2">(медленнее, но приватно)</span>
              </div>
            </label>
            <label className="flex items-start sm:items-center">
              <input
                type="radio"
                value="api"
                checked={transcriptionMethod === 'api'}
                onChange={(e) => handleMethodChange(e.target.value)}
                className="mr-2 mt-1 sm:mt-0"
              />
              <div className="flex flex-col sm:flex-row sm:items-center">
                <span>OpenAI API</span>
                <span className="text-xs text-gray-500 sm:ml-2">(быстрее, требует API ключ)</span>
              </div>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Язык</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg"
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={addTimestamps}
              onChange={(e) => setAddTimestamps(e.target.checked)}
              className="mr-3 w-4 h-4 text-primary-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
            />
            <div>
              <span className="text-sm font-medium">Добавлять таймкоды</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Включить временные метки в транскрипцию
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => {
            setActiveTab('file')
            setUploadSuccess(false)
          }}
          className={`flex-1 px-3 sm:px-6 py-2 sm:py-3 rounded-lg text-sm sm:text-base font-medium transition-colors flex items-center justify-center gap-1 sm:gap-2 ${
            activeTab === 'file'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="hidden xs:inline">Загрузить файл</span>
          <span className="xs:hidden">Файл</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('youtube')
            setUploadSuccess(false)
          }}
          className={`flex-1 px-3 sm:px-6 py-2 sm:py-3 rounded-lg text-sm sm:text-base font-medium transition-colors flex items-center justify-center gap-1 sm:gap-2 ${
            activeTab === 'youtube'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          <Youtube className="w-4 h-4 sm:w-5 sm:h-5" />
          <span>YouTube</span>
        </button>
      </div>

      {/* Success Banner */}
      {uploadSuccess && (
        <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-500 rounded-lg p-4 sm:p-6 mb-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5 sm:mt-1" />
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-green-800 dark:text-green-200 mb-2">
                Транскрибация началась!
              </h3>
              <p className="text-sm sm:text-base text-green-700 dark:text-green-300 mb-3">
                Результат будет доступен в разделе{' '}
                <Link
                  to="/texts"
                  className="underline font-medium hover:text-green-900 dark:hover:text-green-100"
                >
                  "Тексты"
                </Link>
              </p>
              <button
                onClick={() => setUploadSuccess(false)}
                className="text-xs sm:text-sm text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 underline"
              >
                Нажмите, чтобы загрузить ещё файл
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Upload */}
      {activeTab === 'file' && !uploadSuccess && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 sm:p-12 text-center transition-colors ${
            isLocalMethodBlocked
              ? 'cursor-not-allowed opacity-50 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-900'
              : isDragActive
              ? 'cursor-pointer border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'cursor-pointer border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
          onClick={isLocalMethodBlocked ? (e) => e.stopPropagation() : undefined}
        >
          <input {...getInputProps()} disabled={isLocalMethodBlocked} />
          <Upload className={`w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 ${isLocalMethodBlocked ? 'text-gray-300' : 'text-gray-400'}`} />
          <p className="text-base sm:text-lg font-medium mb-2">
            {isLocalMethodBlocked
              ? 'Дождитесь загрузки модели для локальной транскрибации'
              : isDragActive
              ? 'Отпустите файлы здесь'
              : 'Перетащите файлы сюда'}
          </p>
          <p className="text-xs sm:text-sm text-gray-500">
            {isLocalMethodBlocked ? 'или переключитесь на OpenAI API' : 'или нажмите для выбора файлов (аудио или видео)'}
          </p>
          {uploadMutation.isPending && (
            <div className="mt-4 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm sm:text-base">Загрузка...</span>
            </div>
          )}
        </div>
      )}

      {/* YouTube URL */}
      {activeTab === 'youtube' && !uploadSuccess && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold mb-4 flex items-center">
            <Youtube className="w-5 h-5 mr-2 text-red-500" />
            Транскрибация YouTube видео
          </h2>
          <form onSubmit={handleYoutubeSubmit} className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              disabled={isLocalMethodBlocked}
              className="flex-1 px-3 sm:px-4 py-2 text-sm sm:text-base bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!youtubeUrl || youtubeMutation.isPending || isLocalMethodBlocked}
              className="px-4 sm:px-6 py-2 text-sm sm:text-base bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap"
            >
              {youtubeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin mr-2" />
                  Загрузка...
                </>
              ) : isLocalMethodBlocked ? (
                'Ожидание модели...'
              ) : (
                'Загрузить'
              )}
            </button>
          </form>
          {isLocalMethodBlocked && (
            <p className="mt-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              Дождитесь загрузки модели или переключитесь на OpenAI API
            </p>
          )}
        </div>
      )}

      {/* No API Key Dialog */}
      <ConfirmDialog
        isOpen={showNoKeyDialog}
        onClose={() => setShowNoKeyDialog(false)}
        onConfirm={() => setShowNoKeyDialog(false)}
        title="OpenAI API ключ не найден"
        message="Для использования метода OpenAI API необходимо добавить API ключ в переменные окружения Railway (OPENAI_API_KEY). После добавления перезапустите приложение."
        confirmText="Хорошо"
        cancelText={null}
        type="warning"
      />
    </div>
  )
}
