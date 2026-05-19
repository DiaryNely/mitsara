<template>
  <footer class="front-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <div class="footer-logo">
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
            <path d="M5 8h12M5 11h8M5 14h10" stroke="white" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <div>
          <div class="footer-brand-name">PrestaShop Atelier</div>
          <p class="footer-brand-desc">Boutique premium pour des collections essentielles.</p>
        </div>
      </div>

      <div class="footer-col">
        <h4>Services</h4>
        <ul>
          <li>Guide des tailles</li>
          <li>Retours simples</li>
          <li>Suivi commandes</li>
          <li>Livraison 48h</li>
        </ul>
      </div>

      <div class="footer-col">
        <h4>Contact</h4>
        <ul>
          <li>support@prestashop.local</li>
          <li>+33 1 84 00 00 00</li>
          <li>Paris, France</li>
        </ul>
      </div>
    </div>

    <div class="footer-bottom">
      <span>&copy; {{ new Date().getFullYear() }} PrestaShop Atelier — Tous droits réservés</span>
      <span class="footer-status">
        <span class="status-dot"></span>
        WebService connecté
      </span>
    </div>
  </footer>
</template>

<style scoped>
.front-footer {
  background: var(--front-text);
  color: rgba(255,255,255,0.65);
  padding: 48px clamp(16px, 4vw, 48px) 24px;
}

.footer-inner {
  max-width: 1280px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 48px;
  margin-bottom: 40px;
}

.footer-brand {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.footer-logo {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(99,102,241,0.4);
}

.footer-brand-name {
  font-size: 15px;
  font-weight: 700;
  color: white;
  margin-bottom: 6px;
}

.footer-brand-desc {
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
  max-width: 240px;
}

.footer-col h4 {
  font-size: 13px;
  font-weight: 700;
  color: white;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 16px;
}

.footer-col ul {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.footer-col li {
  font-size: 13px;
  line-height: 1.5;
}

.footer-bottom {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid rgba(255,255,255,0.08);
  font-size: 12px;
  flex-wrap: wrap;
}

.footer-status {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255,255,255,0.5);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px rgba(16,185,129,0.5);
  animation: pulse 2s ease-in-out infinite;
}

@media (max-width: 768px) {
  .footer-inner {
    grid-template-columns: 1fr;
    gap: 28px;
  }
}
</style>
