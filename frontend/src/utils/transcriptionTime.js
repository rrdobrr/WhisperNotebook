/**
 * Calculate estimated transcription time based on audio duration and method
 *
 * Benchmarks:
 * - Local: 14 min audio = 8 min processing, coefficient = 8/14 = 0.57
 * - API: very fast, coefficient = 0.02 (rough estimate)
 */

export const calculateEstimatedTime = (audioDurationSeconds, method) => {
  if (!audioDurationSeconds || audioDurationSeconds <= 0) {
    return null
  }

  const audioDurationMinutes = audioDurationSeconds / 60

  if (method === 'local') {
    // Local transcription: 14 min audio = 8 min processing
    return audioDurationMinutes * 0.57
  } else {
    // OpenAI API: very fast, ~2% of audio duration
    return audioDurationMinutes * 0.02
  }
}

/**
 * Calculate elapsed time since a timestamp in seconds
 */
export const calculateElapsedSeconds = (startedAt) => {
  if (!startedAt) {
    return 0
  }

  // Parse as UTC by replacing space with T and ensuring Z suffix
  let utcDateStr = startedAt.trim()
  if (!utcDateStr.endsWith('Z')) {
    utcDateStr += 'Z'
  }

  // Force UTC parsing by using Date.parse or manual parsing
  const startTimeMs = Date.parse(utcDateStr)

  // Check if date is valid
  if (isNaN(startTimeMs)) {
    console.error('Invalid date:', startedAt)
    return 0
  }

  // Use Date.now() which returns milliseconds since epoch in UTC
  const nowMs = Date.now()
  const diffMs = nowMs - startTimeMs
  const seconds = Math.max(0, Math.floor(diffMs / 1000))

  return seconds
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export const formatElapsedTime = (seconds) => {
  if (!seconds || seconds < 0) {
    return '0:00'
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }
}

/**
 * Format minutes to human-readable string
 */
export const formatMinutes = (minutes) => {
  if (minutes === null || minutes === undefined || minutes < 0) {
    return 'Неизвестно'
  }

  if (minutes < 1) {
    const seconds = Math.round(minutes * 60)
    return `${seconds} сек`
  }

  if (minutes < 60) {
    return `${Math.round(minutes)} мин`
  }

  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return `${hours} ч ${mins} мин`
}
