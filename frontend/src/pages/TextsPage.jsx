import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { textAPI } from '../api/client'
import { Search, Trash2, Edit, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'

export default function TextsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const queryClient = useQueryClient()

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
  })

  const deleteMutation = useMutation({
    mutationFn: textAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries(['texts'])
      toast.success('Текст удален')
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error.response?.data?.detail || error.message}`)
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  const statusBadge = (status) => {
    const colors = {
      processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      unread: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      read: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    }
    const labels = {
      processing: 'В процессе',
      unread: 'Не прочитано',
      read: 'Прочитано',
      failed: 'Ошибка',
    }
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${colors[status] || colors.read}`}>
        {labels[status] || status}
      </span>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-4">Тексты</h1>

        {/* Filters */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {['all', 'processing', 'unread', 'read'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {status === 'all' && 'Все'}
              {status === 'processing' && 'В процессе'}
              {status === 'unread' && 'Не прочитано'}
              {status === 'read' && 'Прочитано'}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {texts?.map((text) => (
          <div
            key={text.id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-lg font-semibold truncate flex-1">{text.title}</h3>
              {statusBadge(text.status)}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">
              {text.content || 'Идет обработка...'}
            </p>

            <div className="text-xs text-gray-500 mb-4">
              {formatDistanceToNow(new Date(text.updated_at), { addSuffix: true, locale: ru })}
            </div>

            <div className="flex gap-2">
              <Link
                to={`/texts/${text.id}`}
                className="flex-1 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-center text-sm flex items-center justify-center"
              >
                <Edit className="w-4 h-4 mr-1" />
                Открыть
              </Link>
              <button
                onClick={() => {
                  if (confirm('Удалить этот текст?')) {
                    deleteMutation.mutate(text.id)
                  }
                }}
                className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
              >
                <Trash2 className="w-4 h-4" />
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
    </div>
  )
}
