/** @vitest-environment jsdom */
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { NetworkAudioController } from './controller'
import { persistListening } from './persistence'
import { mergeMemory, toMemory } from './memory'
const origin = window.location.origin
const options = { storageKey: 'listening-test', networkId: 'news', hubUrl: 'https://hub.example/consent-bridge.html', allowedOrigins: [origin, 'https://hub.example'] }
const create = () => new NetworkAudioController(async () => ({ url: null }))
let cleanups: (() => void)[] = []
beforeEach(() => {
  const entries = new Map<string, string>();
  const storage = { getItem: vi.fn((key: string) => entries.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { entries.set(key, value) }), clear: () => entries.clear(), removeItem: (key: string) => entries.delete(key) };
  vi.stubGlobal('localStorage', storage);
  localStorage.clear(); history.replaceState(null, '', '/'); document.body.innerHTML = '' })
afterEach(() => { cleanups.forEach(fn => fn()); cleanups = []; vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('saves the chosen speed immediately and restores it independently of an active queue', () => {
  const first = create(); const stop = persistListening(first, options)
  first.setRate(1.75); stop()
  const second = create(); cleanups.push(persistListening(second, options))
  expect(second.getSnapshot().rate).toBe(1.75)
  expect(second.getSnapshot().status).toBe('idle')
})
it('carries only speed to an allowed network link and consumes the handoff', () => {
  const controller = create(); cleanups.push(persistListening(controller, options)); controller.setRate(2)
  const a = document.createElement('a'); a.href = 'https://hub.example/news/story?sm_consent=0'; document.body.appendChild(a)
  a.addEventListener('click', e => e.preventDefault()); a.click()
  expect(new URL(a.href).searchParams.get('sm_audio_rate')).toBe('2')
  expect(new URL(a.href).searchParams.get('sm_consent')).toBe('0')
  const outside = document.createElement('a'); outside.href = 'https://hub.example.attacker.test/news/story'; document.body.appendChild(outside)
  outside.addEventListener('click', e => e.preventDefault()); outside.click()
  expect(outside.href).not.toContain('sm_audio_rate')
  history.replaceState(null, '', '/news/article?sm_audio_rate=1.5&keep=1')
  const destination = create(); cleanups.push(persistListening(destination, { ...options, storageKey: 'destination' }))
  expect(destination.getSnapshot().rate).toBe(1.5)
  expect(location.search).toBe('?keep=1')
})
it('accepts only the configured hub window, origin, network and current request', () => {
  const controller = create(); cleanups.push(persistListening(controller, options))
  const iframe = document.querySelector('iframe')!
  iframe.dispatchEvent(new Event('load'))
  const data = { type: 'SM_LISTENING_STATE', networkId: 'news', requestId: '1', memory: { ...toMemory(controller.getSnapshot()), rate: 2, settingsUpdatedAt: Date.now() } }
  window.dispatchEvent(new MessageEvent('message', { origin: 'https://hub.example', source: window, data }))
  expect(controller.getSnapshot().rate).toBe(1)
  window.dispatchEvent(new MessageEvent('message', { origin: 'https://attacker.test', source: iframe.contentWindow, data }))
  expect(controller.getSnapshot().rate).toBe(1)
  window.dispatchEvent(new MessageEvent('message', { origin: 'https://hub.example', source: iframe.contentWindow, data }))
  expect(controller.getSnapshot().rate).toBe(2)
})
it('continues without storage and never lets an older hub preference overwrite a newer choice', () => {
  vi.mocked(localStorage.getItem).mockImplementation(() => { throw new DOMException('blocked') })
  vi.mocked(localStorage.setItem).mockImplementation(() => { throw new DOMException('blocked') })
  const controller = create(); cleanups.push(persistListening(controller, options)); controller.setRate(1.5)
  const local = toMemory(controller.getSnapshot())
  expect(mergeMemory(local, { ...local, rate: 1, settingsUpdatedAt: 1 }).rate).toBe(1.5)
})
