import { RotateCcw } from "lucide-react"
import type { ParameterDefinition } from "../lib/catalog-types"

const display = (
  value: unknown,
  kind?: ParameterDefinition["kind"],
  key?: string,
): string => {
  if (value === undefined) return ""
  if (kind === "text" && typeof value === "object" && value !== null) {
    if (Array.isArray(value))
      return value
        .map((item) => String(item))
        .join(key === "aspectRatio" || key === "ratio" ? ":" : ",")
    if ("x" in value && "y" in value) return `${value.x}x${value.y}`
  }
  return typeof value === "object"
    ? JSON.stringify(value, null, 2)
    : String(value)
}

export function ParameterField({
  parameter,
  value,
  resolved,
  resolvedAvailable,
  onChange,
  onReset,
}: {
  parameter: ParameterDefinition
  value: unknown
  resolved: unknown
  resolvedAvailable: boolean
  onChange: (value: unknown) => void
  onReset: () => void
}) {
  const { key, label, kind } = parameter
  const id = `parameter-${key}`
  const defaultValue = resolvedAvailable ? resolved : parameter.default
  const hasOverride = value !== undefined
  const reset = hasOverride && (
    <button
      className="field-reset icon-button"
      type="button"
      title={`Reset ${label}`}
      aria-label={`Reset ${label}`}
      onClick={onReset}
    >
      <RotateCcw size={12} />
    </button>
  )

  if (kind === "boolean")
    return (
      <div className="parameter-field boolean-field">
        <label htmlFor={id}>
          <span>{label}</span>
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value ?? defaultValue)}
            onChange={(event) => onChange(event.target.checked)}
          />
        </label>
        {reset}
        {parameter.description && (
          <p className="field-description">{parameter.description}</p>
        )}
      </div>
    )

  const numericValue =
    typeof (value ?? defaultValue) === "number"
      ? Number(value ?? defaultValue)
      : Number.parseFloat(display(value ?? defaultValue))
  const meaningfulRange =
    (kind === "number" || kind === "length") &&
    Number.isFinite(parameter.min) &&
    Number.isFinite(parameter.max) &&
    parameter.max! - parameter.min! <= 1024 &&
    parameter.max! > parameter.min!
  return (
    <div className="parameter-field">
      <div className="field-heading">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {reset}
        {parameter.optional && <span className="optional-label">optional</span>}
      </div>
      {kind === "enum" ? (
        <div className="field-input">
          <select
            id={id}
            value={display(value ?? defaultValue)}
            onChange={(event) => {
              const option = parameter.options?.find(
                (item) => String(item.value) === event.target.value,
              )
              onChange(option?.value ?? event.target.value)
            }}
          >
            {parameter.optional && <option value="">Default</option>}
            {parameter.options?.map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : kind === "json" ? (
        <textarea
          id={id}
          className="parameter-json"
          rows={3}
          value={display(value)}
          placeholder={display(defaultValue) || "JSON value"}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div className="field-input">
          <input
            id={id}
            type={kind === "number" ? "number" : "text"}
            inputMode={
              kind === "number" || kind === "length" ? "decimal" : undefined
            }
            value={display(value, kind, key)}
            placeholder={display(defaultValue, kind, key)}
            min={parameter.min}
            max={parameter.max}
            step={parameter.step ?? "any"}
            autoComplete="off"
            onChange={(event) => {
              const text = event.target.value
              onChange(kind === "number" && text !== "" ? Number(text) : text)
            }}
          />
          {kind === "length" && <span className="field-unit">mm</span>}
        </div>
      )}
      {meaningfulRange && (
        <input
          className="field-slider"
          type="range"
          aria-label={`${label} slider`}
          min={parameter.min}
          max={parameter.max}
          step={parameter.step ?? (kind === "number" ? 1 : 0.1)}
          value={Number.isFinite(numericValue) ? numericValue : parameter.min}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      )}
      {parameter.description && (
        <p className="field-description">{parameter.description}</p>
      )}
      {kind === "length" && !parameter.description && (
        <p className="field-description">
          Millimeters, or enter a unit such as 0.2in.
        </p>
      )}
    </div>
  )
}
