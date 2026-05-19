import {
  listResourceIds,
  requestXml,
  parseResourceIds,
  deleteResourceItem,
  listProductImages,
  deleteProductImage,
  listCategoryIdsForDeletion,
} from './apiClient'
import { clearStockMovements } from '../../api/stockMovements'
import { GDPR_ANONYMOUS_EMAIL } from '../../config/guestUser'

// Ordre de suppression : dépendances d'abord, entités racines en dernier.
const RESET_STEPS = [
  { key: 'order_histories',       label: 'Historiques commandes' },
  { key: 'order_cart_rules',      label: 'Règles panier commandes' },
  { key: 'order_carriers',        label: 'Transporteurs commandes' },
  { key: 'order_invoices',        label: 'Factures commandes' },
  { key: 'order_payments',        label: 'Paiements commandes' },
  { key: 'order_details',         label: 'Détails commandes' },
  { key: 'orders',                label: 'Commandes' },
  { key: 'carts',                 label: 'Paniers' },
  { key: 'addresses',             label: 'Adresses' },
  { key: 'customer_messages',     label: 'Messages clients' },
  { key: 'customer_threads',      label: 'Tickets clients' },
  { key: 'customers',             label: 'Clients' },
  { key: 'images',                label: 'Images produits' },
  { key: 'stock_movements',       label: 'Mouvements de stock' },
  { key: 'stock_availables',      label: 'Stocks disponibles' },
  { key: 'combinations',          label: 'Déclinaisons' },
  { key: 'product_option_values', label: 'Valeurs attributs' },
  { key: 'product_options',       label: 'Groupes attributs' },
  { key: 'specific_prices',       label: 'Prix spécifiques' },
  { key: 'product_suppliers',     label: 'Fournisseurs produits' },
  { key: 'product_feature_values', label: 'Valeurs caractéristiques' },
  { key: 'products',              label: 'Produits' },
  { key: 'categories',            label: 'Catégories' },
  { key: 'suppliers',             label: 'Fournisseurs' },
  { key: 'manufacturers',         label: 'Marques' },
]

// Suppression générique : liste les IDs, filtre les protégés, supprime un par un.
// Gère 404 (déjà supprimé = succès), 405 (DELETE non supporté = skip + warn).
const cleanEntities = async (endpoint, opts = {}) => {
  const { protectedIds = [], onProgress, onLog, signal } = opts

  const ids = await listResourceIds(endpoint, { signal })
  const toDelete = ids.filter((id) => !protectedIds.map(String).includes(String(id)))
  const total = toDelete.length
  let deleted = 0
  let errors = 0

  onProgress?.(0, total)

  for (const id of toDelete) {
    if (signal?.aborted) break

    try {
      await deleteResourceItem(endpoint, id, { signal })
      deleted++
    } catch (err) {
      const status = err?.httpStatus
      if (status === 404) {
        // Déjà supprimé par cascade PrestaShop — on compte comme succès.
        deleted++
      } else if (status === 405) {
        // DELETE non supporté par l'API pour cette ressource.
        onLog?.(`⚠️ ${endpoint}/${id}: DELETE non supporté (405), ignoré`, 'warn')
      } else {
        errors++
        onLog?.(`❌ ${endpoint}/${id}: ${err?.message || err}`, 'error')
      }
    }

    onProgress?.(deleted + errors, total)
  }

  return { total, deleted, errors }
}

// Les images produit utilisent un endpoint hiérarchique en PS 8.x :
// GET  /api/images/products/{id_product}
// DELETE /api/images/products/{id_product}/{id_image}
const cleanImages = async (opts = {}) => {
  const { onProgress, onLog, signal } = opts

  const productIds = await listResourceIds('products', { signal })
  const composites = []

  for (const pid of productIds) {
    const imgs = await listProductImages(pid, { signal })
    composites.push(...imgs)
  }

  const total = composites.length
  let deleted = 0
  let errors = 0

  onProgress?.(0, total)

  for (const compositeId of composites) {
    if (signal?.aborted) break

    try {
      await deleteProductImage('images', compositeId, { signal })
      deleted++
    } catch (err) {
      const status = err?.httpStatus
      if (status === 404) {
        deleted++
      } else {
        errors++
        onLog?.(`❌ image ${compositeId}: ${err?.message || err}`, 'error')
      }
    }

    onProgress?.(deleted + errors, total)
  }

  return { total, deleted, errors }
}

// Les catégories PrestaShop utilisent un arbre nested-set (nleft/nright).
// Des suppressions concurrentes corrompent l'arbre → 500 sur les produits ensuite.
// On supprime séquentiellement les catégories de profondeur > 1 (feuilles avant parents).
const cleanCategories = async (opts = {}) => {
  const { onProgress, onLog, signal } = opts

  let ids
  try {
    // Protection robuste : exclut automatiquement Root (depth 0) et Home (depth 1)
    // quelle que soit leur ID dans cette installation PrestaShop.
    ids = await listCategoryIdsForDeletion({ signal })
  } catch {
    // Repli sur liste complète avec protection par ID en dur.
    const all = await listResourceIds('categories', { signal })
    ids = all.filter((id) => !['1', '2'].includes(String(id)))
  }

  const total = ids.length
  let deleted = 0
  let errors = 0

  onProgress?.(0, total)

  for (const id of ids) {
    if (signal?.aborted) break

    try {
      await deleteResourceItem('categories', id, { signal })
      deleted++
    } catch (err) {
      const status = err?.httpStatus
      if (status === 404) {
        deleted++
      } else if (status === 405) {
        onLog?.(`⚠️ catégorie/${id}: DELETE non supporté (405), ignoré`, 'warn')
      } else {
        errors++
        onLog?.(`❌ catégorie/${id}: ${err?.message || err}`, 'error')
      }
    }

    onProgress?.(deleted + errors, total)
  }

  return { total, deleted, errors }
}

