/** @vitest-environment jsdom */

import React from 'react'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RegisterHoneypot, useHoneypot } from './RegisterHoneypot'

describe('RegisterHoneypot component', () => {
  it('renders offscreen with aria-hidden and tabIndex -1', () => {
    render(<RegisterHoneypot />)
    const container = screen.getByTestId('sm-register-honeypot')
    expect(container).toBeTruthy()
    expect(container.getAttribute('aria-hidden')).toBe('true')
    expect(container.getAttribute('tabIndex')).toBe('-1')
    expect(container.style.position).toBe('absolute')
    expect(container.style.opacity).toBe('0')
    expect(container.style.pointerEvents).toBe('none')

    const input = container.querySelector('input')
    expect(input).toBeTruthy()
    expect(input?.getAttribute('name')).toBe('website')
    expect(input?.getAttribute('tabIndex')).toBe('-1')
    expect(input?.getAttribute('autoComplete')).toBe('off')
  })

  it('supports custom name prop like company or publication_code', () => {
    render(<RegisterHoneypot name="company" id="my_company" />)
    const input = screen.getByRole('textbox', { hidden: true })
    expect(input.getAttribute('name')).toBe('company')
    expect(input.getAttribute('id')).toBe('my_company')
  })

  it('works with controlled value and onChange', () => {
    let captured = ''
    render(
      <RegisterHoneypot
        name="website"
        value=""
        onChange={(e) => {
          captured = e.target.value
        }}
      />
    )
    const input = screen.getByRole('textbox', { hidden: true })
    fireEvent.change(input, { target: { value: 'https://spambot.xyz' } })
    expect(captured).toBe('https://spambot.xyz')
  })
})

describe('useHoneypot hook', () => {
  it('manages controlled honeypot state and payload', () => {
    const { result } = renderHook(() => useHoneypot('website'))

    expect(result.current.value).toBe('')
    expect(result.current.honeypotPayload).toEqual({})
    expect(result.current.honeypotProps.name).toBe('website')

    act(() => {
      result.current.honeypotProps.onChange({
        target: { value: 'https://spambot.xyz' },
      } as React.ChangeEvent<HTMLInputElement>)
    })

    expect(result.current.value).toBe('https://spambot.xyz')
    expect(result.current.honeypotPayload).toEqual({
      website: 'https://spambot.xyz',
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.value).toBe('')
    expect(result.current.honeypotPayload).toEqual({})
  })
})
