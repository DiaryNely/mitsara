<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCustomerAuth } from '../../composables/auth/useCustomerAuth'
import { useCart } from '../../composables/front/useCart'
import { createAddress, getCustomerAddresses } from '../../services/frontoffice/addressService'
import { placeOrder } from '../../services/frontoffice/orderService'
import { useFrontCartStore } from '../../stores/front/cart'

const router = useRouter()
const { customerId, customerName, customerSecureKey } = useCustomerAuth()
const { items, subtotal, cartId, hydrate, syncCart, setAddressId } = useCart()

const addresses = ref([])
const selectedAddressId = ref('')
const loading = ref(false)
const addressError = ref('')
const orderError = ref('')

// Modal de confirmation
const showConfirm = ref(false)

const addressForm = ref({
  alias: 'Adresse principale',
  firstname: '',
  lastname: '',
  address1: '',
  postcode: '',
  city: '',
  phone: '',
})
const formErrors = ref({})

const total = computed(() => subtotal.value)

const formatPrice = (price) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(price || 0))

// ── Adresses ──────────────────────────────────────────────────────────────
const loadAddresses = async () => {
  addressError.value = ''
  loading.value = true
  try {
    const list = await getCustomerAddresses(customerId.value)
    addresses.value = list
    if (!selectedAddressId.value && list.length) {
      selectedAddressId.value = list[0].id
      setAddressId(list[0].id)
    }
  } catch (error) {
    addressError.value = error?.message || 'Impossible de charger les adresses.'
  } finally {
    loading.value = false
  }
}

const validateAddressForm = () => {
  const errors = {}
  if (!addressForm.value.lastname?.trim()) errors.lastname = 'Nom requis'
  if (!addressForm.value.firstname?.trim()) errors.firstname = 'Prénom requis'
  if (!addressForm.value.address1?.trim()) errors.address1 = 'Adresse requise'
  if (!addressForm.value.postcode?.trim()) errors.postcode = 'Code postal requis'
  if (!addressForm.value.city?.trim()) errors.city = 'Ville requise'
  formErrors.value = errors
  return Object.keys(errors).length === 0
}

const handleCreateAddress = async () => {
  if (!validateAddressForm()) return
  addressError.value = ''
  loading.value = true
  try {
    const created = await createAddress({
      customerId: customerId.value,
      ...addressForm.value,
    })
    if (created) {
      addresses.value = [created, ...addresses.value]
      selectedAddressId.value = created.id
      setAddressId(created.id)
      // Réinitialiser le formulaire
      addressForm.value = { alias: 'Adresse principale', firstname: '', lastname: '', address1: '', postcode: '', city: '', phone: '' }
      formErrors.value = {}
    }
  } catch (error) {
    addressError.value = error?.message || 'Création adresse impossible.'
  } finally {
    loading.value = false
  }
}

// ── Commande ──────────────────────────────────────────────────────────────

// Ouvre la modal de confirmation — protège le double-clic
const requestConfirm = () => {
  if (loading.value) return
  orderError.value = ''
  if (!items.value.length) { orderError.value = 'Panier vide.'; return }
  if (!selectedAddressId.value) { orderError.value = 'Sélectionnez une adresse.'; return }
  showConfirm.value = true
}

const cancelConfirm = () => { showConfirm.value = false }

const handlePlaceOrder = async () => {
  showConfirm.value = false
  // Anti double-clic : le flag loading bloque tout nouvel appel
  if (loading.value) return
  loading.value = true
  orderError.value = ''

  try {
    const cartResponse = await syncCart({
      customer: { id: customerId.value },
      addressId: selectedAddressId.value,
    })

    const orderId = await placeOrder({
      cartId: cartResponse?.id || cartId.value,
      customer: { id: customerId.value, secureKey: customerSecureKey.value },
      addressId: selectedAddressId.value,
      items: items.value,
    })

    const cartStore = useFrontCartStore()
    cartStore.onOrderPlaced()
    router.push(`/front/orders/${orderId}`)
  } catch (error) {
    orderError.value = error?.message || 'Validation commande impossible.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  hydrate()
  loadAddresses()
})
</script>

