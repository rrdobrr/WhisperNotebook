import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { textAPI } from '../api/client'
import { Search, Trash2, Edit, Loader2, AlertCircle, X, Sparkles, Clock, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { calculateEstimatedTime, calculateElapsedSeconds, formatElapsedTime, formatMinutes } from '../utils/transcriptionTime'
import ConfirmDialog from '../components/ConfirmDialog'

export default function TextsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedError, setSelectedError] = useState(null)
  const [analyzingError, setAnalyzingError] = useState(false)
  const [errorAnalysis, setErrorAnalysis] = useState('')
  const [, forceUpdate] = useState({}) // Force re-render for timer
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { textId, textTitle }
  const queryClient = useQueryClient()
  const previousTextsRef = useRef(null)

  const { data: texts, isLoading } = useQuery({
    queryKey: ['texts', searchQuery, statusFilter],
    queryFn: async () => {
      const params = { search: searchQuery || undefined }
      if (statusFilter !== 'all') {
        params.status = statusFilter
      }
      const response = await textAPI.getAll(params)
      return response.data
    },
    refetchInterval: 3000, // Poll every 3 seconds
    refetchIntervalInBackground: true, // Continue polling even when tab is not active
  })

  // Force re-render every second for timer updates
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate({})
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Detect status changes and show toast notifications
  useEffect(() => {
    if (!texts || !previousTextsRef.current) {
      previousTextsRef.current = texts
      return
    }

    const previousTexts = previousTextsRef.current
    const currentTexts = texts

    // Create maps for easier lookup
    const prevMap = new Map(previousTexts.map(t => [t.id, t]))
    const currMap = new Map(currentTexts.map(t => [t.id, t]))

    // Check for status changes
    currentTexts.forEach(currentText => {
      const previousText = prevMap.get(currentText.id)

      if (previousText && previousText.status !== currentText.status) {
        // Status changed
        if (currentText.status === 'unread' && previousText.status === 'processing') {
          // Transcription completed successfully
          toast.success(
            `Транскрибация завершена: "${currentText.title}"`,
            { duration: 5000, icon: '✅' }
          )
        } else if (currentText.status === 'failed') {
          // Transcription failed (from any status)
          toast.error(
            `Ошибка транскрибации: "${currentText.title}"`,
            { duration: 7000, icon: '❌' }
          )
        } else if (currentText.status === 'processing' && previousText.status === 'queued') {
          // Started processing from queue - save CLIENT start time to server
          const clientTimestamp = Date.now()

          // Update server with client timestamp
          textAPI.update(currentText.id, { started_at: clientTimestamp })
            .catch(err => console.error('Failed to update started_at:', err))

          toast(
            `Начата обработка: "${currentText.title}"`,
            { duration: 3000, icon: '▶️' }
          )
        }
      }
    })

    // Also check for texts that are already processing when page loads (no started_at yet)
    currentTexts.forEach(text => {
      if (text.status === 'processing' && !text.started_at) {
        const clientTimestamp = Date.now()
        textAPI.update(text.id, { started_at: clientTimestamp })
          .catch(err => console.error('Failed to update started_at:', err))
      }
    })

    previousTextsRef.current = texts
  }, [texts])

  const deleteMutation = useMutation({
    mutationFn: textAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries(['texts'])
      toast.success('Текст удален')
      setDeleteConfirm(null)
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error.response?.data?.detail || error.message}`)
      setDeleteConfirm(null)
    },
  })

  const handleAnalyzeError = async () => {
    if (!selectedError) return

    setAnalyzingError(true)
    setErrorAnalysis('')

    try {
      const response = await textAPI.process(selectedError.id, `Проанализируй эту ошибку транскрибации и объясни в чём проблема и как её решить:\n\n${selectedError.error_message}`)
      setErrorAnalysis(response.data.result)
      toast.success('Анализ ошибки получен')
    } catch (error) {
      toast.error('Не удалось проанализировать ошибку')
      setErrorAnalysis('Ошибка анализа: ' + (error.response?.data?.detail || error.message))
    } finally {
      setAnalyzingError(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  const statusBadge = (text) => {
    const colors = {
      queued: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      unread: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      read: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    }
    const labels = {
      queued: 'В очереди',
      processing: 'В процессе',
      unread: 'Не прочитано',
      read: 'Прочитано',
      failed: 'Ошибка',
    }

    if (text.status === 'failed') {
      return (
        <button
          onClick={() => {
            setSelectedError(text)
            setErrorAnalysis('')
          }}
          className={`px-2 py-1 text-xs font-semibold rounded-full ${colors.failed} hover:opacity-80 transition-opacity flex items-center gap-1 cursor-pointer`}
          title="Нажмите, чтобы посмотреть ошибку"
        >
          <AlertCircle className="w-3 h-3" />
          {labels.failed}
        </button>
      )
    }

    if (text.status === 'queued') {
      return (
        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${colors.queued} flex items-center gap-1`}>
          <Clock className="w-3 h-3" />
          {labels.queued}
        </span>
      )
    }

    if (text.status === 'processing') {
      return (
        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${colors.processing} flex items-center gap-1`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          {labels.processing}
        </span>
      )
    }

    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${colors[text.status] || colors.read}`}>
        {labels[text.status] || text.status}
      </span>
    )
  }

  // Processing metrics component
  const processingMetrics = (text) => {
    // Only show for processing status
    if (text.status !== 'processing') return null

    // Calculate elapsed seconds from server-stored timestamp (set by client)
    const startTimeMs = text.started_at
    const elapsedSeconds = startTimeMs ? Math.floor((Date.now() - startTimeMs) / 1000) : 0

    // Estimated total time (if we have duration)
    const estimatedMinutes = text.duration ? calculateEstimatedTime(text.duration, text.method) : null

    return (
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2 text-xs">
        {startTimeMs ? (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Timer className="w-3 h-3" />
            <span>Время в процессе: {formatElapsedTime(elapsedSeconds)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Инициализация...</span>
          </div>
        )}
        {estimatedMinutes !== null && (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Clock className="w-3 h-3" />
            <span>Это займёт примерно {formatMinutes(estimatedMinutes)}</span>
          </div>
        )}
      </div>
    )
  }

  // Count processing and queued texts
  const processingCount = texts?.filter(t => t.status === 'processing').length || 0
  const queuedCount = texts?.filter(t => t.status === 'queued').length || 0
  const activeCount = processingCount + queuedCount

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold">Тексты</h1>
          {activeCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="text-xs sm:text-sm text-blue-700 dark:text-blue-300">
                Обновляется ({processingCount} / {queuedCount})
              </span>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {['all', 'queued', 'processing', 'unread', 'read', 'failed'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {status === 'all' && 'Все'}
              {status === 'queued' && 'В очереди'}
              {status === 'processing' && 'В процессе'}
              {status === 'unread' && 'Не прочитано'}
              {status === 'read' && 'Прочитано'}
              {status === 'failed' && 'Ошибки'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по текстам..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {texts?.map((text) => (
          <div
            key={text.id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex justify-between items-start gap-2 mb-2">
              <h3 className="text-base sm:text-lg font-semibold truncate flex-1">{text.title}</h3>
              {statusBadge(text)}
            </div>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">
              {text.content || 'Идет обработка...'}
            </p>

            {/* Processing metrics - ONLY for processing status */}
            {processingMetrics(text)}

            <div className="flex gap-2 mt-4">
              {/* Only show "Open" button for successfully completed transcriptions */}
              {text.status === 'unread' || text.status === 'read' ? (
                <Link
                  to={`/texts/${text.id}`}
                  className="flex-1 px-2 sm:px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-center text-xs sm:text-sm flex items-center justify-center"
                >
                  <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                  Открыть
                </Link>
              ) : (
                <div className="flex-1 px-2 sm:px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg text-center text-xs sm:text-sm flex items-center justify-center cursor-not-allowed">
                  <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                  <span className="hidden sm:inline">{text.status === 'queued' ? 'В очереди' : text.status === 'processing' ? 'Обрабатывается' : 'Недоступно'}</span>
                  <span className="sm:hidden">{text.status === 'queued' ? 'Очередь' : text.status === 'processing' ? 'Процесс' : 'Нет'}</span>
                </div>
              )}
              <button
                onClick={() => setDeleteConfirm({ textId: text.id, textTitle: text.title })}
                className="px-2 sm:px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs sm:text-sm"
              >
                <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        ))}

        {(!texts || texts.length === 0) && (
          <div className="col-span-full text-center py-12 text-gray-500">
            <p>Нет текстов</p>
          </div>
        )}
      </div>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteMutation.mutate(deleteConfirm.textId)}
        title="Удалить текст?"
        message={`Вы уверены, что хотите удалить текст "${deleteConfirm?.textTitle}"? Это действие нельзя отменить.`}
        confirmText="Удалить"
        cancelText="Отмена"
        type="danger"
      />

      {/* Error Modal */}
      {selectedError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-3xl w-full max-h-[85vh] sm:max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 flex-shrink-0" />
                <h2 className="text-base sm:text-xl font-bold truncate">Ошибка транскрибации</h2>
              </div>
              <button
                onClick={() => {
                  setSelectedError(null)
                  setErrorAnalysis('')
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 ml-2"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              <div>
                <h3 className="text-sm sm:text-base font-semibold mb-2">Текст:</h3>
                <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300">{selectedError.title}</p>
              </div>

              <div>
                <h3 className="text-sm sm:text-base font-semibold mb-2">Лог ошибки:</h3>
                <pre className="bg-gray-100 dark:bg-gray-900 p-3 sm:p-4 rounded-lg text-xs sm:text-sm overflow-x-auto text-red-600 dark:text-red-400 whitespace-pre-wrap">
                  {selectedError.error_message || 'Нет информации об ошибке'}
                </pre>
              </div>

              {errorAnalysis && (
                <div>
                  <h3 className="text-sm sm:text-base font-semibold mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    Анализ ошибки (LLM):
                  </h3>
                  <div className="bg-purple-50 dark:bg-purple-900/20 p-3 sm:p-4 rounded-lg text-xs sm:text-sm whitespace-pre-wrap">
                    {errorAnalysis}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={handleAnalyzeError}
                disabled={analyzingError}
                className="flex-1 px-4 py-2 text-sm sm:text-base bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {analyzingError ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Анализируем...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span className="hidden sm:inline">Попросить LLM проанализировать</span>
                    <span className="sm:hidden">Анализ LLM</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setSelectedError(null)
                  setErrorAnalysis('')
                }}
                className="px-4 py-2 text-sm sm:text-base bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