// Le WS natif permet maintenant DELETE sur stock_movements.
const cleanStockMovements = async (opts = {}) => {
  const { onProgress, onLog, signal } = opts

  if (signal?.aborted) {
    return { total: 0, deleted: 0, errors: 0 }
  }

  onProgress?.(0, 1)

  try {
    const result = await clearStockMovements()
    const deleted = result?.deleted || 0
    const total = result?.total_before || deleted

    onProgress?.(total, total)

    if (deleted === 0) {
      onLog?.(`ℹ️ Aucun mouvement de stock à supprimer`, 'info')
    }

    return { total, deleted, errors: 0 }
  } catch (err) {
    onLog?.(`❌ Mouvements de stock: ${err?.message || err}`, 'error')
    return { total: 0, deleted: 0, errors: 1 }
  }
}

// Exécute une étape selon son type.
const runStep = (step, opts) => {
  switch (step.key) {
    case 'images':
      return cleanImages(opts)
    case 'categories':
      return cleanCategories(opts)
    case 'stock_movements':
      return cleanStockMovements(opts)
    default:
      return cleanEntities(step.key, opts)
  }
}

// Récupère les IDs d'adresses d'un client à partir de son ID customer.
const fetchCustomerAddressIds = async (customerId, signal) => {
  try {
    const xmlText = await requestXml(
      `addresses?display=[id]&filter[id_customer]=[${customerId}]`,
      { signal }
    )
    return parseResourceIds('addresses', xmlText)
  } catch {
    return []
  }
}

// Résout l'ID du compte GDPR anonyme (anonymous@psgdpr.com) par son email.
// L'ID est variable selon l'installation PrestaShop.
const fetchGdprAnonymousCustomerId = async (signal) => {
  try {
    const xmlText = await requestXml(
      `customers?display=[id]&filter[email]=[${GDPR_ANONYMOUS_EMAIL}]`,
      { signal }
    )
    const ids = parseResourceIds('customers', xmlText)
    return ids[0] ?? null
  } catch {
    return null
  }
}

// Lance la réinitialisation complète en séquence.
// Callbacks : onStepStart(step, index, total), onStepProgress(step, done, total),
//             onStepDone(step, result, index, total), onLog(message, level)
const runReset = async (callbacks = {}) => {
  const { onStepStart, onStepProgress, onStepDone, onLog } = callbacks
  const controller = new AbortController()
  const { signal } = controller
  const results = []

  const cancel = () => controller.abort()

  const execute = async () => {
    // Pré-charger les IDs à protéger : compte GDPR anonyme + ses adresses.
    const gdprCustomerId = await fetchGdprAnonymousCustomerId(signal).catch(() => null)
    const gdprAddressIds = gdprCustomerId
      ? await fetchCustomerAddressIds(gdprCustomerId, signal).catch(() => [])
      : []

    const protectedCustomerIds = gdprCustomerId ? [gdprCustomerId] : []
    const protectedAddrIds     = [...gdprAddressIds]

    onLog?.(
      gdprCustomerId
        ? `🔒 Protégé : client #${gdprCustomerId} (GDPR anonyme)` +
          (protectedAddrIds.length ? ` + ${protectedAddrIds.length} adresse(s)` : '')
        : '⚠️ Compte GDPR anonyme introuvable — aucun client protégé',
      'info'
    )

    for (let i = 0; i < RESET_STEPS.length; i++) {
      const step = RESET_STEPS[i]

      if (signal.aborted) break

      onStepStart?.(step, i, RESET_STEPS.length)
      onLog?.(`⏳ ${step.label}...`, 'info')

      // IDs à ne jamais supprimer selon le type d'entité
      const protectedIds =
        step.key === 'customers' ? protectedCustomerIds :
        step.key === 'addresses' ? protectedAddrIds :
        []

      let result
      try {
        result = await runStep(step, {
          onProgress: (done, total) => onStepProgress?.(step, done, total),
          onLog,
          signal,
          protectedIds,
        })
        const summary = `${result.deleted} supprimé(s)${result.errors ? `, ${result.errors} erreur(s)` : ''}`
        onLog?.(`✅ ${step.label}: ${summary}`, result.errors ? 'warn' : 'info')
        results.push({ ...step, ...result, status: result.errors > 0 ? 'partial' : 'ok' })
      } catch (err) {
        const message = err?.message || String(err)
        onLog?.(`❌ ${step.label}: ${message}`, 'error')
        results.push({ ...step, total: 0, deleted: 0, errors: 1, status: 'error', message })
      }

      onStepDone?.(results[results.length - 1], i, RESET_STEPS.length)
    }

    return results
  }

  return { execute, cancel }
}

export { RESET_STEPS, runReset, cleanEntities }
