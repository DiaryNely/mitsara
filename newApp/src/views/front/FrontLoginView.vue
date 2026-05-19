<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCustomerAuth } from '../../composables/auth/useCustomerAuth'
import { useFrontCartStore } from '../../stores/front/cart'

const route = useRoute()
const router = useRouter()
const { loginByEmail } = useCustomerAuth()
const cartStore = useFrontCartStore()

const email = ref('')
const loading = ref(false)
const errorMessage = ref('')

const formatError = (error) => {
  if (error?.code === 'CUSTOMER_NOT_FOUND') {
    return 'Client introuvable.'
  }
  if (error?.code === 'CUSTOMER_INACTIVE') {
    return 'Compte client inactif.'
  }
  if (error?.code === 'GUEST_NOT_ALLOWED') {
    return 'Compte anonyme non autorise pour la validation.'
  }
  if (error?.code === 'MISSING_API_KEY') {
    return 'Cle API manquante dans .env.local.'
  }
  if (error?.code === 'MISSING_ENV') {
    return 'Configuration manquante dans .env.local.'
  }
  if (error?.code === 'NETWORK_ERROR') {
    return 'Connexion impossible a l API.'
  }
  if (error?.code === 'MISSING_FIELDS') {
    return 'Email requis.'
  }
  return error?.message || 'Erreur inconnue.'
}

const handleSubmit = async () => {
  errorMessage.value = ''
  loading.value = true

  try {
    const cleanEmail = email.value.trim()

    const session = await loginByEmail({ email: cleanEmail })
    const customerId = session?.customer?.id

    // initialize() : prend en charge un démarrage à froid (store non initialisé).
    // claimForCustomer() : associe le panier anonyme existant au client connecté,
    // même si initialize() avait déjà été appelée anonymement par le guard.
    await cartStore.initialize({ customerId })
    await cartStore.claimForCustomer(customerId)

    const redirectTarget =
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : '/front/products'

    router.replace(redirectTarget)
  } catch (error) {
    errorMessage.value = formatError(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="front-login">
    <section class="login-card">
      <div class="login-hero">
        <span class="login-pill">Espace client</span>
        <h1>Bienvenue dans votre atelier</h1>
        <p>
          Entrez un email client existant pour finaliser votre commande.
        </p>
      </div>

      <form class="login-form" @submit.prevent="handleSubmit">
        <label>
          <span>Email</span>
          <input v-model="email" type="email" placeholder="client@domaine.tld" />
        </label>

        <p v-if="errorMessage" class="login-error">{{ errorMessage }}</p>

        <button class="login-button" type="submit" :disabled="loading">
          <span v-if="loading">Connexion...</span>
          <span v-else>Se connecter</span>
        </button>
      </form>

      <div class="login-info">
        <span>Besoin d aide ?</span>
        <p>Le login recherche un client actif correspondant a l email fourni.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.front-login {
  min-height: calc(100vh - 68px);
  display: grid;
  place-items: center;
  padding: 40px 20px 60px;
  background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 55%, #ede9fe 100%);
}

.login-card {
  width: min(460px, 100%);
  background: var(--front-surface);
  border-radius: 20px;
  padding: 36px 32px;
  box-shadow: 0 20px 60px rgba(99, 102, 241, 0.12), 0 4px 20px rgba(15,23,42,0.08);
  border: 1px solid rgba(99,102,241,0.1);
  display: grid;
  gap: 24px;
}

.login-hero {
  display: grid;
  gap: 10px;
}

.login-pill {
  width: fit-content;
  padding: 5px 12px;
  background: var(--front-accent-light);
  color: var(--front-accent);
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 700;
  border: 1px solid rgba(99,102,241,.15);
}

h1 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--front-text);
  margin: 0;
}

p {
  color: var(--front-muted);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

.login-form {
  display: grid;
  gap: 16px;
}

label {
  display: grid;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--front-muted);
}

input {
  height: 44px;
  border-radius: 10px;
  border: 1.5px solid var(--front-border);
  padding: 0 14px;
  font-size: 14px;
  background: var(--front-surface-muted);
  color: var(--front-text);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

input:focus {
  outline: none;
  border-color: var(--front-accent);
  box-shadow: 0 0 0 3px var(--front-accent-light);
  background: var(--front-surface);
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
  height: 48px;
  border-radius: 999px;
  border: none;
  background: linear-gradient(135deg, #6366f1 0%, #5046e4 100%);
  color: white;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  transition: all 150ms ease;
  box-shadow: 0 4px 16px rgba(99,102,241,.35);
}

.login-button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.login-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 22px rgba(99,102,241,.45);
}

.login-info {
  background: var(--front-surface-muted);
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 12.5px;
  color: var(--front-muted);
  border: 1px solid var(--front-border);
}

.login-info span {
  font-weight: 700;
  color: var(--front-text);
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
}
</style>
