'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useScaleMule } from '../provider'
import type { ConnectionStatus } from '@scalemule/sdk'

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
  /** Channels to subscribe to */
  channels?: string[]
  /** Called when a message arrives on any subscribed channel */
  onMessage?: (channel: string, data: unknown) => void
  /** Auto-connect on mount (default: true) — subscribing auto-connects */
  autoConnect?: boolean
}

export interface UseRealtimeReturn {
  /** Current connection status */
  status: RealtimeStatus
  /** Last received message */
  lastMessage: { channel: string; data: unknown } | null
  /** Manually disconnect */
  disconnect: () => void
  /** Subscribe to an additional channel (auto-connects) */
  subscribe: (channel: string, callback?: (data: unknown) => void) => () => void
  /** Publish data to a channel */
  publish: (channel: string, data: unknown) => void
}

// ============================================================================
// Hook — delegates to base SDK RealtimeService via provider context
// ============================================================================

/**
 * Real-time updates hook via WebSocket.
 *
 * Uses the base SDK's RealtimeService (shared singleton created in the provider)
 * to ensure correct protocol handling and single WebSocket connection per page.
 *
 * @example
 * ```tsx
 * function ChatNotifications() {
 *   const { status, lastMessage } = useRealtime({
 *     channels: ['chat:room-1', 'notifications'],
 *     onMessage: (channel, data) => {
 *       console.log(`${channel}:`, data)
 *     },
 *   })
 *
 *   return <div>Status: {status}</div>
 * }
 * ```
 */
export function useRealtime(options?: UseRealtimeOptions): UseRealtimeReturn {
  const { realtime } = useScaleMule()
  const [status, setStatus] = useState<RealtimeStatus>('disconnected')
  const [lastMessage, setLastMessage] = useState<{ channel: string; data: unknown } | null>(null)
  const manualUnsubscribesRef = useRef<Array<() => void>>([])
  const autoUnsubscribesRef = useRef<Array<() => void>>([])
  const onMessageRef = useRef<UseRealtimeOptions['onMessage']>(undefined)
  const channelSignature = (options?.channels ?? []).join('\u001f')

  useEffect(() => {
    onMessageRef.current = options?.onMessage
  }, [options?.onMessage])

  const disconnect = useCallback(() => {
    realtime.disconnect()
  }, [realtime])

  const subscribe = useCallback(
    (channel: string, callback?: (data: unknown) => void) => {
      const unsub = realtime.subscribe(channel, (data: unknown) => {
        setLastMessage({ channel, data })
        callback?.(data)
        onMessageRef.current?.(channel, data)
      })
      manualUnsubscribesRef.current.push(unsub)
      return () => {
        manualUnsubscribesRef.current = manualUnsubscribesRef.current.filter((fn) => fn !== unsub)
        unsub()
      }
    },
    [realtime]
  )

  const publish = useCallback(
    (channel: string, data: unknown) => {
      realtime.publish(channel, data)
    },
    [realtime]
  )

  // Subscribe to status changes
  useEffect(() => {
    const unsub = realtime.onStatusChange((newStatus: ConnectionStatus) => {
      setStatus(newStatus)
    })
    return unsub
  }, [realtime])

  // Keep auto subscriptions in sync with options.channels
  useEffect(() => {
    for (const unsub of autoUnsubscribesRef.current) {
      unsub()
    }
    autoUnsubscribesRef.current = []

    for (const channel of options?.channels ?? []) {
      const unsub = realtime.subscribe(channel, (data: unknown) => {
        setLastMessage({ channel, data })
        onMessageRef.current?.(channel, data)
      })
      autoUnsubscribesRef.current.push(unsub)
    }

    return () => {
      for (const unsub of autoUnsubscribesRef.current) {
        unsub()
      }
      autoUnsubscribesRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtime, channelSignature])

  // Cleanup on unmount — unsubscribe channels but do NOT disconnect the shared
  // RealtimeService singleton. Other hooks may still need the connection.
  useEffect(() => {
    return () => {
      for (const unsub of manualUnsubscribesRef.current) {
        unsub()
      }
      manualUnsubscribesRef.current = []

      for (const unsub of autoUnsubscribesRef.current) {
        unsub()
      }
      autoUnsubscribesRef.current = []
    }
  }, [])

  return { status, lastMessage, disconnect, subscribe, publish }
}
