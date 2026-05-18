const SIZES = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
};

export function Dot({ color, size = 'sm', className = '' }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${SIZES[size]} ${className}`}
      style={{ backgroundColor: color }}
    />
  );
}
