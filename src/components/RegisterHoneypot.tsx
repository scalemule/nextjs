'use client'

import React, { useState, useCallback } from 'react'

export type HoneypotFieldName = 'website' | 'company' | 'publication_code' | 'hp_field'

export interface RegisterHoneypotProps {
  /**
   * Field name recognized by ScaleMule honeypot defenses.
   * Defaults to 'website'.
   */
  name?: HoneypotFieldName | string
  /**
   * Controlled value if managing state in React.
   */
  value?: string
  /**
   * Change handler for controlled state.
   */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  /**
   * Optional custom id for the hidden input.
   */
  id?: string
  /**
   * Optional additional className (field is styled off-screen regardless).
   */
  className?: string
  /**
   * Optional custom accessible label text.
   */
  label?: string
}

const OFFSCREEN_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: '-9999px',
  top: '-9999px',
  opacity: 0,
  pointerEvents: 'none',
  width: 0,
  height: 0,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  clipPath: 'inset(50%)',
  border: 0,
  padding: 0,
  margin: 0,
  whiteSpace: 'nowrap',
}

/**
 * RegisterHoneypot — invisible honeypot input component for registration forms.
 *
 * Traps automated spam bots that blindly fill every visible and invisible input field.
 * When submitted with any non-empty value, ScaleMule auth silently absorbs and drops
 * the registration attempt with a synthetic 201/200 success response, preventing AWS SES
 * hard bounces, dirty accounts, and email verification spam.
 *
 * @example
 * ```tsx
 * // Uncontrolled / FormData:
 * <form onSubmit={handleRegister}>
 *   <RegisterHoneypot />
 *   <input name="email" type="email" />
 *   <input name="password" type="password" />
 *   <button type="submit">Sign Up</button>
 * </form>
 *
 * // Controlled with useHoneypot:
 * const { honeypotProps, honeypotPayload } = useHoneypot()
 * ...
 * await register({ email, password, ...honeypotPayload })
 * ```
 */
export function RegisterHoneypot({
  name = 'website',
  value,
  onChange,
  id,
  className,
  label = 'Leave this field empty',
}: RegisterHoneypotProps) {
  const inputId = id || `sm_hp_${name}`

  return (
    <div
      aria-hidden="true"
      style={OFFSCREEN_STYLE}
      tabIndex={-1}
      data-testid="sm-register-honeypot"
    >
      <label htmlFor={inputId}>{label}</label>
      <input
        type="text"
        id={inputId}
        name={name}
        value={value}
        onChange={onChange}
        tabIndex={-1}
        autoComplete="off"
        className={className}
      />
    </div>
  )
}

export interface UseHoneypotReturn {
  value: string
  setValue: React.Dispatch<React.SetStateAction<string>>
  honeypotProps: {
    name: HoneypotFieldName | string
    value: string
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  }
  /** Object with { [name]: value } ready to spread into register() */
  honeypotPayload: Record<string, string>
  reset: () => void
}

/**
 * Hook to manage controlled honeypot state for React registration forms.
 *
 * @param defaultField The honeypot field name (defaults to 'website')
 */
export function useHoneypot(
  defaultField: HoneypotFieldName | string = 'website'
): UseHoneypotReturn {
  const [value, setValue] = useState('')

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)
  }, [])

  const reset = useCallback(() => {
    setValue('')
  }, [])

  return {
    value,
    setValue,
    honeypotProps: {
      name: defaultField,
      value,
      onChange,
    },
    honeypotPayload: value ? { [defaultField]: value } : {},
    reset,
  }
}
