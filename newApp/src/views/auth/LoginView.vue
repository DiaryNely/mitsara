<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../../composables/auth/useAuth'

const route = useRoute()
const router = useRouter()
const { login } = useAuth()

const email = ref('hasiniaina.nely@gmail.com')
const password = ref('Di@ry3103')
const loading = ref(false)
const errorMessage = ref('')

const formatError = (error) => {
  if (error?.code === 'INVALID_CREDENTIALS') {
    return 'Identifiants invalides.'
  }
  if (error?.code === 'MISSING_API_KEY') {
    return 'Cle API manquante dans .env.local.'
  }
  if (error?.code === 'MISSING_ADMIN_ENV') {
    return 'Configuration admin manquante dans .env.local.'
  }
  if (error?.code === 'MISSING_ENV') {
    return 'Configuration manquante dans .env.local.'
  }
  if (error?.code === 'TOKEN_MISSING') {
    return 'Token admin introuvable dans la reponse.'
  }
  if (error?.code === 'NETWORK_ERROR') {
    return 'Connexion impossible au Back Office.'
  }
  return error?.message || 'Erreur inconnue.'
}

const handleSubmit = async () => {
  errorMessage.value = ''
  loading.value = true

  try {
    const cleanEmail = email.value.trim()
    const cleanPassword = password.value

    if (!cleanEmail || !cleanPassword) {
      throw new Error('Email et mot de passe requis.')
    }

    await login({ email: cleanEmail, password: cleanPassword })

    const redirectTarget =
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : '/dashboard'

    router.replace(redirectTarget)
  } catch (error) {
    errorMessage.value = formatError(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-shell">

    <!-- ── Panneau visuel gauche ── -->
    <div class="login-visual" aria-hidden="true">
      <div class="lv-orb lv-orb--1"></div>
      <div class="lv-orb lv-orb--2"></div>
      <div class="lv-orb lv-orb--3"></div>
      <div class="lv-content">
        <div class="lv-logo">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
            <rect width="56" height="56" rx="18" fill="rgba(255,255,255,0.15)" />
            <path d="M15 20h26M15 28h18M15 36h22" stroke="#fff" stroke-width="2.5" stroke-linecap="round" />
          </svg>
        </div>
        <h2 class="lv-brand">PrestaShop</h2>
        <p class="lv-tagline">Back Office · Administration</p>
        <div class="lv-sep"></div>
        <ul class="lv-list">
          <li class="lv-list-item">
            <span class="lv-check">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l2.5 2.5L10 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span>Import CSV &amp; ZIP automatisé</span>
          </li>
          <li class="lv-list-item">
            <span class="lv-check">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l2.5 2.5L10 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span>Suivi des commandes en temps réel</span>
          </li>
          <li class="lv-list-item">
            <span class="lv-check">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l2.5 2.5L10 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span>Gestion du stock et des bénéfices</span>
          </li>
          <li class="lv-list-item">
            <span class="lv-check">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l2.5 2.5L10 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span>Réinitialisation sécurisée des données</span>
          </li>
        </ul>
        <div class="lv-badge">ETU003123</div>
      </div>
    </div>

    <!-- ── Panneau formulaire droit ── -->
    <div class="login-form-panel">
      <section class="login-card">
        <header class="login-header">
          <p class="login-eyebrow">PrestaShop Back Office</p>
          <h1>Connexion admin</h1>
          <p class="login-subtitle">
            Utilisez l'email et le mot de passe du Back Office.
          </p>
        </header>

        <form class="login-form" @submit.prevent="handleSubmit">
          <label class="login-field">
            <span>Email</span>
            <input
              v-model="email"
              type="email"
              autocomplete="username"
            />
          </label>

          <label class="login-field">
            <span>Mot de passe</span>
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
            />
          </label>

          <p v-if="errorMessage" class="login-error">{{ errorMessage }}</p>

          <button class="login-button" type="submit" :disabled="loading">
            <span v-if="loading">Connexion...</span>
            <span v-else>Se connecter</span>
          </button>
        </form>

        <details class="login-help">
          <summary>Besoin d'aide ?</summary>
          <div class="login-help-body">
            <p>
              L'auth admin passe par <strong>/ps/adminps...</strong> via le proxy Vite.
              En prod, configurez le proxy Nginx pour conserver le cookie BO.
            </p>
            <p>
              La cle WebService (dans .env.local) doit avoir acces a
              <strong>employees</strong> et aux ressources utilisees (ex:
              <strong>products</strong>).
            </p>
            <p>
              Toutes les requetes sont en XML avec Basic Auth
              <strong>base64(&quot;API_KEY:&quot;)</strong>.
            </p>
          </div>
        </details>
      </section>
    </div>

  </div>
</template>

<style scoped>
/* ── Shell ─────────────────────────────────────────────── */
.login-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
}

/* ── Panneau visuel ───────────────────────────────────── */
.login-visual {
  background: linear-gradient(145deg, #3730a3 0%, #4f46e5 45%, #7c3aed 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 40px;
  position: relative;
  overflow: hidden;
}

.lv-orb {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.lv-orb--1 {
  width: 440px;
  height: 440px;
  top: -160px;
  right: -140px;
  background: rgba(255, 255, 255, 0.07);
}

.lv-orb--2 {
  width: 280px;
  height: 280px;
  bottom: -90px;
  left: -80px;
  background: rgba(255, 255, 255, 0.05);
}

.lv-orb--3 {
  width: 160px;
  height: 160px;
  top: 45%;
  left: 12%;
  background: rgba(255, 255, 255, 0.04);
}

.lv-content {
  position: relative;
  z-index: 1;
  color: #fff;
  max-width: 380px;
  width: 100%;
}

.lv-logo {
  margin-bottom: 24px;
  filter: drop-shadow(0 4px 16px rgba(0, 0, 0, 0.2));
}

.lv-brand {
  font-size: 38px;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 0 0 6px;
  line-height: 1;
}

.lv-tagline {
  font-size: 14px;
  opacity: 0.65;
  margin: 0;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 500;
}

.lv-sep {
  width: 40px;
  height: 3px;
  background: rgba(255, 255, 255, 0.35);
  border-radius: 2px;
  margin: 32px 0;
}

.lv-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lv-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  opacity: 0.88;
  line-height: 1.4;
}

.lv-check {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
}

.lv-badge {
  display: inline-block;
  margin-top: 36px;
  padding: 5px 14px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  opacity: 0.7;
  font-family: 'SF Mono', 'Cascadia Code', monospace;
}

/* ── Panneau formulaire ───────────────────────────────── */
.login-form-panel {
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
}

.login-card {
  width: min(420px, 100%);
  background: var(--surface);
  border-radius: 20px;
  padding: 36px 32px;
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border);
}

.login-header {
  margin-bottom: 28px;
}

.login-header h1 {
  margin: 8px 0 8px;
  font-size: 26px;
  color: var(--text);
}

.login-eyebrow {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 700;
  margin: 0;
}

.login-subtitle {
  margin: 0;
  color: var(--text-muted);
  font-size: 13.5px;
}

.login-form {
  display: grid;
  gap: 16px;
}

.login-field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.login-field input {
  height: 44px;
  border-radius: 10px;
  border: 1.5px solid var(--border);
  padding: 0 14px;
  font-size: 14px;
  background: var(--bg);
  color: var(--text);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.login-field input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
  background: var(--surface);
}

.login-error {
  color: var(--danger);
  font-size: 13px;
  margin: 0;
  padding: 10px 14px;
  background: var(--danger-light);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--danger);
}

.login-button {
  height: 46px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #6366f1 0%, #5046e4 100%);
  color: #ffffff;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
  transition: all var(--transition-fast);
  margin-top: 4px;
  letter-spacing: 0.01em;
}

.login-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 7px 22px rgba(99, 102, 241, 0.45);
}

.login-button:active:not(:disabled) {
  transform: translateY(0);
}

.login-button:disabled {
  opacity: 0.65;
  cursor: wait;
  transform: none;
}

.login-help {
  margin-top: 20px;
  font-size: 13px;
  border-top: 1px solid var(--border-light);
  padding-top: 16px;
}

.login-help summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-muted);
  list-style: none;
  user-select: none;
}

.login-help summary::-webkit-details-marker {
  display: none;
}

.login-help-body {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.login-help-body p {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-muted);
  margin: 0;
}

@media (max-width: 800px) {
  .login-shell {
    grid-template-columns: 1fr;
  }

  .login-visual {
    display: none;
  }

  .login-form-panel {
    min-height: 100vh;
  }
}
</style>