<template>
  <div class="checkout-page">
    <div class="checkout-inner">

      <!-- En-tête -->
      <div class="checkout-header">
        <div>
          <h1>Validation de commande</h1>
          <p>Bonjour <strong>{{ customerName || 'client' }}</strong>, vérifiez votre commande avant de confirmer.</p>
        </div>
        <button class="btn-back" type="button" @click="router.push('/front/cart')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Retour au panier
        </button>
      </div>

      <!-- Stepper visuel -->
      <div class="checkout-steps">
        <div class="cstep cstep--done">
          <div class="cstep-bullet">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6l3 3 4-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </div>
          <span>Panier</span>
        </div>
        <div class="cstep-line cstep-line--done"></div>
        <div class="cstep cstep--active">
          <div class="cstep-bullet">2</div>
          <span>Livraison</span>
        </div>
        <div class="cstep-line"></div>
        <div class="cstep">
          <div class="cstep-bullet">3</div>
          <span>Confirmation</span>
        </div>
      </div>

      <div class="checkout-grid">

        <!-- ── Colonne gauche : adresse ── -->
        <div class="checkout-col">

          <!-- Adresses existantes -->
          <section class="checkout-card">
            <div class="card-heading">
              <div class="card-heading-icon">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 17s-6-4.35-6-8a6 6 0 1112 0c0 3.65-6 8-6 8z" stroke="currentColor" stroke-width="1.5"/>
                  <circle cx="9" cy="9" r="2" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </div>
              <div>
                <h3>Adresse de livraison</h3>
                <p>Sélectionnez une adresse ou ajoutez-en une nouvelle.</p>
              </div>
            </div>

            <div v-if="addressError" class="error-banner">{{ addressError }}</div>

            <div v-if="addresses.length" class="address-list">
              <label
                v-for="addr in addresses"
                :key="addr.id"
                class="address-item"
                :class="{ 'address-item--selected': selectedAddressId === addr.id }"
              >
                <input
                  type="radio"
                  name="address"
                  :value="addr.id"
                  v-model="selectedAddressId"
                  @change="setAddressId(addr.id)"
                />
                <div class="address-check">
                  <svg v-if="selectedAddressId === addr.id" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </div>
                <div class="address-details">
                  <strong>{{ addr.alias || 'Adresse' }}</strong>
                  <p>{{ addr.firstname }} {{ addr.lastname }}</p>
                  <p>{{ addr.address1 }}, {{ addr.postcode }} {{ addr.city }}</p>
                </div>
              </label>
            </div>

            <div v-else-if="!loading" class="no-address">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" opacity="0.4">
                <path d="M10 18s-7-5.07-7-9a7 7 0 1114 0c0 3.93-7 9-7 9z" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              <p>Aucune adresse enregistrée.</p>
            </div>

            <!-- Formulaire nouvelle adresse -->
            <details class="address-new">
              <summary>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 3v8M3 7h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                Ajouter une nouvelle adresse
              </summary>
              <div class="address-form">
                <div class="form-grid">
                  <div class="field">
                    <label>Alias</label>
                    <input v-model="addressForm.alias" type="text" placeholder="Ex: Domicile" />
                  </div>
                  <div class="field" :class="{ 'field--error': formErrors.firstname }">
                    <label>Prénom <span class="req">*</span></label>
                    <input v-model="addressForm.firstname" type="text" placeholder="Prénom" />
                    <span v-if="formErrors.firstname" class="field-error">{{ formErrors.firstname }}</span>
                  </div>
                  <div class="field" :class="{ 'field--error': formErrors.lastname }">
                    <label>Nom <span class="req">*</span></label>
                    <input v-model="addressForm.lastname" type="text" placeholder="Nom" />
                    <span v-if="formErrors.lastname" class="field-error">{{ formErrors.lastname }}</span>
                  </div>
                  <div class="field field--full" :class="{ 'field--error': formErrors.address1 }">
                    <label>Adresse <span class="req">*</span></label>
                    <input v-model="addressForm.address1" type="text" placeholder="Numéro et rue" />
                    <span v-if="formErrors.address1" class="field-error">{{ formErrors.address1 }}</span>
                  </div>
                  <div class="field" :class="{ 'field--error': formErrors.postcode }">
                    <label>Code postal <span class="req">*</span></label>
                    <input v-model="addressForm.postcode" type="text" placeholder="Code postal" />
                    <span v-if="formErrors.postcode" class="field-error">{{ formErrors.postcode }}</span>
                  </div>
                  <div class="field" :class="{ 'field--error': formErrors.city }">
                    <label>Ville <span class="req">*</span></label>
                    <input v-model="addressForm.city" type="text" placeholder="Ville" />
                    <span v-if="formErrors.city" class="field-error">{{ formErrors.city }}</span>
                  </div>
                  <div class="field">
                    <label>Téléphone</label>
                    <input v-model="addressForm.phone" type="tel" placeholder="Téléphone" />
                  </div>
                </div>
                <button class="btn-save-addr" type="button" @click="handleCreateAddress" :disabled="loading">
                  Enregistrer l'adresse
                </button>
              </div>
            </details>
          </section>

          <!-- Mode de paiement -->
          <section class="checkout-card">
            <div class="card-heading">
              <div class="card-heading-icon">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M2 8h14" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </div>
              <div>
                <h3>Mode de paiement</h3>
                <p>Un seul mode disponible.</p>
              </div>
            </div>
            <div class="payment-option">
              <div class="payment-icon">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2l2.5 5 5.5.8-4 3.9.95 5.5L10 14.7l-4.95 2.5.95-5.5L2 7.8l5.5-.8L10 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                </svg>
              </div>
              <div>
                <strong>Paiement à la livraison</strong>
                <p>Vous réglez le livreur à la réception.</p>
              </div>
              <span class="selected-badge">Sélectionné</span>
            </div>
          </section>
        </div>

        <!-- ── Colonne droite : récapitulatif ── -->
        <div class="checkout-col">
          <section class="checkout-card summary-card">
            <h3>Récapitulatif</h3>

            <div class="order-lines">
              <div v-for="item in items" :key="item.key" class="order-line">
                <div class="ol-left">
                  <span class="ol-qty">× {{ item.quantity }}</span>
                  <span class="ol-name">{{ item.name }}<em v-if="item.variantLabel"> — {{ item.variantLabel }}</em></span>
                </div>
                <span class="ol-price">{{ formatPrice(Number(item.price) * item.quantity) }}</span>
              </div>
            </div>

            <div class="summary-rows">
              <div class="summary-row">
                <span>Sous-total</span>
                <span>{{ formatPrice(subtotal) }}</span>
              </div>
              <div class="summary-row">
                <span>Livraison</span>
                <span class="free-tag">Gratuit</span>
              </div>
            </div>

            <div class="summary-total">
              <span>Total TTC</span>
              <span>{{ formatPrice(total) }}</span>
            </div>

            <div v-if="orderError" class="error-banner">{{ orderError }}</div>

            <button
              class="place-order-btn"
              type="button"
              :disabled="loading || !items.length || !selectedAddressId"
              @click="requestConfirm"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" v-if="!loading">
                <path d="M2 8l4 4 8-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              {{ loading ? 'Traitement en cours…' : 'Confirmer la commande' }}
            </button>

            <p class="secure-note">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L2 3v4c0 2.5 1.8 4.3 4 5 2.2-.7 4-2.5 4-5V3L6 1z" stroke="currentColor" stroke-width="1.2"/>
                <path d="M4 6l1.5 1.5L8 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
              Commande sécurisée — paiement à la livraison
            </p>
          </section>
        </div>

      </div>
    </div>

    <!-- Modal de confirmation -->
    <Teleport to="body">
      <div v-if="showConfirm" class="modal-overlay" @click.self="cancelConfirm">
        <div class="modal">
          <div class="modal-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="12" stroke="currentColor" stroke-width="2"/>
              <path d="M9 14l4 4 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <h3>Confirmer la commande</h3>
          <p>Vous êtes sur le point de passer une commande de <strong>{{ formatPrice(total) }}</strong>.</p>
          <p class="modal-note">Paiement à la livraison — cette action est définitive.</p>
          <div class="modal-actions">
            <button class="modal-cancel" type="button" @click="cancelConfirm">Annuler</button>
            <button class="modal-confirm" type="button" @click="handlePlaceOrder">
              Confirmer
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ── Page ─────────────────────────────────────────── */
.checkout-page {
  background: var(--front-bg);
  min-height: calc(100vh - 68px);
}

