import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { textAPI, chatAPI, settingsAPI } from '../api/client'
import { ArrowLeft, Copy, Sparkles, MessageSquare, Search, Loader2, Clock, Eye, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import ConfirmDialog from '../components/ConfirmDialog'
import ReactMarkdown from 'react-markdown'

export default function TextEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isViewMode, setIsViewMode] = useState(false)
  const [showRemoveTimestampsConfirm, setShowRemoveTimestampsConfirm] = useState(false)
  const [showNoApiKeyDialog, setShowNoApiKeyDialog] = useState(false)
  const [showSummaryReadyDialog, setShowSummaryReadyDialog] = useState(false)
  const [summaryTextId, setSummaryTextId] = useState(null)
  const autoSaveTimerRef = useRef(null)

  const { data: text, isLoading } = useQuery({
    queryKey: ['text', id],
    queryFn: async () => {
      const response = await textAPI.getById(id)
      return response.data
    },
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settingsAPI.get()
      return response.data
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

  useEffect(() => {
    if (text) {
      setTitle(text.title)
      setContent(text.content)
    }
  }, [text])

  // Auto-save with debounce
  useEffect(() => {
    if (!text) return // Don't auto-save before initial load

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    // Set new timer for auto-save after 1 second of inactivity
    autoSaveTimerRef.current = setTimeout(() => {
      if (title !== text.title || content !== text.content) {
        textAPI.update(id, { title, content })
          .then(() => {
            queryClient.invalidateQueries(['text', id])
          })
          .catch((error) => {
            toast.error(`Ошибка автосохранения: ${error.response?.data?.detail || error.message}`)
          })
      }
    }, 1000)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [title, content, text, id, queryClient])

  const summarizeMutation = useMutation({
    mutationFn: () => textAPI.summarize(id),
    onSuccess: (response) => {
      setSummaryTextId(response.data.summary_text_id)
      setShowSummaryReadyDialog(true)
      queryClient.invalidateQueries(['texts'])
    },
    onError: (error) => {
      // Check if error is about missing API key
      const errorMessage = error.response?.data?.detail || error.message || ''
      if (errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('openai')) {
        setShowNoApiKeyDialog(true)
      } else {
        toast.error(`Ошибка: ${errorMessage}`)
      }
    },
  })

  const createChatMutation = useMutation({
    mutationFn: async () => {
      // Create new chat with model from settings
      const model = settings?.default_model || 'gpt-4o'
      const chatResponse = await chatAPI.create({ title: `Чат: ${title}`, model })
      return {
        chatId: chatResponse.data.id,
        textId: parseInt(id)
      }
    },
    onSuccess: ({ chatId, textId }) => {
      toast.success('Переход в чат')
      // Navigate to chat with attached text
      navigate(`/chat/${chatId}`, {
        state: {
          attachedTextIds: [textId]
        }
      })
    },
    onError: (error) => {
      // Check if error is about missing API key
      const errorMessage = error.response?.data?.detail || error.message || ''
      if (errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('openai')) {
        setShowNoApiKeyDialog(true)
      } else {
        toast.error(`Ошибка: ${errorMessage}`)
      }
    },
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    toast.success('Текст скопирован')
  }

  const handleRemoveTimestamps = () => {
    // Remove patterns like [0:00:00,0000] or [00:00:00.000]
    const updatedContent = content.replace(/\[\d{1,2}:\d{2}:\d{2}[,.:]\d{1,4}\]\s*/g, '')
    setContent(updatedContent)
    toast.success('Таймкоды удалены')
  }

  const highlightText = (text) => {
    if (!searchTerm) return text
    const regex = new RegExp(`(${searchTerm})`, 'gi')
    return text.replace(regex, '<mark class="bg-yellow-300 dark:bg-yellow-600">$1</mark>')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-3 sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <button
            onClick={() => navigate('/texts')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            title="Вернуться к списку текстов"
          >
            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg sm:text-xl md:text-2xl font-bold flex-1 bg-transparent border-none outline-none"
            placeholder="Название текста..."
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCopy}
            className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-1 sm:gap-2"
          >
            <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Копировать</span>
          </button>

          <button
            onClick={() => {
              if (!keyStatus?.has_key) {
                setShowNoApiKeyDialog(true)
                return
              }
              summarizeMutation.mutate()
            }}
            disabled={summarizeMutation.isPending}
            className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-1 sm:gap-2 disabled:opacity-50"
          >
            <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">{summarizeMutation.isPending ? 'Создание конспекта...' : 'Конспект'}</span>
            <span className="sm:hidden">{summarizeMutation.isPending ? 'Создание...' : 'Конспект'}</span>
          </button>

          <button
            onClick={() => {
              if (!keyStatus?.has_key) {
                setShowNoApiKeyDialog(true)
                return
              }
              createChatMutation.mutate()
            }}
            disabled={createChatMutation.isPending}
            className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1 sm:gap-2 disabled:opacity-50"
          >
            <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">{createChatMutation.isPending ? 'Создание чата...' : 'LLM'}</span>
            <span className="sm:hidden">В чат</span>
          </button>

          <button
            onClick={() => setShowRemoveTimestampsConfirm(true)}
            className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-1 sm:gap-2"
            title="Удаляет все таймкоды из текста (необратимо)"
          >
            <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Убрать таймкоды</span>
          </button>

          <button
            onClick={() => setIsViewMode(!isViewMode)}
            className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1 sm:gap-2"
            title={isViewMode ? "Режим редактирования" : "Режим просмотра"}
          >
            {isViewMode ? (
              <Pencil className="w-3 h-3 sm:w-4 sm:h-4" />
            ) : (
              <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
            )}
          </button>

          <div className="relative w-full sm:w-auto sm:ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Поиск..."
              className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 text-xs sm:text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        {isViewMode ? (
          <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-bold prose-h1:text-4xl prose-h1:mb-6 prose-h1:mt-8 prose-h2:text-3xl prose-h2:mb-5 prose-h2:mt-7 prose-h3:text-2xl prose-h3:mb-4 prose-h3:mt-6 prose-h4:text-xl prose-h4:mb-3 prose-h4:mt-5 prose-h5:text-lg prose-h5:mb-3 prose-h5:mt-4 prose-h6:text-base prose-h6:mb-2 prose-h6:mt-3 prose-p:mb-4">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full bg-transparent border-none outline-none resize-none font-mono text-xs sm:text-sm"
            placeholder="Начните печатать..."
          />
        )}
      </div>

      {/* Confirm Dialog - Remove Timestamps */}
      <ConfirmDialog
        isOpen={showRemoveTimestampsConfirm}
        onClose={() => setShowRemoveTimestampsConfirm(false)}
        onConfirm={handleRemoveTimestamps}
        title="Удалить таймкоды?"
        message="Это действие удалит все таймкоды из текста и не может быть отменено. Вы уверены?"
        confirmText="Удалить"
        cancelText="Отмена"
        type="warning"
      />

      {/* Confirm Dialog - No API Key */}
      <ConfirmDialog
        isOpen={showNoApiKeyDialog}
        onClose={() => setShowNoApiKeyDialog(false)}
        onConfirm={() => setShowNoApiKeyDialog(false)}
        title="OpenAI API ключ не найден"
        message="Для использования функций AI (Конспект, Чат) необходимо добавить API ключ в переменные окружения Railway (OPENAI_API_KEY). После добавления перезапустите приложение."
        confirmText="Хорошо"
        cancelText={null}
        type="warning"
      />

      {/* Confirm Dialog - Summary Ready */}
      <ConfirmDialog
        isOpen={showSummaryReadyDialog}
        onClose={() => setShowSummaryReadyDialog(false)}
        onConfirm={() => {
          setShowSummaryReadyDialog(false)
          navigate(`/texts/${summaryTextId}`)
        }}
        title="Конспект готов"
        message="Конспект успешно создан. Хотите перейти к просмотру?"
        confirmText="Смотреть конспект"
        cancelText="Остаться здесь"
        type="info"
      />
    </div>
  )
}
