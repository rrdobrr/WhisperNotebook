import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { costsAPI } from '../api/client'
import { DollarSign, TrendingUp, Loader2 } from 'lucide-react'

export default function CostsPage() {
  const [period, setPeriod] = useState(30)

  const { data: summary, isLoading } = useQuery({
    queryKey: ['costs-summary', period],
    queryFn: async () => {
      const response = await costsAPI.getSummary(period)
      return response.data
    },
  })

  const { data: dailyCosts } = useQuery({
    queryKey: ['costs-daily', period],
    queryFn: async () => {
      const response = await costsAPI.getDaily(period)
      return response.data.daily_costs
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Мониторинг затрат</h1>

      <div className="mb-6">
        <label className="text-sm font-medium mr-4">Период:</label>
        <select
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
          className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg"
        >
          <option value={7}>7 дней</option>
          <option value={30}>30 дней</option>
          <option value={90}>90 дней</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">Всего</p>
            <DollarSign className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-3xl font-bold">${summary?.total.toFixed(2)}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">Whisper API</p>
            <TrendingUp className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-blue-600">${summary?.whisper.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {summary?.breakdown.whisper_percentage.toFixed(1)}%
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">ChatGPT</p>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-green-600">${summary?.chatgpt.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {summary?.breakdown.chatgpt_percentage.toFixed(1)}%
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">Railway</p>
            <TrendingUp className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-purple-600">${summary?.railway.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {summary?.breakdown.railway_percentage.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Daily Chart (simplified) */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Ежедневная статистика</h2>
        <div className="space-y-2">
          {dailyCosts?.map((day) => (
            <div key={day.date} className="flex items-center">
              <p className="w-24 text-sm text-gray-600 dark:text-gray-400">{day.date}</p>
              <div className="flex-1 flex gap-1">
                {day.whisper > 0 && (
                  <div
                    className="bg-blue-500 h-6 rounded"
                    style={{ width: `${(day.whisper / day.total) * 100}%` }}
                    title={`Whisper: $${day.whisper.toFixed(2)}`}
                  />
                )}
                {day.chatgpt > 0 && (
                  <div
                    className="bg-green-500 h-6 rounded"
                    style={{ width: `${(day.chatgpt / day.total) * 100}%` }}
                    title={`ChatGPT: $${day.chatgpt.toFixed(2)}`}
                  />
                )}
                {day.railway > 0 && (
                  <div
                    className="bg-purple-500 h-6 rounded"
                    style={{ width: `${(day.railway / day.total) * 100}%` }}
                    title={`Railway: $${day.railway.toFixed(2)}`}
                  />
                )}
              </div>
              <p className="w-20 text-right text-sm font-medium">${day.total.toFixed(2)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
