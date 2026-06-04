import { useEffect, useMemo, useRef, useState } from 'react'

const joinClasses = (...values) => values.filter(Boolean).join(' ')

export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select',
  disabled = false,
  className,
  triggerClassName,
  menuClassName,
  optionClassName,
  emptyLabel = 'No options available.',
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const normalizedValue = value == null ? '' : String(value)
  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === normalizedValue),
    [options, normalizedValue]
  )
  const label = selectedOption ? selectedOption.label : placeholder

  useEffect(() => {
    if (!open || disabled) return
    const container = containerRef.current
    const handlePointerDown = (event) => {
      if (!container || !container.contains(event.target)) {
        setOpen(false)
      }
    }
    const handleKey = (event) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        setOpen(false)
      }
    }
    const focusTimer = window.setTimeout(() => {
      const selected = container?.querySelector('[data-selected="true"]')
      const first = container?.querySelector('.custom-select-option')
      const target = selected || first
      if (target && typeof target.focus === 'function') {
        target.focus()
      }
    }, 0)
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open, disabled])

  useEffect(() => {
    if (disabled && open) {
      setOpen(false)
    }
  }, [disabled, open])

  const handleTriggerKeyDown = (event) => {
    if (disabled) return
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault()
      setOpen(true)
    }
    if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false)
    }
  }

  const handleSelect = (nextValue) => {
    if (onChange) onChange(nextValue)
    setOpen(false)
  }

  return (
    <div className={joinClasses('custom-select', className)} ref={containerRef}>
      <button
        type="button"
        className={joinClasses('input-field custom-select-trigger', open && 'open', triggerClassName)}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={joinClasses('custom-select-value', selectedOption ? 'is-selected' : 'is-placeholder')}>
          {label}
        </span>
        <span className="custom-select-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className={joinClasses('custom-select-menu', menuClassName)} role="listbox" aria-label={placeholder}>
          {options.length ? (
            options.map((option) => {
              const isSelected = String(option.value) === normalizedValue
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-selected={isSelected ? 'true' : 'false'}
                  className={joinClasses('custom-select-option', isSelected && 'selected', optionClassName)}
                  onClick={() => handleSelect(option.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      event.currentTarget.nextElementSibling?.focus()
                    }
                    if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      event.currentTarget.previousElementSibling?.focus()
                    }
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleSelect(option.value)
                    }
                    if (event.key === 'Escape' || event.key === 'Tab') {
                      setOpen(false)
                    }
                  }}
                >
                  {option.label}
                </button>
              )
            })
          ) : (
            <div className="custom-select-empty">{emptyLabel}</div>
          )}
        </div>
      )}
    </div>
  )
}