.checkout-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 36px clamp(16px, 4vw, 48px) 80px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* ── En-tête ──────────────────────────────────────── */
.checkout-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.checkout-header h1 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0 0 5px;
}

.checkout-header p {
  font-size: 14px;
  color: var(--front-muted);
  margin: 0;
}

.btn-back {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  border-radius: 999px;
  border: 1px solid var(--front-border);
  background: var(--front-surface);
  font-size: 13px;
  font-weight: 600;
  color: var(--front-muted);
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
}

.btn-back:hover {
  border-color: var(--front-accent);
  color: var(--front-accent);
}

/* ── Stepper ──────────────────────────────────────── */
.checkout-steps {
  display: flex;
  align-items: center;
  gap: 0;
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  padding: 16px 24px;
  box-shadow: var(--shadow-sm);
}

.cstep {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--front-muted);
}

.cstep-bullet {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--front-surface-muted);
  border: 1.5px solid var(--front-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.cstep--done .cstep-bullet {
  background: var(--success);
  border-color: var(--success);
  color: white;
}

.cstep--active {
  color: var(--front-accent);
}

.cstep--active .cstep-bullet {
  background: var(--front-accent);
  border-color: var(--front-accent);
  color: white;
}

.cstep-line {
  flex: 1;
  height: 2px;
  background: var(--front-border);
  margin: 0 12px;
}

.cstep-line--done {
  background: var(--success);
}

/* ── Grid ─────────────────────────────────────────── */
.checkout-grid {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 20px;
  align-items: start;
}

.checkout-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Cards ────────────────────────────────────────── */
.checkout-card {
  background: var(--front-surface);
  border: 1px solid var(--front-border);
  border-radius: var(--front-radius);
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-shadow: var(--shadow-sm);
}

.card-heading {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.card-heading-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--front-accent-light);
  color: var(--front-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-heading h3 {
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 3px;
}

.card-heading p {
  font-size: 12.5px;
  color: var(--front-muted);
  margin: 0;
}

/* ── Adresses ─────────────────────────────────────── */
.address-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.address-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--front-border);
  cursor: pointer;
  transition: all 150ms ease;
}

