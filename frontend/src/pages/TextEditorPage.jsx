import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { textAPI } from '../api/client'
import ReactMarkdown from 'react-markdown'
import { Save, Copy, Sparkles, Wand2, Search, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TextEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isPreview, setIsPreview] = useState(false)

  const { data: text, isLoading } = useQuery({
    queryKey: ['text', id],
    queryFn: async () => {
      const response = await textAPI.getById(id)
      return response.data
    },
  })

  useEffect(() => {
    if (text) {
      setTitle(text.title)
      setContent(text.content)
    }
  }, [text])

  const updateMutation = useMutation({
    mutationFn: () => textAPI.update(id, { title, content }),
    onSuccess: () => {
      queryClient.invalidateQueries(['text', id])
      toast.success('Текст сохранен')
    },
  })

  const summarizeMutation = useMutation({
    mutationFn: () => textAPI.summarize(id),
    onSuccess: (response) => {
      setContent(response.data.summary)
      toast.success('Текст саммаризирован')
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error.response?.data?.detail || error.message}`)
    },
  })

  const processMutation = useMutation({
    mutationFn: (prompt) => textAPI.process(id, prompt),
    onSuccess: (response) => {
      setContent(response.data.result)
      setCustomPrompt('')
      toast.success('Текст обработан')
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error.response?.data?.detail || error.message}`)
    },
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    toast.success('Текст скопирован')
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
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-2xl font-bold w-full bg-transparent border-none outline-none mb-4"
          placeholder="Название текста..."
        />

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
          </button>

          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Копировать
          </button>

          <button
            onClick={() => summarizeMutation.mutate()}
            disabled={summarizeMutation.isPending}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {summarizeMutation.isPending ? 'Саммаризация...' : 'Саммаризировать'}
          </button>

          <div className="flex gap-2">
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Введите промпт для обработки..."
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
            <button
              onClick={() => customPrompt && processMutation.mutate(customPrompt)}
              disabled={!customPrompt || processMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
            >
              <Wand2 className="w-4 h-4" />
              {processMutation.isPending ? 'Обработка...' : 'Обработать'}
            </button>
          </div>

          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Поиск..."
              className="pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
          </div>

          <button
            onClick={() => setIsPreview(!isPreview)}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            {isPreview ? 'Редактор' : 'Предпросмотр'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isPreview ? (
          <div className="prose dark:prose-invert max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full bg-transparent border-none outline-none resize-none font-mono"
            placeholder="Начните печатать..."
          />
        )}
      </div>
    </div>
  )
}
