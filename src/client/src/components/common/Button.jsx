import { Spinner } from './Spinner.jsx';

const VARIANTS = {
  primary:   'bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700',
  secondary: 'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700',
  ghost:     'text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200 active:bg-white/[0.1]',
  danger:    'bg-red-600 text-white hover:bg-red-500 active:bg-red-700',
};

const SIZES = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

export function Button({
  variant  = 'ghost',
  size     = 'sm',
  loading  = false,
  disabled = false,
  icon,
  onClick,
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? <Spinner size="xs" /> : icon}
      {children}
    </button>
  );
}