.address-item input[type="radio"] {
  display: none;
}

.address-item--selected {
  border-color: var(--front-accent);
  background: var(--front-accent-light);
}

.address-check {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--front-border);
  background: var(--front-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
  transition: all 150ms ease;
}

.address-item--selected .address-check {
  background: var(--front-accent);
  border-color: var(--front-accent);
  color: white;
}

.address-details strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--front-text);
}

.address-details p {
  font-size: 12.5px;
  color: var(--front-muted);
  margin: 2px 0 0;
}

.no-address {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px;
  border: 1px dashed var(--front-border);
  border-radius: var(--radius-md);
  text-align: center;
}

.no-address p {
  font-size: 13px;
  color: var(--front-muted);
  margin: 0;
}

/* ── Formulaire adresse ───────────────────────────── */
.address-new summary {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--front-accent);
  cursor: pointer;
  list-style: none;
  user-select: none;
  padding: 4px 0;
}

.address-new summary::-webkit-details-marker {
  display: none;
}

.address-form {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field--full {
  grid-column: 1 / -1;
}

.field label {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--front-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.field input {
  padding: 9px 12px;
  border: 1.5px solid var(--front-border);
  border-radius: var(--radius-md);
  background: var(--front-surface-muted);
  font-size: 13.5px;
  color: var(--front-text);
  transition: border-color 150ms ease;
}

.field input:focus {
  outline: none;
  border-color: var(--front-accent);
  background: var(--front-surface);
}

.field--error input {
  border-color: var(--danger);
}

.field-error {
  font-size: 11.5px;
  color: var(--danger);
}

.req {
  color: var(--danger);
}

.btn-save-addr {
  padding: 10px 20px;
  border-radius: 999px;
  border: 1.5px solid var(--front-border);
  background: var(--front-surface-muted);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--front-text);
  cursor: pointer;
  width: fit-content;
  transition: all 150ms ease;
}

.btn-save-addr:hover:not(:disabled) {
  border-color: var(--front-accent);
  color: var(--front-accent);
}

.btn-save-addr:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Paiement ─────────────────────────────────────── */
.payment-option {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1.5px solid rgba(99,102,241,.2);
  background: var(--front-accent-light);
}

.payment-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--front-accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.payment-option strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--front-text);
  display: block;
  margin-bottom: 3px;
}

