import { storeToRefs } from 'pinia'
import { useFrontCartStore } from '../../stores/front/cart'

const useCart = () => {
  const store = useFrontCartStore()
  const {
    items,
    totalItems,
    subtotal,
    syncing,
    error,
    cartId,
    addressId,
    initialized,
  } = storeToRefs(store)

  return {
    store,
    items,
    totalItems,
    subtotal,
    syncing,
    error,
    cartId,
    addressId,
    initialized,
    // Chargement léger depuis localStorage (pas de vérification PS)
    hydrate: store.hydrate,
    // Initialisation complète avec vérification PS (après login/restore)
    initialize: store.initialize,
    // Mutations panier
    addItem: store.addItem,
    updateQuantity: store.updateQuantity,
    removeItem: store.removeItem,
    clearCart: store.clearCart,
    setAddressId: store.setAddressId,
    // Sync explicite (depuis checkout)
    syncCart: store.syncCart,
    // Nettoyage post-commande
    onOrderPlaced: store.onOrderPlaced,
  }
}

export { useCart }
