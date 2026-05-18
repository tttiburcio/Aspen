export default function Skeleton({ className = "", rounded = "rounded-lg" }) {
  return (
    <div className={`animate-pulse bg-g-800/50 ${rounded} ${className}`} />
  )
}
