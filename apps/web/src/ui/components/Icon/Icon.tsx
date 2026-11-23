import { ICONS, type IconName, type IconShape } from './icons.ts'

export interface IconProps {
  name: IconName
  size?: number
  strokeWidth?: number
  /** Sans libellé, l'icône est décorative (aria-hidden). Avec, elle est annoncée (role="img"). */
  label?: string
  className?: string | undefined
}

function renderShape(shape: IconShape, index: number) {
  switch (shape.tag) {
    case 'path':
      return <path key={index} d={shape.d} />
    case 'circle':
      return <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} />
    case 'rect':
      return (
        <rect
          key={index}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rx={shape.rx}
        />
      )
  }
}

export function Icon({ name, size = 16, strokeWidth = 2, label, className }: IconProps) {
  const a11y = label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...a11y}
    >
      {ICONS[name].map(renderShape)}
    </svg>
  )
}
