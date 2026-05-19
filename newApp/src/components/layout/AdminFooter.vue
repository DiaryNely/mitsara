<template>
  <footer class="footer">
    <div class="footer-left">
      <span class="footer-copy">&copy; {{ new Date().getFullYear() }} PrestaShop Admin</span>
      <span class="footer-sep">·</span>
      <span class="footer-version">v1.0.0</span>
    </div>
    <div class="footer-right">
      <span class="api-status">
        <span class="status-dot"></span>
        API Connectée
      </span>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  height: 42px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--text-muted);
}

.footer-sep {
  opacity: 0.35;
}

.footer-version {
  color: var(--text-muted);
  opacity: 0.6;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
}

.footer-right {
  display: flex;
  align-items: center;
}

.api-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--success);
  font-weight: 500;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
  animation: pulse 2s ease-in-out infinite;
}
</style>
