import React, { cloneElement, type ReactElement } from "react"

export interface FormFieldProps {
  id: string
  label: string
  required?: boolean
  help?: string
  error?: string
  children: ReactElement<Record<string, unknown>>
  className?: string
}

export function FormField({
  id,
  label,
  required = false,
  help,
  error,
  children,
  className = "",
}: FormFieldProps) {
  if (!id.trim() || !label.trim()) throw new Error("FormField id and label are required")
  const descriptionId = error ? `${id}-error` : help ? `${id}-help` : undefined
  const control = cloneElement(children, {
    id,
    required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": descriptionId,
  })
  return (
    <div className={`grid gap-1.5 ${className}`.trim()}>
      <label htmlFor={id} className="text-sm font-semibold text-stone-800">
        {label}{required ? <span aria-hidden="true" className="ml-1 text-red-700">*</span> : null}
      </label>
      {control}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm leading-5 text-red-700">{error}</p>
      ) : help ? (
        <p id={`${id}-help`} className="text-sm leading-5 text-stone-600">{help}</p>
      ) : null}
    </div>
  )
}
