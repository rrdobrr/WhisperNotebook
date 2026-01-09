import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Youtube, Loader2 } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { transcriptionAPI } from '../api/client'
import toast from 'react-hot-toast'

export default function HomePage() {
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [transcriptionMethod, setTranscriptionMethod] = useState('local')
  const [language, setLanguage] = useState('auto')
  const [addTimestamps, setAddTimestamps] = useState(true)

  const uploadMutation = useMutation({
    mutationFn: (formData) => transcriptionAPI.uploadFile(formData),
    onSuccess: () => {
      toast.success('Файл загружен и добавлен в очередь обработки')
    },
    onError: (error) => {
      toast.error(`Ошибка загрузки: ${error.response?.data?.detail || error.message}`)
    },
  })

  const youtubeMutation = useMutation({
    mutationFn: (data) => transcriptionAPI.transcribeYoutube(data),
    onSuccess: () => {
      toast.success('YouTube видео добавлено в очередь обработки')
      setYoutubeUrl('')
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
        formData.append('add_timestamps', addTimestamps)

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
    formData.append('add_timestamps', addTimestamps)

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

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold mb-2">Транскрибация аудио и видео</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Загрузите файлы или укажите ссылку на YouTube для начала работы
      </p>

      {/* Settings */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mb-6 space-y-4">
        <h2 className="text-lg font-semibold mb-4">Настройки транскрибации</h2>

        <div>
          <label className="block text-sm font-medium mb-2">Метод транскрибации</label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="local"
                checked={transcriptionMethod === 'local'}
                onChange={(e) => setTranscriptionMethod(e.target.value)}
                className="mr-2"
              />
              <span>Локальная модель</span>
              <span className="ml-2 text-xs text-gray-500">(медленнее, но приватно)</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="api"
                checked={transcriptionMethod === 'api'}
                onChange={(e) => setTranscriptionMethod(e.target.value)}
                className="mr-2"
              />
              <span>OpenAI API</span>
              <span className="ml-2 text-xs text-gray-500">(быстрее, требует API ключ)</span>
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
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={addTimestamps}
              onChange={(e) => setAddTimestamps(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm font-medium">Добавить таймкоды</span>
          </label>
        </div>
      </div>

      {/* File Upload */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors mb-6 ${
          isDragActive
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p className="text-lg font-medium mb-2">
          {isDragActive ? 'Отпустите файлы здесь' : 'Перетащите файлы сюда'}
        </p>
        <p className="text-sm text-gray-500">
          или нажмите для выбора файлов (аудио или видео)
        </p>
        {uploadMutation.isPending && (
          <div className="mt-4 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span>Загрузка...</span>
          </div>
        )}
      </div>

      {/* YouTube URL */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <Youtube className="w-5 h-5 mr-2 text-red-500" />
          Транскрибация YouTube видео
        </h2>
        <form onSubmit={handleYoutubeSubmit} className="flex gap-2">
          <input
            type="url"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="flex-1 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg"
          />
          <button
            type="submit"
            disabled={!youtubeUrl || youtubeMutation.isPending}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {youtubeMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Загрузка...
              </>
            ) : (
              'Загрузить'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