.payment-option p {
  font-size: 12.5px;
  color: var(--front-muted);
  margin: 0;
}

.selected-badge {
  margin-left: auto;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

/* ── Récapitulatif ────────────────────────────────── */
.summary-card {
  position: sticky;
  top: 88px;
}

.summary-card h3 {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.order-lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--front-border);
}

.order-line {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
}

.ol-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.ol-qty {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--front-accent);
  white-space: nowrap;
}

.ol-name {
  color: var(--front-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ol-name em {
  font-style: normal;
  opacity: 0.7;
}

.ol-price {
  font-weight: 700;
  color: var(--front-text);
  white-space: nowrap;
}

.summary-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 13.5px;
  color: var(--front-muted);
}

.free-tag {
  font-size: 12px;
  font-weight: 700;
  color: var(--success);
  background: rgba(16,185,129,.1);
  padding: 2px 8px;
  border-radius: 999px;
}

.summary-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 14px;
  border-top: 1.5px solid var(--front-border);
  font-size: 18px;
  font-weight: 800;
  color: var(--front-text);
  letter-spacing: -0.01em;
}

.error-banner {
  padding: 10px 14px;
  background: var(--danger-light);
  color: var(--danger);
  border-radius: var(--radius-md);
  font-size: 13px;
  border-left: 3px solid var(--danger);
}

.place-order-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 52px;
  border-radius: 999px;
  background: linear-gradient(135deg, #6366f1 0%, #5046e4 100%);
  color: white;
  font-size: 15px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  box-shadow: 0 4px 16px rgba(99,102,241,.35);
}

.place-order-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 22px rgba(99,102,241,.45);
}

.place-order-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.secure-note {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--front-muted);
  justify-content: center;
  margin: 0;
}

/* ── Modal ────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}

.modal {
  background: var(--front-surface);
  border-radius: 20px;
  border: 1px solid var(--front-border);
  padding: 32px;
  max-width: 420px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
  text-align: center;
  align-items: center;
}

.modal-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--front-accent-light);
  color: var(--front-accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal h3 {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.01em;
  margin: 0;
}

.modal p {
  font-size: 14px;
  color: var(--front-text);
  margin: 0;
}

.modal-note {
  font-size: 13px;
  color: var(--front-muted) !important;
}

.modal-actions {
  display: flex;
  gap: 10px;
  width: 100%;
  justify-content: center;
  margin-top: 4px;
}

.modal-cancel {
  flex: 1;
  height: 42px;
  border-radius: 999px;
  border: 1.5px solid var(--front-border);
  background: transparent;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--front-muted);
  cursor: pointer;
  transition: all 150ms ease;
}

.modal-cancel:hover {
  border-color: var(--front-accent);
  color: var(--front-accent);
}

.modal-confirm {
  flex: 1;
  height: 42px;
  border-radius: 999px;
  background: var(--front-accent);
  color: white;
  font-size: 13.5px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  box-shadow: 0 3px 12px rgba(99,102,241,.3);
}

.modal-confirm:hover {
  filter: brightness(1.1);
}

@media (max-width: 960px) {
  .checkout-grid {
    grid-template-columns: 1fr;
  }

  .summary-card {
    position: static;
  }
}

@media (max-width: 640px) {
  .cstep span {
    display: none;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
