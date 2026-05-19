import { defineStore } from 'pinia'
import {
  upsertCart,
  emptyCart,
  deleteCart,
  verifyCartId,
  getLatestOpenCustomerCart,
  getCart,
  parseCartRows,
} from '../../services/frontoffice/cartService'
import { getCustomerAddresses } from '../../services/frontoffice/addressService'
import { getStockAvailable } from '../../services/frontoffice/stockService'
import { getCombinationById, getFrontProductById, getProductImageUrl } from '../../services/frontoffice/products'
import { computePriceTtc, getTaxRateForGroup } from '../../services/frontoffice/taxService'
import { useCustomerAuthStore } from '../auth/customerAuth'
import { getCustomerById } from '../../services/frontoffice/customerService'
import { GDPR_ANONYMOUS_EMAIL } from '../../config/guestUser'

const STORAGE_PREFIX = 'ps-front-cart'
const getStorageKey = (customerId) => `${STORAGE_PREFIX}:${customerId || 'anonymous'}`

const useFrontCartStore = defineStore('frontCart', {
  state: () => ({
    cartId: '',
    addressId: '',
    items: [],
    syncing: false,
    error: '',
    initialized: false,
    ownerId: '',
  }),

  getters: {
    totalItems: (state) => state.items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: (state) =>
      state.items.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0),
    isEmpty: (state) => state.items.length === 0,
  },

  actions: {
    // ── Persistence localStorage ───────────────────────────────────────────

    _resolveOwnerId(explicitOwnerId) {
      if (explicitOwnerId !== undefined) {
        return String(explicitOwnerId || '').trim()
      }
      if (this.ownerId) {
        return this.ownerId
      }
      const customerStore = useCustomerAuthStore()
      return String(customerStore.customer?.id || '').trim()
    },

    _loadLocal(ownerId) {
      const resolvedOwnerId = this._resolveOwnerId(ownerId)
      this.ownerId = resolvedOwnerId
      const raw = localStorage.getItem(getStorageKey(resolvedOwnerId))
      if (!raw) return
      try {
        const data = JSON.parse(raw)
        this.cartId = data.cartId || ''
        this.addressId = data.addressId || ''
        this.items = Array.isArray(data.items) ? data.items : []
      } catch {
        localStorage.removeItem(getStorageKey(resolvedOwnerId))
      }
    },

    _readPersisted(ownerId) {
      const resolvedOwnerId = this._resolveOwnerId(ownerId)
      const raw = localStorage.getItem(getStorageKey(resolvedOwnerId))
      if (!raw) return null
      try {
        const data = JSON.parse(raw)
        return {
          cartId: data.cartId || '',
          addressId: data.addressId || '',
          items: Array.isArray(data.items) ? data.items : [],
        }
      } catch {
        return null
      }
    },

    _persist(ownerId) {
      const resolvedOwnerId = this._resolveOwnerId(ownerId)
      localStorage.setItem(
        getStorageKey(resolvedOwnerId),
        JSON.stringify({ cartId: this.cartId, addressId: this.addressId, items: this.items })
      )
    },

    _removePersisted(ownerId) {
      const resolvedOwnerId = this._resolveOwnerId(ownerId)
      localStorage.removeItem(getStorageKey(resolvedOwnerId))
    },

    _resetCart() {
      this.cartId = ''
      this.addressId = ''
      this.items = []
      this._persist()
    },

    _mergeItems(sourceItems) {
      if (!Array.isArray(sourceItems) || !sourceItems.length) return
      const merged = new Map(this.items.map((item) => [item.key, { ...item }]))
      for (const item of sourceItems) {
        if (!item?.key) continue
        const existing = merged.get(item.key)
        if (existing) {
          existing.quantity += Number(item.quantity || 0)
        } else {
          merged.set(item.key, { ...item })
        }
      }
      this.items = Array.from(merged.values())
    },

    async _loadItemsFromRemoteCart(cartId) {
      if (!cartId) return []
      try {
        const cart = await getCart(cartId)
        if (!cart?.raw) return []
        const rows = parseCartRows(cart.raw)
        if (!rows.length) return []
        return await this._buildItemsFromRows(rows)
      } catch {
        return []
      }
    },

    async _isGdprAnonymousOwner(ownerId) {
      if (!ownerId) return true
      try {
        const customer = await getCustomerById(ownerId)
        return customer?.email?.toLowerCase() === GDPR_ANONYMOUS_EMAIL.toLowerCase()
      } catch {
        return false
      }
    },

    // ── Initialisation ─────────────────────────────────────────────────────

    // Vérifie la validité du cartId côté PS.
    // Appelée au démarrage (via guard) pour les visiteurs anonymes ET authentifiés.
    // Si customerId est fourni et qu'un panier existe, le réclame immédiatement.
    async initialize({ customerId, skipLoad = false } = {}) {
      if (this.initialized) return

      if (customerId !== undefined) {
        this.ownerId = String(customerId || '').trim()
      }

      if (!skipLoad) {
        this._loadLocal(this.ownerId)
      }

      if (this.cartId) {
        const result = await verifyCartId(this.cartId)
        if (!result.valid) {
          // Un panier commandé (reason='ordered') est toujours référencé par une
          // commande PS : on ne le DELETE pas pour préserver l'intégrité de la commande.
          // Tous les autres cas (404 déjà traité, stale, état inconnu) → on tente
          // une suppression physique pour éviter les zombies qui font crasher AdminCarts.
          if (result.reason !== 'ordered' && result.reason !== 'not-found') {
            await deleteCart(this.cartId).catch(() => {})
          }
          this._resetCart()
        }
      }

      this.initialized = true
      this._persist()

      if (customerId && (!this.cartId || !this.items.length)) {
        await this._hydrateFromRemote(customerId)
      }

      // Si le client est connu dès l'initialisation (restauration de session),
      // associer le panier existant (potentiellement anonyme) à son compte.
      if (customerId && this.cartId) {
        await this._claimAnonymousCart(customerId)
      }
    },

    async switchCustomer(customerId) {
      const nextOwnerId = String(customerId || '').trim()
      if (this.ownerId === nextOwnerId && this.initialized) {
        return
      }

      const previousOwnerId = this.ownerId
      const previousSnapshot = {
        cartId: this.cartId,
        addressId: this.addressId,
        items: Array.isArray(this.items) ? [...this.items] : [],
      }

      if (!previousSnapshot.cartId || !previousSnapshot.items.length) {
        const persisted = this._readPersisted(previousOwnerId)
        if (persisted) {
          if (!previousSnapshot.cartId) previousSnapshot.cartId = persisted.cartId || ''
          if (!previousSnapshot.items.length) previousSnapshot.items = persisted.items || []
        }
      }

      const hasTransferData = Boolean(previousSnapshot.cartId || previousSnapshot.items.length)
      const shouldTransfer =
        Boolean(nextOwnerId) &&
        previousOwnerId !== nextOwnerId &&
        hasTransferData &&
        await this._isGdprAnonymousOwner(previousOwnerId)

      this.cartId = ''
      this.addressId = ''
      this.items = []
      this.error = ''
      this.syncing = false
      this.initialized = false
      this.ownerId = nextOwnerId

      this._loadLocal(nextOwnerId)
      await this.initialize({ customerId: nextOwnerId, skipLoad: true })

      if (shouldTransfer) {
        let sourceItems = previousSnapshot.items
        if (!sourceItems.length && previousSnapshot.cartId) {
          sourceItems = await this._loadItemsFromRemoteCart(previousSnapshot.cartId)
        }

        if (sourceItems.length) {
          if (!this.cartId && previousSnapshot.cartId) {
            this.cartId = previousSnapshot.cartId
          }
          this._mergeItems(sourceItems)
          this._persist()
          const response = await this._syncIfPossible()
          if (response?.id && previousSnapshot.cartId && previousSnapshot.cartId !== this.cartId) {
            await deleteCart(previousSnapshot.cartId).catch(() => {})
          }
          this._removePersisted(previousOwnerId)
        }
      }
    },

    async _hydrateFromRemote(customerId) {
      if (!customerId) return

      const cart = await getLatestOpenCustomerCart(customerId)
      if (!cart?.id || !Array.isArray(cart.rows) || !cart.rows.length) {
        return
      }

      const verification = await verifyCartId(cart.id)
      if (!verification.valid) {
        return
      }

      const items = await this._buildItemsFromRows(cart.rows)
      if (!items.length) {
        return
      }

      this.cartId = cart.id
      this.items = items
      this._persist(customerId)
    },

    async _buildItemsFromRows(rows) {
      const productCache = new Map()
      const comboCache = new Map()
      const taxCache = new Map()

      const getProduct = async (productId) => {
        const key = String(productId || '').trim()
        if (!key) return null
        if (productCache.has(key)) return productCache.get(key)
        const product = await getFrontProductById(key)
        productCache.set(key, product || null)
        return product
      }

      const getCombination = async (comboId) => {
        const key = String(comboId || '').trim()
        if (!key || key === '0') return null
        if (comboCache.has(key)) return comboCache.get(key)
        const combo = await getCombinationById(key)
        comboCache.set(key, combo || null)
        return combo
      }

      const getTaxRate = async (groupId) => {
        const key = String(groupId || '').trim()
        if (!key) return 0
        if (taxCache.has(key)) return taxCache.get(key)
        const rate = await getTaxRateForGroup(key)
        taxCache.set(key, rate)
        return rate
      }

      const items = await Promise.all(
        rows.map(async (row) => {
          if (!row?.productId || !row.quantity) return null
          const product = await getProduct(row.productId)
          if (!product) return null

          const combo = await getCombination(row.combinationId)
          const taxRate = await getTaxRate(product.taxRulesGroupId)
          const basePrice = Number(product.price || 0)
          const impact = Number(combo?.price || 0)
          const priceTtc = computePriceTtc(basePrice + impact, taxRate)

          const comboId = combo?.id || row.combinationId || 0
          const variantLabel = combo?.attributeLabel || (comboId ? `Variante #${comboId}` : '')

          return {
            key: `${product.id}:${comboId || 0}`,
            productId: product.id,
            combinationId: comboId || 0,
            name: product.name,
            reference: product.reference || '',
            price: priceTtc,
            taxRate,
            imageUrl: getProductImageUrl(product.id, product.imageId),
            variantLabel,
            quantity: Number(row.quantity || 0),
          }
        })
      )

      return items.filter(Boolean)
    },

    // ── Association du panier anonyme au client connecté ──────────────────

    // Met à jour id_customer du panier dans PrestaShop via PUT /carts/{id}.
    // PrestaShop conserve toutes les lignes du panier ; seul id_customer change.
    async _claimAnonymousCart(customerId) {
      if (!this.cartId || !customerId) return
      try {
        const response = await upsertCart({
          cartId: this.cartId,
          customerId,
          addressId: this.addressId || '0',
          items: this.items,
        })
        if (response?.id) {
          this.cartId = response.id
          this._persist()
        }
      } catch {
        // Échec silencieux : le panier sera re-créé lors du prochain sync
      }
    },

    // Action publique : appelée explicitement après un login (même si initialize
    // a déjà été exécutée en mode anonyme et que initialized === true).
    async claimForCustomer(customerId) {
      if (!customerId) return
      if (!this.cartId) {
        // Pas encore de panier PS : le premier addItem le créera avec le bon customerId
        return
      }
      await this._claimAnonymousCart(customerId)
    },

    // ── API publique ───────────────────────────────────────────────────────

    async addItem(payload) {
      const key = `${payload.productId}:${payload.combinationId || 0}`
      const qtyToAdd = Number(payload.quantity) || 1

      // Vérification du stock avant ajout
      try {
        const stock = await getStockAvailable({
          productId: payload.productId,
          combinationId: payload.combinationId || 0,
        })
        if (stock) {
          const existing = this.items.find((item) => item.key === key)
          const currentQty = existing ? existing.quantity : 0
          if (stock.quantity < currentQty + qtyToAdd) {
            throw new Error(
              `Stock insuffisant pour "${payload.name}". Disponible : ${stock.quantity}, déjà en panier : ${currentQty}`
            )
          }
        }
      } catch (err) {
        if (err.message && err.message.startsWith('Stock insuffisant')) throw err
      }

      const existing = this.items.find((item) => item.key === key)
      if (existing) {
        existing.quantity += qtyToAdd
      } else {
        this.items.push({
          key,
          productId: payload.productId,
          combinationId: payload.combinationId || 0,
          name: payload.name,
          reference: payload.reference || '',
          price: payload.price,
          taxRate: payload.taxRate || 0,
          imageUrl: payload.imageUrl || '',
          variantLabel: payload.variantLabel || '',
          quantity: qtyToAdd,
        })
      }
      this._persist()
      await this._syncIfPossible()
    },

    async removeItem(key) {
      this.items = this.items.filter((item) => item.key !== key)
      if (!this.items.length) {
        await this.clearCart()
        return
      }
      this._persist()
      await this._syncIfPossible()
    },

    async updateQuantity(key, quantity) {
      const target = this.items.find((item) => item.key === key)
      if (!target) return
      target.quantity = Math.max(1, Number(quantity) || 1)
      this._persist()
      await this._syncIfPossible()
    },

    async setAddressId(addressId) {
      this.addressId = addressId || ''
      this._persist()
      await this._syncIfPossible()
    },

    async clearCart() {
      const existingCartId = this.cartId
      const customerStore = useCustomerAuthStore()
      const customerId = customerStore.customer?.id || '0'
      const addressId = this.addressId

      // Réinitialiser le state local immédiatement : l'UI est cohérente même si
      // la suppression PS est asynchrone ou échoue.
      this._resetCart()

      if (!existingCartId) return

      // Tentative 1 : DELETE physique — supprime la ligne en base PS.
      // C'est la seule façon d'éviter les paniers zombies (id_customer=0,
      // id_address=0, rows=[]) qui font crasher AdminCarts (500).
      const { deleted, unsupported } = await deleteCart(existingCartId)
      if (deleted) return

      // Tentative 2 : si DELETE n'est pas activé sur la clé WS (405) ou
      // si la première tentative a échoué pour une raison réseau,
      // vider les lignes via PUT. Le zombie reste en base mais
      // sera nettoyé par le cron pscleaner de PrestaShop.
      if (unsupported) {
        try {
          await emptyCart({ cartId: existingCartId, customerId, addressId })
        } catch {
          // Panier déjà supprimé / erreur réseau — pas de conséquence locale
        }
      }
    },

    onOrderPlaced() {
      this.cartId = ''
      this.addressId = ''
      this.items = []
      this.error = ''
      this.initialized = true
      this._removePersisted()
    },

    // ── Synchronisation avec PS ────────────────────────────────────────────

    // Sync explicite depuis FrontCheckoutView (adresse choisie par l'utilisateur)
    async syncCart({ customer, addressId }) {
      if (!customer?.id || !addressId) return null

      if (addressId && addressId !== this.addressId) {
        this.addressId = addressId
        this._persist()
      }

      this.syncing = true
      this.error = ''
      try {
        const response = await upsertCart({
          cartId: this.cartId,
          customerId: customer.id,
          addressId: this.addressId,
          items: this.items,
        })
        if (response?.id) {
          this.cartId = response.id
          this._persist()
        }
        return response
      } catch (err) {
        this.error = err?.message || 'Sync panier échoué'
        throw err
      } finally {
        this.syncing = false
      }
    },

    // Sync automatique après chaque mutation locale.
    // Synchronise avec PS en mode anonyme (id_customer=0) ET en mode connecté,
    // conformément au comportement natif de PrestaShop.
    async _syncIfPossible() {
      if (!this.items.length) return null
      if (this.syncing) return null

      const customerStore = useCustomerAuthStore()
      const customerId = customerStore.customer?.id || ''

      // Pas de sync PS en mode anonyme : le front office nécessite toujours
      // un client sélectionné pour finaliser une commande.
      if (!customerId) return null

      let addressId = this.addressId
      if (!addressId) {
        addressId = await this._ensureAddressId(customerId)
      }

      this.syncing = true
      this.error = ''
      try {
        const response = await upsertCart({
          cartId: this.cartId,
          customerId,
          addressId: addressId || '0',
          items: this.items,
        })
        if (response?.id) {
          this.cartId = response.id
          this._persist()
        }
        return response
      } catch (err) {
        // 404 : panier supprimé côté PS (cron pscleaner) → forcer la recréation
        if (err?.response?.status === 404) {
          this.cartId = ''
          this._persist()
        }
        this.error = err?.message || 'Sync panier échoué'
        return null
      } finally {
        this.syncing = false
      }
    },

    async _ensureAddressId(customerId) {
      if (this.addressId) return this.addressId
      if (!customerId) return ''
      try {
        const addresses = await getCustomerAddresses(customerId)
        if (addresses.length) {
          this.addressId = addresses[0].id
          this._persist()
        }
      } catch {
        // Ignore
      }
      return this.addressId
    },

    hydrate() {
      if (!this.initialized) {
        this._loadLocal()
      }
    },
  },
})

export { useFrontCartStore }
