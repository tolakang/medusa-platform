import { MinusMini, PlusMini } from "@medusajs/icons"
import { IconButton, Input } from "@medusajs/ui"
import { useEffect, useState } from "react"

type BulkTableQuantityProps = {
  variantId: string
  label: string
  onChange: (variantId: string, quantity: number) => void
}

const BulkTableQuantity = ({
  variantId,
  label,
  onChange,
}: BulkTableQuantityProps) => {
  const [quantity, setQuantity] = useState("0")
  const [shiftPressed, setShiftPressed] = useState(false)
  const [invalid, setInvalid] = useState(false)

  // Whole numbers of 0 or more only: a typed minus or other character is
  // refused with a message instead of being dropped silently.
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim()
    if (raw !== "" && !/^\d+$/.test(raw)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setQuantity(raw)
    onChange(variantId, Number(raw || 0))
  }

  const handleAdd = () => {
    const q = Math.max(Number(quantity) + (shiftPressed ? 10 : 1), 0)
    setQuantity(q.toString())
    onChange(variantId, q)
  }

  const handleSubtract = () => {
    const q = Math.max(Number(quantity) - (shiftPressed ? 10 : 1), 0)
    setQuantity(q.toString())
    onChange(variantId, q)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault()
      handleAdd()
    }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      handleSubtract()
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setShiftPressed(true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setShiftPressed(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [])

  return (
    <div className="flex flex-col items-center w-full">
    <div className="flex flex-row justify-between gap-2 w-full">
      <IconButton
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        onClick={() => handleSubtract()}
        className="rounded-full hover:bg-neutral-200"
        variant="transparent"
      >
        <MinusMini />
      </IconButton>
      <Input
        name={`quantity[${variantId}]`}
        aria-label={label}
        value={quantity}
        onChange={(e) => handleChange(e)}
        onKeyDown={handleKeyDown}
        type="text"
        inputMode="numeric"
        aria-invalid={invalid}
        className="w-14 min-w-14 text-center items-center justify-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <IconButton
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        onClick={() => handleAdd()}
        className="rounded-full hover:bg-neutral-200"
        variant="transparent"
      >
        <PlusMini />
      </IconButton>
    </div>
      {invalid && (
        <span role="alert" className="text-[0.65rem] text-rose-600">
          Enter 0 or more
        </span>
      )}
    </div>
  )
}

export default BulkTableQuantity
