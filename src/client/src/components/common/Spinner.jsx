const SIZES = {
  xs: 'h-3 w-3 border',
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-2',
};

export function Spinner({ size = 'sm', className = '' }) {
  return (
    <span
      className={`${SIZES[size]} animate-spin rounded-full border-current border-t-transparent ${className}`}
    />
  );
}
