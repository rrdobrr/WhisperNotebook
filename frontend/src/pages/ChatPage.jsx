import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chatAPI, textAPI, settingsAPI } from '../api/client'
import { Plus, Send, Trash2, MessageSquare, FileText, X } from 'lucide-react'
import toast from 'react-hot-toast'
import ConfirmDialog from '../components/ConfirmDialog'

export default function ChatPage() {
  const { chatId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const messageInputRef = useRef(null)
  const [selectedChat, setSelectedChat] = useState(chatId ? parseInt(chatId) : null)
  const [message, setMessage] = useState('')
  const [model, setModel] = useState('gpt-4')
  const [showTexts, setShowTexts] = useState(false)
  const [attachedTexts, setAttachedTexts] = useState([])
  const [chatToDelete, setChatToDelete] = useState(null)
  const [showNoKeyDialog, setShowNoKeyDialog] = useState(false)
  const queryClient = useQueryClient()

  // Query OpenAI key status
  const { data: keyStatus } = useQuery({
    queryKey: ['openai-key-status'],
    queryFn: async () => {
      const response = await settingsAPI.getOpenAIKeyStatus()
      return response.data
    },
  })

  // Load settings
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settingsAPI.get()
      return response.data
    },
  })

  // Load chats
  const { data: chats } = useQuery({
    queryKey: ['chats'],
    queryFn: async () => {
      const response = await chatAPI.getAll()
      return response.data
    },
  })

  // Sync selectedChat with URL
  useEffect(() => {
    if (chatId) {
      setSelectedChat(parseInt(chatId))
    }
  }, [chatId])

  // Update model based on selected chat or settings
  useEffect(() => {
    if (selectedChat && chats) {
      // If a chat is selected, use its model
      const chat = chats.find((c) => c.id === selectedChat)
      if (chat?.model) {
        setModel(chat.model)
      }
    } else if (settings?.default_model) {
      // If no chat is selected, use default from settings
      setModel(settings.default_model)
    }
  }, [selectedChat, chats, settings])

  // Load attached texts from navigation state
  useEffect(() => {
    if (location.state?.attachedTextIds) {
      // Fetch text objects for attached IDs
      const fetchAttachedTexts = async () => {
        const texts = []
        for (const textId of location.state.attachedTextIds) {
          try {
            const response = await textAPI.getById(textId)
            texts.push(response.data)
          } catch (error) {
            console.error('Error fetching attached text:', error)
          }
        }
        setAttachedTexts(texts)
        // Focus input after loading attachments
        setTimeout(() => {
          messageInputRef.current?.focus()
        }, 100)
      }
      fetchAttachedTexts()
      // Clear the state after loading
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  // Cleanup empty chats on unmount
  useEffect(() => {
    return () => {
      // On unmount, check if selected chat is empty and delete it
      if (selectedChat) {
        const checkAndDeleteEmptyChat = async () => {
          try {
            const response = await chatAPI.getMessages(selectedChat)
            const messages = response.data
            // If chat has no messages, delete it
            if (!messages || messages.length === 0) {
              await chatAPI.delete(selectedChat)
            }
          } catch (error) {
            // Silently fail - chat might already be deleted or user might be offline
            console.error('Error checking/deleting empty chat:', error)
          }
        }
        checkAndDeleteEmptyChat()
      }
    }
  }, [selectedChat])

  // Update URL when selecting a chat
  const handleSelectChat = (id) => {
    setSelectedChat(id)
    navigate(`/chat/${id}`)
  }

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
    mutationFn: (modelToUse) => {
      return chatAPI.create({ title: 'New Chat', model: modelToUse })
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries(['chats'])
      setSelectedChat(response.data.id)
      navigate(`/chat/${response.data.id}`)
    },
  })

  const handleCreateChat = () => {
    // Check if API key exists
    if (!keyStatus?.has_key) {
      setShowNoKeyDialog(true)
      return
    }
    // Use default model from settings, not the current state
    const modelToUse = settings?.default_model || 'gpt-4o'
    createChatMutation.mutate(modelToUse)
  }

  const deleteChatMutation = useMutation({
    mutationFn: (id) => chatAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['chats'])
      setChatToDelete(null)
      // If deleted chat was selected, navigate to /chat
      if (chatToDelete === selectedChat) {
        setSelectedChat(null)
        navigate('/chat')
      }
      toast.success('Чат удален')
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error.response?.data?.detail || error.message}`)
    },
  })

  const updateChatMutation = useMutation({
    mutationFn: ({ chatId, model }) => chatAPI.update(chatId, { model }),
    onSuccess: () => {
      queryClient.invalidateQueries(['chats'])
    },
  })

  const handleModelChange = (newModel) => {
    setModel(newModel)
    if (selectedChat) {
      updateChatMutation.mutate({ chatId: selectedChat, model: newModel })
    }
  }

  const models = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4o', 'gpt-4o-mini']

  const handleSendMessage = async () => {
    if (!message.trim() && attachedTexts.length === 0) return

    // Save data before clearing
    const messageData = {
      content: message,
      text_ids: attachedTexts.map((t) => t.id),
      attachments: attachedTexts.map((t) => ({ text_id: t.id, title: t.title }))
    }

    // Clear immediately
    setMessage('')
    setAttachedTexts([])

    // Add user message optimistically
    const tempUserMessage = {
      id: Date.now(),
      chat_id: selectedChat,
      role: 'user',
      content: messageData.content,
      attachments: messageData.attachments || [],
      cost: 0,
      created_at: new Date().toISOString()
    }

    queryClient.setQueryData(['messages', selectedChat], (old) => {
      return old ? [...old, tempUserMessage] : [tempUserMessage]
    })

    // Add placeholder for assistant message
    const tempAssistantMessage = {
      id: Date.now() + 1,
      chat_id: selectedChat,
      role: 'assistant',
      content: '',
      cost: 0,
      created_at: new Date().toISOString()
    }

    queryClient.setQueryData(['messages', selectedChat], (old) => {
      return old ? [...old, tempAssistantMessage] : [tempAssistantMessage]
    })

    try {
      // Send with streaming
      await chatAPI.sendMessageStream(selectedChat, messageData, (chunk) => {
        // Update assistant message with streaming content
        queryClient.setQueryData(['messages', selectedChat], (old) => {
          if (!old) return old
          const newMessages = [...old]
          const lastMessage = newMessages[newMessages.length - 1]
          if (lastMessage.id === tempAssistantMessage.id) {
            lastMessage.content += chunk
          }
          return newMessages
        })
      })

      // After streaming is complete, refresh to get real IDs and cost
      queryClient.invalidateQueries(['messages', selectedChat])
    } catch (error) {
      // Remove optimistic messages on error
      queryClient.setQueryData(['messages', selectedChat], (old) => {
        if (!old) return old
        return old.filter(msg => msg.id !== tempUserMessage.id && msg.id !== tempAssistantMessage.id)
      })
      toast.error(`Ошибка: ${error.message}`)
    }
  }

  const handleDrop = (e, text) => {
    e.preventDefault()
    if (!attachedTexts.find((t) => t.id === text.id)) {
      setAttachedTexts([...attachedTexts, text])
    }
  }

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* Sidebar */}
      <div className="md:w-80 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 flex flex-col md:h-full">
        <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-2 mb-3 sm:mb-4">
            <button
              onClick={() => setShowTexts(false)}
              className={`flex-1 px-3 sm:px-4 py-2 rounded-lg flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm ${
                !showTexts ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4" />
              Чаты
            </button>
            <button
              onClick={() => setShowTexts(true)}
              className={`flex-1 px-3 sm:px-4 py-2 rounded-lg flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm ${
                showTexts ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
              Тексты
            </button>
          </div>

          {!showTexts && (
            <button
              onClick={handleCreateChat}
              className="w-full px-3 sm:px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center justify-center gap-2 text-xs sm:text-sm"
            >
              <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
              Новый чат
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto max-h-48 md:max-h-none">
          {!showTexts ? (
            <div className="p-2">
              {chats?.map((chat) => (
                <div
                  key={chat.id}
                  className={`w-full p-2 sm:p-3 rounded-lg mb-2 text-xs sm:text-sm flex items-center justify-between group ${
                    selectedChat === chat.id
                      ? 'bg-primary-100 dark:bg-primary-900'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <button
                    onClick={() => handleSelectChat(chat.id)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="font-medium truncate">{chat.title}</p>
                    <p className="text-xs text-gray-500">{chat.model}</p>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setChatToDelete(chat.id)
                    }}
                    className="ml-2 p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-2">
              {texts?.map((text) => (
                <div
                  key={text.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text', JSON.stringify(text))}
                  className="p-2 sm:p-3 rounded-lg border border-gray-200 dark:border-gray-700 mb-2 cursor-move hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <p className="font-medium text-xs sm:text-sm truncate">{text.title}</p>
                  <p className="text-xs text-gray-500 line-clamp-2">{text.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {selectedChat ? (
          <>
            <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
              <h2 className="text-base sm:text-lg font-semibold truncate">
                {chats?.find((c) => c.id === selectedChat)?.title}
              </h2>
              <select
                value={model}
                onChange={(e) => handleModelChange(e.target.value)}
                className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
              {messages?.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-2xl px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-sm sm:text-base ${
                      msg.role === 'user'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1 sm:gap-2">
                        {msg.attachments.map((att, idx) => (
                          <div
                            key={idx}
                            className={`px-2 py-1 rounded-full text-xs ${
                              msg.role === 'user'
                                ? 'bg-primary-700'
                                : 'bg-gray-200 dark:bg-gray-700'
                            }`}
                          >
                            📎 {att.title}
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.cost > 0 && (
                      <p className="text-xs mt-2 opacity-70">${msg.cost.toFixed(4)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700">
              {attachedTexts.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {attachedTexts.map((text) => (
                    <div
                      key={text.id}
                      className="px-2 sm:px-3 py-1 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center gap-1 sm:gap-2"
                    >
                      <span className="text-xs sm:text-sm truncate max-w-[150px]">{text.title}</span>
                      <button onClick={() => setAttachedTexts(attachedTexts.filter((t) => t.id !== text.id))}>
                        <X className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
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
                  ref={messageInputRef}
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Введите сообщение..."
                  className="flex-1 px-3 sm:px-4 py-2 text-sm sm:text-base bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
                />
                <button
                  onClick={handleSendMessage}
                  className="px-4 sm:px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex-shrink-0"
                >
                  <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 p-4 text-center">
            <p className="text-sm sm:text-base">Выберите чат или создайте новый</p>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={chatToDelete !== null}
        onClose={() => setChatToDelete(null)}
        onConfirm={() => deleteChatMutation.mutate(chatToDelete)}
        title="Удалить чат?"
        message="Вы уверены, что хотите удалить этот чат? Все сообщения будут удалены безвозвратно."
        confirmText="Удалить"
        cancelText="Отмена"
      />

      {/* No API Key Dialog */}
      <ConfirmDialog
        isOpen={showNoKeyDialog}
        onClose={() => setShowNoKeyDialog(false)}
        onConfirm={() => setShowNoKeyDialog(false)}
        title="OpenAI API ключ не найден"
        message="Для использования чатов необходимо добавить API ключ в переменные окружения Railway (OPENAI_API_KEY). После добавления перезапустите приложение."
        confirmText="Хорошо"
        cancelText={null}
        type="warning"
      />
    </div>
  )
}
