import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chatAPI, textAPI } from '../api/client'
import { Plus, Send, Trash2, MessageSquare, FileText, X } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ChatPage() {
  const [selectedChat, setSelectedChat] = useState(null)
  const [message, setMessage] = useState('')
  const [model, setModel] = useState('gpt-4')
  const [showTexts, setShowTexts] = useState(false)
  const [attachedTexts, setAttachedTexts] = useState([])
  const queryClient = useQueryClient()

  const { data: chats } = useQuery({
    queryKey: ['chats'],
    queryFn: async () => {
      const response = await chatAPI.getAll()
      return response.data
    },
  })

  const { data: texts } = useQuery({
    queryKey: ['texts'],
    queryFn: async () => {
      const response = await textAPI.getAll()
      return response.data
    },
    enabled: showTexts,
  })

  const { data: messages } = useQuery({
    queryKey: ['messages', selectedChat],
    queryFn: async () => {
      const response = await chatAPI.getMessages(selectedChat)
      return response.data
    },
    enabled: !!selectedChat,
  })

  const createChatMutation = useMutation({
    mutationFn: () => chatAPI.create({ title: 'New Chat', model }),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['chats'])
      setSelectedChat(response.data.id)
    },
  })

  const sendMessageMutation = useMutation({
    mutationFn: (data) => chatAPI.sendMessage(selectedChat, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['messages', selectedChat])
      setMessage('')
      setAttachedTexts([])
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error.response?.data?.detail || error.message}`)
    },
  })

  const models = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4o', 'gpt-4o-mini']

  const handleSendMessage = () => {
    if (!message.trim() && attachedTexts.length === 0) return
    sendMessageMutation.mutate({
      content: message,
      text_ids: attachedTexts.map((t) => t.id),
    })
  }

  const handleDrop = (e, text) => {
    e.preventDefault()
    if (!attachedTexts.find((t) => t.id === text.id)) {
      setAttachedTexts([...attachedTexts, text])
    }
  }

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setShowTexts(false)}
              className={`flex-1 px-4 py-2 rounded-lg flex items-center justify-center gap-2 ${
                !showTexts ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Чаты
            </button>
            <button
              onClick={() => setShowTexts(true)}
              className={`flex-1 px-4 py-2 rounded-lg flex items-center justify-center gap-2 ${
                showTexts ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              Тексты
            </button>
          </div>

          {!showTexts && (
            <button
              onClick={() => createChatMutation.mutate()}
              className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Новый чат
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {!showTexts ? (
            <div className="p-2">
              {chats?.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => setSelectedChat(chat.id)}
                  className={`w-full p-3 rounded-lg text-left mb-2 ${
                    selectedChat === chat.id
                      ? 'bg-primary-100 dark:bg-primary-900'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <p className="font-medium truncate">{chat.title}</p>
                  <p className="text-xs text-gray-500">{chat.model}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-2">
              {texts?.map((text) => (
                <div
                  key={text.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text', JSON.stringify(text))}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 mb-2 cursor-move hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <p className="font-medium text-sm truncate">{text.title}</p>
                  <p className="text-xs text-gray-500 line-clamp-2">{text.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedChat ? (
          <>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {chats?.find((c) => c.id === selectedChat)?.title}
              </h2>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages?.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-2xl px-4 py-3 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.cost > 0 && (
                      <p className="text-xs mt-2 opacity-70">${msg.cost.toFixed(4)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              {attachedTexts.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {attachedTexts.map((text) => (
                    <div
                      key={text.id}
                      className="px-3 py-1 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center gap-2"
                    >
                      <span className="text-sm">{text.title}</span>
                      <button onClick={() => setAttachedTexts(attachedTexts.filter((t) => t.id !== text.id))}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div
                className="flex gap-2"
                onDrop={(e) => {
                  e.preventDefault()
                  const text = JSON.parse(e.dataTransfer.getData('text'))
                  handleDrop(e, text)
                }}
                onDragOver={(e) => e.preventDefault()}
              >
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Введите сообщение... (или перетащите текст)"
                  className="flex-1 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sendMessageMutation.isPending}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Выберите чат или создайте новый</p>
          </div>
        )}
      </div>
    </div>
  )
}
