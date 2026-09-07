
interface CheckboxProps {
  id?: string
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export function Checkbox({
  id,
  checked = false,
  onCheckedChange,
  disabled = false,
  className = ''
}: CheckboxProps): JSX.Element {
  return (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      disabled={disabled}
      className={`w-4 h-4 cursor-pointer disabled:cursor-not-allowed ${className}`}
    />
  )
}
