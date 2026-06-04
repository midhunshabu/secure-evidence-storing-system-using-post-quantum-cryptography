export default function LoadingScreen({
  title = 'Synchronizing secure modules',
  subtitle = 'Our tiny quantum hamsters are hauling encrypted bits...',
  fullPage = true,
}) {
  return (
    <div className={`vault-loader ${fullPage ? 'vault-loader-full' : 'vault-loader-inline'}`} role="status" aria-live="polite">
      <div className="vault-loader-stage" aria-hidden="true">
        <span className="vault-loader-orbit orbit-a" />
        <span className="vault-loader-orbit orbit-b" />
        <span className="vault-loader-core">◆</span>
        <span className="vault-loader-node node-a" />
        <span className="vault-loader-node node-b" />
        <span className="vault-loader-node node-c" />
      </div>
      <p className="vault-loader-title">{title}</p>
      <p className="vault-loader-subtitle">{subtitle}</p>
      <div className="vault-loader-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
