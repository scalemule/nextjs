'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useScaleMule } from '../provider'
import type { User, ApiError } from '../types'

// ============================================================================
// Types
// ============================================================================

export type RealtimeEvent =
  | 'user.updated'
  | 'user.deleted'
  | 'session.expired'
  | 'file.uploaded'
  | 'file.deleted'
  | 'file.scanned'
  | 'notification'
  | string

export interface RealtimeMessage<T = unknown> {
  event: RealtimeEvent
  data: T
  timestamp: string
}

export type RealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface UseRealtimeOptions {
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean
  /** Events to subscribe to (default: all) */
  events?: RealtimeEvent[]
  /** Reconnect on disconnect (default: true) */
  autoReconnect?: boolean
  /** Max reconnect attempts (default: 5) */
  maxReconnectAttempts?: number
  /** Reconnect delay in ms (default: 1000, doubles each attempt) */
  reconnectDelay?: number
}

export interface UseRealtimeReturn {
  /** Current connection status */
  status: RealtimeStatus
  /** Last error */
  error: ApiError | null
  /** Connect to realtime */
  connect: () => void
  /** Disconnect from realtime */
  disconnect: () => void
  /** Subscribe to an event */
  subscribe: <T>(event: RealtimeEvent, callback: (data: T) => void) => () => void
  /** Send a message (if supported) */
  send: (event: string, data: unknown) => void
  /** Last received message */
  lastMessage: RealtimeMessage | null
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Real-time updates hook via WebSocket
 *
 * Provides live updates for user state, files, and notifications.
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { status, subscribe } = useRealtime()
 *
 *   useEffect(() => {
 *     // Subscribe to file uploads
 *     const unsubscribe = subscribe('file.uploaded', (data) => {
 *       console.log('New file uploaded:', data)
 *       refreshFiles()
 *     })
 *
 *     return () => unsubscribe()
 *   }, [subscribe])
 *
 *   return (
 *     <div>
 *       <span>Status: {status}</span>
 *     </div>
 *   )
 * }
 * ```
 */
export function useRealtime(options: UseRealtimeOptions = {}): UseRealtimeReturn {
  const {
    autoConnect = true,
    events,
    autoReconnect = true,
    maxReconnectAttempts = 5,
    reconnectDelay = 1000,
  } = options

  const { client, user, setUser } = useScaleMule()

  const [status, setStatus] = useState<RealtimeStatus>('disconnected')
  const [error, setError] = useState<ApiError | null>(null)
  const [lastMessage, setLastMessage] = useState<RealtimeMessage | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null)
  const subscribersRef = useRef<Map<RealtimeEvent, Set<(data: unknown) => void>>>(new Map())

  /**
   * Get WebSocket URL from gateway URL
   */
  const getWebSocketUrl = useCallback((): string => {
    const gatewayUrl = client.getGatewayUrl()
    const wsUrl = gatewayUrl.replace(/^https?:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
    return `${wsUrl}/v1/realtime`
  }, [client])

  /**
   * Handle incoming message
   */
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: RealtimeMessage = JSON.parse(event.data)
        setLastMessage(message)

        // Handle built-in events
        switch (message.event) {
          case 'user.updated':
            if (user && (message.data as User).id === user.id) {
              setUser(message.data as User)
            }
            break
          case 'session.expired':
            // Clear session and redirect to login
            client.clearSession()
            setUser(null)
            break
        }

        // Notify subscribers
        const subscribers = subscribersRef.current.get(message.event)
        if (subscribers) {
          subscribers.forEach((callback) => callback(message.data))
        }

        // Notify wildcard subscribers
        const wildcardSubscribers = subscribersRef.current.get('*')
        if (wildcardSubscribers) {
          wildcardSubscribers.forEach((callback) => callback(message))
        }
      } catch (err) {
        console.error('[ScaleMule Realtime] Failed to parse message:', err)
      }
    },
    [client, user, setUser]
  )

  /**
   * Connect to WebSocket
   */
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    if (!user) {
      setError({ code: 'NOT_AUTHENTICATED', message: 'Must be logged in to connect' })
      return
    }

    const applicationId = client.getApplicationId()
    if (!applicationId) {
      setError({ code: 'MISSING_APP_ID', message: 'applicationId is required for realtime features. Add it to your ScaleMuleProvider config.' })
      return
    }

    setStatus('connecting')
    setError(null)

    // Connect without token in URL - we'll authenticate via message
    const url = getWebSocketUrl()

    try {
      const ws = new WebSocket(url)

      ws.onopen = () => {
        // Send auth message with token and app_id
        const sessionToken = client.getSessionToken()
        ws.send(JSON.stringify({
          type: 'auth',
          token: sessionToken,
          app_id: applicationId,
        }))
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)

          // Handle auth_success response
          if (message.type === 'auth_success') {
            setStatus('connected')
            reconnectAttempts.current = 0

            // Subscribe to specific events if provided
            if (events && events.length > 0) {
              ws.send(JSON.stringify({ type: 'subscribe', events }))
            }
            return
          }

          // Handle error response
          if (message.type === 'error') {
            setError({ code: 'AUTH_ERROR', message: message.message || 'Authentication failed' })
            setStatus('disconnected')
            ws.close(1000)
            return
          }

          // Handle other messages
          handleMessage(event)
        } catch (err) {
          console.error('[ScaleMule Realtime] Failed to parse message:', err)
        }
      }

      ws.onerror = () => {
        setError({ code: 'WEBSOCKET_ERROR', message: 'Connection error' })
      }

      ws.onclose = (event) => {
        setStatus('disconnected')
        wsRef.current = null

        // Attempt reconnect if enabled and not intentional close
        if (autoReconnect && event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          setStatus('reconnecting')
          const delay = reconnectDelay * Math.pow(2, reconnectAttempts.current)
          reconnectAttempts.current++

          reconnectTimeout.current = setTimeout(() => {
            connect()
          }, delay)
        }
      }

      wsRef.current = ws
    } catch (err) {
      setError({
        code: 'WEBSOCKET_CONNECT_FAILED',
        message: err instanceof Error ? err.message : 'Failed to connect',
      })
      setStatus('disconnected')
    }
  }, [user, client, getWebSocketUrl, events, handleMessage, autoReconnect, maxReconnectAttempts, reconnectDelay])

  /**
   * Disconnect from WebSocket
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current)
      reconnectTimeout.current = null
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect')
      wsRef.current = null
    }

    setStatus('disconnected')
    reconnectAttempts.current = 0
  }, [])

  /**
   * Subscribe to an event
   */
  const subscribe = useCallback(
    <T>(event: RealtimeEvent, callback: (data: T) => void): (() => void) => {
      if (!subscribersRef.current.has(event)) {
        subscribersRef.current.set(event, new Set())
      }

      const typedCallback = callback as (data: unknown) => void
      subscribersRef.current.get(event)!.add(typedCallback)

      // Return unsubscribe function
      return () => {
        const subscribers = subscribersRef.current.get(event)
        if (subscribers) {
          subscribers.delete(typedCallback)
          if (subscribers.size === 0) {
            subscribersRef.current.delete(event)
          }
        }
      }
    },
    []
  )

  /**
   * Send a message
   */
  const send = useCallback((event: string, data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }))
    } else {
      console.warn('[ScaleMule Realtime] Cannot send - not connected')
    }
  }, [])

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && user) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [autoConnect, user, connect, disconnect])

  return useMemo(
    () => ({
      status,
      error,
      connect,
      disconnect,
      subscribe,
      send,
      lastMessage,
    }),
    [status, error, connect, disconnect, subscribe, send, lastMessage]
  )
}
