import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsAPI } from '../api/client'
import { ArrowLeft, Save, X } from 'lucide-react'
import toast from 'react-hot-toast'

const DEFAULT_PROMPT = `Создай подробный структурированный конспект следующего текста.

КРИТИЧЕСКИ ВАЖНО - Сохранение оригинальности:
- ОБЯЗАТЕЛЬНО сохраняй все оригинальные термины, названия, понятия и специфические формулировки из текста
- НЕ ЗАМЕНЯЙ авторские выражения на обобщенные или нормализованные варианты
- Если автор использует необычные, специфические или придуманные слова - переноси их в конспект БЕЗ ИЗМЕНЕНИЙ
- Сохраняй уникальный стиль и лексику автора
- Если есть специализированная терминология - используй её точно как в оригинале

Требования к структуре конспекта:
- Выдели основные разделы и темы
- Структурируй информацию с помощью заголовков и подзаголовков
- Раскрой ключевые понятия и термины (сохраняя оригинальные формулировки)
- Сохрани важные детали и примеры
- Используй маркированные списки для перечислений
- Используй нумерованные списки для последовательностей
- Сохраняй логическую структуру оригинального текста

Ответ должен быть на русском языке, но с сохранением ВСЕХ оригинальных терминов и формулировок из исходного текста.

Текст для конспектирования:

{text}`

export default function PromptEditorPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settingsAPI.get()
      return response.data
    },
  })

  useEffect(() => {
    if (settings) {
      // Use custom prompt if exists, otherwise use default
      setContent(settings.summary_prompt || DEFAULT_PROMPT)
    }
  }, [settings])

  const updateMutation = useMutation({
    mutationFn: (summary_prompt) => settingsAPI.update({ summary_prompt }),
    onSuccess: () => {
      queryClient.invalidateQueries(['settings'])
      toast.success('Промпт сохранён')
      navigate('/settings')
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error.response?.data?.detail || error.message}`)
    },
  })

  const handleSave = () => {
    updateMutation.mutate(content)
  }

  const handleCancel = () => {
    navigate('/settings')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600 dark:text-gray-400">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-3 sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <button
            onClick={handleCancel}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            title="Вернуться к настройкам"
          >
            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold flex-1">
            Промпт для конспекта
          </h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1 sm:gap-2 disabled:opacity-50"
          >
            <Save className="w-3 h-3 sm:w-4 sm:h-4" />
            <span>{updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}</span>
          </button>

          <button
            onClick={handleCancel}
            disabled={updateMutation.isPending}
            className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-1 sm:gap-2 disabled:opacity-50"
          >
            <X className="w-3 h-3 sm:w-4 sm:h-4" />
            <span>Отменить</span>
          </button>
        </div>

        <p className="mt-3 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
          Используйте <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">{"{ text }"}</code> в качестве плейсхолдера для текста.
        </p>
      </div>

      {/* Content Editor */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-full bg-transparent border-none outline-none resize-none font-mono text-xs sm:text-sm"
          placeholder="Введите промпт для конспектирования..."
        />
      </div>
    </div>
  )
}
