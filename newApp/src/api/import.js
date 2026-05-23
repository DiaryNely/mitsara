// api/import.js
import { parseFichier1, parseFichier2, parseFichier3, groupVariantsByReference } from '../services/import/csvParser'
import { extractZip, getProductReferenceFromFilename } from '../services/import/zipExtractor'
import { uploadProductImages } from '../services/import/imageUploader'
import { createCategory, getCategories, getOrCreateCategory } from './categories'
import {
    createAttributeGroup,
    getAttributeGroups,
    getOrCreateAttributeGroup,
    getOrCreateAttributeValue,
} from './attributes'
import { createCombination, updateCombinationStock } from './combinations'
import { createCustomer, findCustomersByEmails } from './customers'
import { createAddress } from './addresses'
import { createProduct, updateProductStock } from './products'
import {
    getStockAvailable,
    recordStockMovementForProduct,
    syncProductStockFromCombinations,
    updateStockAvailable,
} from './stock'
import {
    getOrCreateTaxRuleGroup,
    getTaxRuleGroups,
    primeTaxRuleGroupsCache,
    calculatePriceHT,
    clearTaxCache,
    normalizeTaxRateNumber,
} from '../services/import/taxMapper'
import { createOrder, updateOrderStateWithStockMovement, updateOrderStatus, fixOrderHistoryDate } from './orders'
import { disableEmailSending, patchLogoUrlToHttp, restoreEmailSending } from './configurations'
import { getXmlClient } from './xmlClient'
import { buildXML, readText, xmlToJson } from '../utils/xml'
import { deleteResourceItem, deleteProductImage } from '../services/reset/apiClient'

// ---------------------------------------------------------------------------
// Contexte d'import — caches en mémoire (référence → id)
// ---------------------------------------------------------------------------
const importContext = {
    products: new Map(),
    categories: new Map(),
    attributeGroups: new Map(),
    attributeValues: new Map(),
    customers: new Map(),
    combinations: new Map(),
    combinationRefs: new Set(),
    addresses: new Map(),
}

const resetImportContext = () => {
    importContext.products.clear()
    importContext.categories.clear()
    importContext.attributeGroups.clear()
    importContext.attributeValues.clear()
    importContext.customers.clear()
    importContext.combinations.clear()
    importContext.combinationRefs.clear()
    importContext.addresses.clear()
}

// ---------------------------------------------------------------------------
// Contexte transactionnel — liste des entités créées pour le rollback
// ---------------------------------------------------------------------------
const createTxCtx = () => ({
    taxGroups: [],      // [{groupId, taxId}]  — rollback: delete taxe + groupe
    categories: [],     // [id]                — nouvelles seulement
    products: [],       // [id]
    attributeGroups: [],// [id]                — nouveaux seulement
    attributeValues: [],// [id]                — nouvelles seulement
    combinations: [],   // [id]
    images: [],         // [{productId, imageId}]
    addresses: [],      // [id]
    customers: [],      // [id]                — nouveaux seulement
    carts: [],          // [id]
    orders: [],         // [id]
})

// ---------------------------------------------------------------------------
// Rollback — supprime tout dans l'ordre inverse des dépendances
// ---------------------------------------------------------------------------
async function rollbackImport(txCtx, onLog) {
    const log = (msg) => { if (typeof onLog === 'function') onLog(msg, 'warn') }

    const tryDelete = async (resource, id) => {
        try {
            await deleteResourceItem(resource, id)
        } catch (err) {
            if (err?.httpStatus !== 404) {
                log(`  ⚠️ ${resource}/${id}: ${err?.message || err}`)
            }
        }
    }

    const tryDeleteImage = async ({ productId, imageId }) => {
        try {
            await deleteProductImage('images', `${productId}:${imageId}`)
        } catch (err) {
            if (err?.httpStatus !== 404) {
                log(`  ⚠️ image ${productId}:${imageId}: ${err?.message || err}`)
            }
        }
    }

    log('↩️ Rollback en cours — suppression des données créées...')

    for (const id of [...txCtx.orders].reverse()) {
        await tryDelete('orders', id)
        log(`  🗑️ Commande ${id}`)
    }
    for (const id of [...txCtx.carts].reverse()) {
        await tryDelete('carts', id)
        log(`  🗑️ Panier ${id}`)
    }
    for (const id of [...txCtx.combinations].reverse()) {
        await tryDelete('combinations', id)
        log(`  🗑️ Déclinaison ${id}`)
    }
    for (const entry of [...txCtx.images].reverse()) {
        await tryDeleteImage(entry)
        log(`  🗑️ Image ${entry.imageId} (produit ${entry.productId})`)
    }
    for (const id of [...txCtx.products].reverse()) {
        await tryDelete('products', id)
        log(`  🗑️ Produit ${id}`)
    }
    for (const id of [...txCtx.categories].reverse()) {
        await tryDelete('categories', id)
        log(`  🗑️ Catégorie ${id}`)
    }
    for (const id of [...txCtx.addresses].reverse()) {
        await tryDelete('addresses', id)
        log(`  🗑️ Adresse ${id}`)
    }
    for (const id of [...txCtx.customers].reverse()) {
        await tryDelete('customers', id)
        log(`  🗑️ Client ${id}`)
    }
    for (const id of [...txCtx.attributeValues].reverse()) {
        await tryDelete('product_option_values', id)
        log(`  🗑️ Valeur attribut ${id}`)
    }
    for (const id of [...txCtx.attributeGroups].reverse()) {
        await tryDelete('product_options', id)
        log(`  🗑️ Groupe attribut ${id}`)
    }
    for (const { groupId, taxId } of [...txCtx.taxGroups].reverse()) {
        await tryDelete('tax_rule_groups', groupId)
        if (taxId) await tryDelete('taxes', taxId)
        log(`  🗑️ Groupe taxe ${groupId}${taxId ? ` + taxe ${taxId}` : ''}`)
    }

    log('✅ Rollback terminé.')
}

// Supprime récursivement les @attributes (xlink:href, etc.) d'un nœud JSON.
// PrestaShop retourne ces attributs dans les GET mais les rejette dans les PUT.
const stripCartAttributes = (node) => {
    if (!node || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(stripCartAttributes)
    const result = {}
    for (const [key, value] of Object.entries(node)) {
        if (key === '@attributes') continue
        result[key] = stripCartAttributes(value)
    }
    return result
}

// PrestaShop ignore date_add à la création d'un cart (POST /carts).
// On doit faire un PUT correctif après création pour appliquer strictement la date du CSV.
const updateCartDates = async ({ cartId, dateAdd }) => {
    if (!cartId || !dateAdd) {
        throw new Error('cartId et dateAdd sont requis pour forcer la date du panier.')
    }

    const client = getXmlClient()
    const response = await client.get(`/carts/${encodeURIComponent(cartId)}?display=full`)
    const json = xmlToJson(response.data)
    const cartNode = json.prestashop?.cart || json.cart

    if (!cartNode || typeof cartNode !== 'object') {
        throw new Error(`Panier ${cartId} introuvable pour mise à jour de date.`)
    }

    const cleanNode = stripCartAttributes(cartNode)
    cleanNode.id = (cleanNode.id && String(cleanNode.id)) || String(cartId)
    cleanNode.date_add = dateAdd
    cleanNode.date_upd = dateAdd

    const updateXml = buildXML({ prestashop: { cart: cleanNode } })
    await client.put(`/carts/${encodeURIComponent(cartId)}`, updateXml)
}

const createCartFromOrder = async ({ customerId, addressId, rows, date_add }) => {
    if (!customerId || !addressId) {
        throw new Error('Client ou adresse manquant pour le panier')
    }

    const dateAdd = String(date_add || '').trim()
    if (!dateAdd) {
        throw new Error('date_add manquante pour le panier : la date doit provenir strictement du CSV.')
    }

    const cartRows = rows
        .filter((row) => row && row.productId && row.quantity)
        .map((row) => ({
            id_product: row.productId,
            id_product_attribute: row.productAttributeId || 0,
            quantity: row.quantity,
        }))

    const cartXml = buildXML({
        prestashop: {
            cart: {
                id_customer: customerId,
                id_address_delivery: addressId,
                id_address_invoice: addressId,
                id_currency: 1,
                id_lang: 1,
                id_carrier: 1,
                id_shop: 1,
                date_add: dateAdd,
                date_upd: dateAdd,
                ...(cartRows.length
                    ? {
                        associations: {
                            cart_rows: {
                                cart_row: cartRows,
                            },
                        },
                    }
                    : {}),
            },
        },
    })

    const client = getXmlClient()
    const response = await client.post('/carts', cartXml)
    const json = xmlToJson(response.data)
    const cartId = readText(json.prestashop?.cart?.id)
    if (!cartId) {
        throw new Error('Panier créé mais ID introuvable')
    }

    // PrestaShop ignore date_add à la POST initiale → PUT correctif obligatoire.
    // En cas d'échec, l'exception remonte → rollback transactionnel.
    await updateCartDates({ cartId, dateAdd })

    return cartId
}

// ---------------------------------------------------------------------------
// Validation pré-import — vérifie les données CSV avant tout appel API
// ---------------------------------------------------------------------------
export function validateImportData({ products, variants, orders }, onLog) {
    const errors = []

    // ── Fichier1 : Produits ───────────────────────────────────────────────────
    const refSet = new Set()
    for (let i = 0; i < products.length; i++) {
        const p = products[i]
        const line = i + 2

        if (!String(p.nom || '').trim())
            errors.push(`Fichier1 ligne ${line}: champ "nom" manquant`)

        if (!String(p.reference || '').trim()) {
            errors.push(`Fichier1 ligne ${line}: champ "reference" manquant`)
        } else if (refSet.has(p.reference)) {
            errors.push(`Fichier1 ligne ${line}: référence dupliquée "${p.reference}"`)
        } else {
            refSet.add(p.reference)
        }

        // Montant : prix_ttc obligatoire et strictement positif
        if (p.prix_ttc == null || p.prix_ttc === '' || isNaN(Number(p.prix_ttc)) || Number(p.prix_ttc) <= 0)
            errors.push(`Fichier1 "${p.reference}": prix_ttc doit être un nombre strictement positif (reçu : "${p.prix_ttc}")`)

        // Montant : prix_achat optionnel mais ≥ 0 si renseigné
        if (p.prix_achat !== '' && p.prix_achat != null) {
            const v = Number(p.prix_achat)
            if (isNaN(v) || v < 0)
                errors.push(`Fichier1 "${p.reference}": prix_achat doit être ≥ 0 (reçu : "${p.prix_achat}")`)
        }

        // Taxe : optionnelle, peut être 0 ou absente ; si présente doit être un nombre ≥ 0
        const taxeStr = String(p.taxe ?? '').trim()
        if (taxeStr) {
            const taxValue = parseFloat(taxeStr.replace(',', '.').replace('%', ''))
            if (isNaN(taxValue) || taxValue < 0)
                errors.push(`Fichier1 "${p.reference}": taxe invalide "${p.taxe}" (laisser vide ou nombre ≥ 0)`)
        }

        if (!String(p.categorie || '').trim())
            errors.push(`Fichier1 "${p.reference}": catégorie manquante`)

        // Date de disponibilité : optionnelle, sinon strict DD/MM/YYYY
        if (String(p.date_availability_produit || '').trim() &&
            !normalizeCsvAvailabilityDate(p.date_availability_produit)) {
            errors.push(`Fichier1 "${p.reference}": date_availability_produit "${p.date_availability_produit}" invalide (format DD/MM/YYYY attendu)`)
        }
    }

    // ── Fichier2 : Déclinaisons ───────────────────────────────────────────────
    // Une seule spécificité par produit (taille OU couleur, jamais les deux).
    const specsByRef = new Map()

    for (let i = 0; i < variants.length; i++) {
        const v = variants[i]
        const line = i + 2

        if (!String(v.reference || '').trim()) {
            errors.push(`Fichier2 ligne ${line}: référence manquante`)
        } else if (!refSet.has(v.reference)) {
            errors.push(`Fichier2 ligne ${line}: référence "${v.reference}" absente du fichier produits`)
        }

        // Stock : entier ≥ 0
        if (v.stock_initial != null && (isNaN(Number(v.stock_initial)) || Number(v.stock_initial) < 0))
            errors.push(`Fichier2 "${v.reference}": stock_initial invalide (${v.stock_initial})`)

        // Montant : prix_vente_ttc optionnel mais strictement positif si renseigné
        if (v.prix_vente_ttc != null) {
            const pv = Number(v.prix_vente_ttc)
            if (isNaN(pv) || pv <= 0)
                errors.push(`Fichier2 "${v.reference}": prix_vente_ttc doit être strictement positif (reçu : "${v.prix_vente_ttc}")`)
        }

        // Collecte des spécificités par produit pour validation post-boucle
        if (v.reference && v.specificite) {
            const key = String(v.specificite).trim().toLowerCase()
            if (key) {
                if (!specsByRef.has(v.reference)) specsByRef.set(v.reference, new Set())
                specsByRef.get(v.reference).add(key)
            }
        }
    }

    // Un produit ne peut avoir qu'un seul type de déclinaison (taille OU couleur)
    for (const [ref, specs] of specsByRef) {
        if (specs.size > 1) {
            errors.push(
                `Fichier2 "${ref}": un produit ne peut avoir qu'une seule déclinaison ` +
                `(trouvé : ${[...specs].join(', ')}). Les combinaisons multiples ne sont pas supportées.`
            )
        }
    }

    // ── Fichier3 : Commandes ──────────────────────────────────────────────────
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    for (let i = 0; i < orders.length; i++) {
        const o = orders[i]
        const line = i + 2

        if (!String(o.email || '').trim())
            errors.push(`Fichier3 ligne ${line}: email manquant`)
        else if (!emailRe.test(o.email))
            errors.push(`Fichier3 ligne ${line}: email invalide "${o.email}"`)

        if (!String(o.nom || '').trim())
            errors.push(`Fichier3 ligne ${line}: nom manquant`)

        // Date STRICT DD/MM/YYYY
        if (!String(o.date || '').trim())
            errors.push(`Fichier3 ligne ${line}: date manquante (1re colonne)`)
        else if (!normalizeCsvOrderDate(o.date))
            errors.push(`Fichier3 ligne ${line}: date "${o.date}" invalide (format DD/MM/YYYY attendu)`)

        for (const item of (o.achat || [])) {
            if (item.reference && !refSet.has(item.reference)) {
                errors.push(`Fichier3 ligne ${line}: référence produit "${item.reference}" inconnue`)
            }
            if (item.quantity != null && (isNaN(Number(item.quantity)) || Number(item.quantity) <= 0)) {
                errors.push(`Fichier3 ligne ${line}: quantité invalide "${item.quantity}" pour "${item.reference}" (doit être > 0)`)
            }
        }

        // etat vide = non commande (panier) — importee comme commande "non commande" dans stageOrders
    }

    if (errors.length > 0) {
        for (const err of errors) {
            if (typeof onLog === 'function') onLog(`❌ ${err}`, 'error')
        }
        throw new Error(`Validation échouée: ${errors.length} erreur(s) trouvée(s) dans les fichiers CSV`)
    }

    if (typeof onLog === 'function')
        onLog(`✅ Validation OK — ${products.length} produit(s), ${variants.length} déclinaison(s), ${orders.length} commande(s)`)
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
const normalizeError = (error) => {
    if (error instanceof Error) return error
    const message = error && typeof error === 'object' && 'message' in error
        ? error.message
        : String(error)
    return new Error(message)
}

const logError = (onLog, context, error) => {
    const err = normalizeError(error)
    if (!err.__logged) {
        const detail = err.message || 'Erreur inconnue'
        if (typeof onLog === 'function') onLog(`❌ ${context}: ${detail}`, 'error')
        err.__logged = true
    }
    return err
}

const pad2 = (value) => String(value).padStart(2, '0')

// Format de date strict : DD/MM/YYYY uniquement (avec heure optionnelle pour les commandes).
// Tout autre format (YYYY-MM-DD, DD-MM-YYYY, ISO, etc.) est refusé conformément aux règles métier.

const isValidGregorianDate = (Y, M, D) => {
    if (!Number.isFinite(Y) || !Number.isFinite(M) || !Number.isFinite(D)) return false
    if (M < 1 || M > 12 || D < 1 || D > 31) return false
    const dt = new Date(Y, M - 1, D)
    return dt.getFullYear() === Y && dt.getMonth() === M - 1 && dt.getDate() === D
}

const normalizeCsvOrderDate = (value) => {
    const text = String(value ?? '').trim()
    if (!text) return ''

    // STRICT : DD/MM/YYYY uniquement, heure optionnelle HH:MM[:SS]
    const dmy = text.match(/^([0-9]{2})\/([0-9]{2})\/([0-9]{4})(?:\s+([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?)?$/)
    if (!dmy) return ''

    const D = Number(dmy[1]), M = Number(dmy[2]), Y = Number(dmy[3])
    if (!isValidGregorianDate(Y, M, D)) return ''

    const h = dmy[4] !== undefined ? Number(dmy[4]) : 0
    const m = dmy[5] !== undefined ? Number(dmy[5]) : 0
    const s = dmy[6] !== undefined ? Number(dmy[6]) : 0
    if (h > 23 || m > 59 || s > 59) return ''

    return `${Y}-${pad2(M)}-${pad2(D)} ${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

const normalizeCsvAvailabilityDate = (value) => {
    const text = String(value ?? '').trim()
    if (!text) return ''

    // STRICT : DD/MM/YYYY uniquement
    const dmy = text.match(/^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/)
    if (!dmy) return ''

    const D = Number(dmy[1]), M = Number(dmy[2]), Y = Number(dmy[3])
    if (!isValidGregorianDate(Y, M, D)) return ''

    return `${Y}-${pad2(M)}-${pad2(D)}`
}

// ---------------------------------------------------------------------------
// Stock — mouvement via WS stock_movements (fallback sur updateStock)
// ---------------------------------------------------------------------------
const applyStockMovement = async ({
    productId,
    attributeId = 0,
    targetQuantity,
    dateAdd,
    onLog,
    fallback,
    // assumeZeroStock = true : on vient de créer le produit/déclinaison, donc
    // le stock courant côté PS est 0 → on évite le GET /stock_availables.
    assumeZeroStock = false,
}) => {
    const log = (msg) => { if (typeof onLog === 'function') onLog(msg, 'warn') }

    let currentQty = null
    let stockNode = null
    if (assumeZeroStock) {
        currentQty = 0
    }

    try {
        stockNode = await getStockAvailable(productId, attributeId)
        if (stockNode && Number.isFinite(stockNode.quantity)) currentQty = stockNode.quantity
    } catch {
        if (!assumeZeroStock) currentQty = null
    }

    const target = Number(targetQuantity || 0)
    const delta = currentQty == null ? target : target - currentQty

    if (!delta) return { success: true, delta: 0 }

    try {
        if (stockNode) {
            await updateStockAvailable(stockNode, target)
        } else if (typeof fallback === 'function') {
            await fallback()
        } else {
            throw new Error(`Stock introuvable pour produit ${productId} / attr ${attributeId}`)
        }
    } catch (error) {
        log(`⚠️ Mise a jour stock echouee (prod ${productId}, attr ${attributeId}).`)
        throw error
    }

    try {
        const movementId = await recordStockMovementForProduct({
            productId,
            attributeId,
            stockId: stockNode?.id || undefined,
            physical_quantity: Math.abs(delta),
            sign: delta < 0 ? -1 : 1,
            date_add: dateAdd || undefined,
            preferModule: true,
        })

        if (!movementId) {
            log(`⚠️ Mouvement stock non enregistre (prod ${productId}, attr ${attributeId}).`)
        }
    } catch (error) {
        log(`⚠️ Mouvement stock WS echoue (prod ${productId}, attr ${attributeId}).`)
    }

    return { success: true, delta }
}

// ---------------------------------------------------------------------------
// Stock — mouvements de sortie liés à une commande
// ---------------------------------------------------------------------------
const applyOrderStockOut = async ({
    orderId,
    orderDetails,
    dateAdd,
    onLog,
    updateStock = true,
    recordMovement = true,
}) => {
    if (!orderId || !Array.isArray(orderDetails) || !orderDetails.length) {
        return { success: false, movementsCreated: 0 }
    }

    const items = orderDetails
        .map((item) => ({
            productId: item?.productId,
            combinationId: item?.productAttributeId || 0,
            quantity: Number(item?.quantity || 0),
        }))
        .filter((item) => item.productId && item.quantity > 0)

    if (!items.length) {
        return { success: false, movementsCreated: 0 }
    }

    let created = 0
    let updated = 0

    for (const item of items) {
        try {
            if (updateStock) {
                const stockNode = await getStockAvailable(item.productId, item.combinationId)
                if (!stockNode) {
                    throw new Error('Stock introuvable')
                }

                const nextQty = Math.max(0, (stockNode.quantity || 0) - item.quantity)
                await updateStockAvailable(stockNode, nextQty)
                updated++
            }

            if (recordMovement) {
                const movementId = await recordStockMovementForProduct({
                    productId: item.productId,
                    attributeId: item.combinationId,
                    physical_quantity: item.quantity,
                    sign: -1,
                    date_add: dateAdd,
                })

                if (movementId) created++
            }
        } catch (error) {
            if (typeof onLog === 'function') {
                onLog(
                    `  ⚠️ Mouvement stock non applique (commande ${orderId}, prod ${item.productId}): ` +
                    `${error?.message || error}`,
                    'warn'
                )
            }
        }
    }

    if (typeof onLog === 'function') {
        if (recordMovement) {
            onLog(`  ✅ Mouvements de stock créés (commande ${orderId}): ${created}`)
        } else if (updateStock) {
            onLog(`  ✅ Stock disponible mis a jour (commande ${orderId}): ${updated}`)
        }
    }

    const success = recordMovement ? created > 0 : updateStock ? updated > 0 : false
    return { success, movementsCreated: created, stockUpdated: updated }
}

// ---------------------------------------------------------------------------
// Étape 1 : Produits
// ---------------------------------------------------------------------------
const normalizeCategoryKey = (name) => String(name || '').trim().toLowerCase()
const PRODUCT_CONCURRENCY = 5

// Mini-pool : exécute `task(item, index)` en parallèle, borné à `concurrency`.
// Préserve l'ordre des résultats par index.
async function runWithConcurrency(items, concurrency, task) {
    const results = new Array(items.length)
    let cursor = 0
    const workers = Array.from(
        { length: Math.max(1, Math.min(concurrency, items.length)) },
        async () => {
            while (true) {
                const idx = cursor++
                if (idx >= items.length) return
                results[idx] = await task(items[idx], idx)
            }
        }
    )
    await Promise.all(workers)
    return results
}

async function stageProducts(products, txCtx, onProgress, onLog) {
    onLog(`📦 Étape 1/4 — Import produits: ${products.length} produit(s)`)

    // ── Phase 1.A : pré-chargement des référentiels ──────────────────────────
    const [existingCategories, existingTaxGroups] = await Promise.all([
        getCategories().catch(() => []),
        getTaxRuleGroups().catch(() => []),
    ])

    primeTaxRuleGroupsCache(existingTaxGroups)

    const categoryByKey = new Map()
    for (const cat of existingCategories) {
        if (!cat || !cat.id) continue
        const key = normalizeCategoryKey(cat.name)
        if (key && !categoryByKey.has(key)) {
            categoryByKey.set(key, cat.id)
            if (!importContext.categories.has(cat.name)) {
                importContext.categories.set(cat.name, cat.id)
            }
        }
    }

    // ── Phase 1.B : pré-création séquentielle des ressources partagées ───────
    // Dédoublonner pour éviter les races (2 produits avec même catégorie nouvelle
    // créeraient 2 catégories en parallèle).
    const newCategoryNames = []
    const seenNewCats = new Set()
    for (const product of products) {
        if (importContext.categories.get(product.categorie)) continue
        const key = normalizeCategoryKey(product.categorie)
        if (!key || categoryByKey.has(key) || seenNewCats.has(key)) continue
        seenNewCats.add(key)
        newCategoryNames.push(product.categorie)
    }

    for (const name of newCategoryNames) {
        const id = await createCategory(name)
        const key = normalizeCategoryKey(name)
        if (key) categoryByKey.set(key, id)
        importContext.categories.set(name, id)
        txCtx.categories.push(id)
        onLog(`  → Catégorie "${name}" créée (ID: ${id})`)
    }

    // Pré-création des groupes de taxe (séquentiel — peu de taxes uniques).
    const seenNewTaxes = new Set()
    for (const product of products) {
        const taxRateNumber = normalizeTaxRateNumber(product.taxe)
        if (!Number.isFinite(taxRateNumber) || taxRateNumber <= 0) continue
        const key = String(taxRateNumber)
        if (seenNewTaxes.has(key)) continue
        seenNewTaxes.add(key)
        // getOrCreateTaxRuleGroup consulte taxCache (déjà hydraté) avant tout GET.
        const taxResult = await getOrCreateTaxRuleGroup(product.taxe, onLog)
        if (taxResult.created) {
            txCtx.taxGroups.push({ groupId: taxResult.groupId, taxId: taxResult.taxId })
        }
        onLog(`  → Taxe ${product.taxe} → groupe ID: ${taxResult.groupId}`)
    }

    // ── Phase 1.C : création des produits en parallèle borné ─────────────────
    // Toutes les ressources partagées (catégories, taxes) sont déjà en cache,
    // donc chaque création produit est totalement indépendante.
    let processed = 0

    await runWithConcurrency(products, PRODUCT_CONCURRENCY, async (product) => {
        const categoryId = importContext.categories.get(product.categorie)

        let taxRuleGroupId = null
        const taxRateNumber = normalizeTaxRateNumber(product.taxe)
        if (Number.isFinite(taxRateNumber) && taxRateNumber > 0) {
            const taxResult = await getOrCreateTaxRuleGroup(product.taxe, onLog)
            taxRuleGroupId = taxResult.groupId
        }

        const priceHT = calculatePriceHT(product.prix_ttc, product.taxe)
        const availableDate = normalizeCsvAvailabilityDate(product.date_availability_produit)

        const productId = await createProduct({
            name: product.nom,
            reference: product.reference,
            price: priceHT,
            wholesalePrice: product.prix_achat,
            id_category_default: categoryId,
            id_tax_rules_group: taxRuleGroupId,
            ...(availableDate ? { available_date: availableDate } : {})
        })

        txCtx.products.push(productId)
        importContext.products.set(product.reference, {
            id: productId,
            name: product.nom,
            priceHT,
            priceTTC: product.prix_ttc,
            taxRate: product.taxe,
            availableDate,
        })

        processed++
        onProgress('import_products', `Import: ${product.nom}`, processed, products.length)
        onLog(`  ✅ Produit "${product.nom}" créé (ID: ${productId}) — ${priceHT.toFixed(2)}€ HT`)
    })

    onLog(`✅ Étape 1 terminée: ${txCtx.products.length} produit(s) créé(s)`)
}

// ---------------------------------------------------------------------------
// Étape 2 : Déclinaisons
// ---------------------------------------------------------------------------
const COMBINATION_CONCURRENCY = 5

async function stageCombinations(variants, txCtx, onProgress, onLog) {
    const grouped = groupVariantsByReference(variants)

    onLog(`🎨 Étape 2/4 — Import déclinaisons: ${variants.length} ligne(s)`)

    // ── Phase 2.A : pré-chargement des groupes d'attributs ───────────────────
    try {
        const existingGroups = await getAttributeGroups()
        for (const group of existingGroups) {
            if (group && group.name && group.id && !importContext.attributeGroups.has(group.name)) {
                importContext.attributeGroups.set(group.name, group.id)
            }
        }
    } catch (error) {
        onLog(`  ⚠️ Pré-chargement groupes attributs ignoré: ${error?.message || error}`, 'warn')
    }

    // ── Phase 2.B : pré-création séquentielle des ressources partagées ───────
    // Énumérer les variantes "réelles" (avec spécificité+karazany) et collecter
    // les paires uniques (groupName, valueName) à créer.
    const realVariants = []
    const simpleStockItems = []
    const requiredGroupNames = new Set()

    for (const [reference, variantList] of grouped) {
        const product = importContext.products.get(reference)
        if (!product) {
            onLog(`  ⚠️ Produit ${reference} non trouvé, déclinaisons ignorées`)
            continue
        }

        for (const variant of variantList) {
            if (!variant.specificite || !variant.karazany) {
                simpleStockItems.push({ product, reference, variant })
                continue
            }
            const groupName = variant.specificite === 'taille' ? 'Taille' : 'Couleur'
            requiredGroupNames.add(groupName)
            realVariants.push({ product, reference, variant, groupName })
        }
    }

    // Création des groupes d'attributs manquants (séquentiel, peu nombreux).
    for (const groupName of requiredGroupNames) {
        if (importContext.attributeGroups.has(groupName)) continue
        const groupResult = await getOrCreateAttributeGroup(groupName)
        importContext.attributeGroups.set(groupName, groupResult.id)
        if (groupResult.created) {
            txCtx.attributeGroups.push(groupResult.id)
            onLog(`  → Groupe attribut "${groupName}" créé (ID: ${groupResult.id})`)
        } else {
            onLog(`  → Groupe attribut "${groupName}" existant (ID: ${groupResult.id})`)
        }
    }

    // Création des valeurs d'attributs manquantes (séquentiel par paire unique).
    const requiredValues = new Map() // valueKey → { groupName, valueName, groupId }
    for (const { groupName, variant } of realVariants) {
        const valueKey = `${groupName}_${variant.karazany}`
        if (importContext.attributeValues.has(valueKey) || requiredValues.has(valueKey)) continue
        requiredValues.set(valueKey, {
            groupName,
            valueName: variant.karazany,
            groupId: importContext.attributeGroups.get(groupName),
        })
    }

    for (const [valueKey, { valueName, groupId }] of requiredValues) {
        const valueResult = await getOrCreateAttributeValue(groupId, valueName)
        importContext.attributeValues.set(valueKey, valueResult.id)
        if (valueResult.created) {
            txCtx.attributeValues.push(valueResult.id)
            onLog(`  → Valeur "${valueName}" créée (ID: ${valueResult.id})`)
        }
    }

    // ── Phase 2.C : stocks produits simples (séquentiels — peu nombreux) ─────
    for (const { product, reference, variant } of simpleStockItems) {
        const movementDateAdd = product.availableDate
            ? `${product.availableDate} 00:00:00`
            : ''
        await applyStockMovement({
            productId: product.id,
            attributeId: 0,
            targetQuantity: variant.stock_initial,
            dateAdd: movementDateAdd,
            onLog,
            fallback: () => updateProductStock(product.id, variant.stock_initial),
            assumeZeroStock: true,
        })
        onLog(`  → Produit ${reference}: stock ${variant.stock_initial}`)
    }

    // ── Phase 2.D : création des déclinaisons en parallèle borné ─────────────
    let processed = 0
    const comboProductIds = new Set(realVariants.map((entry) => entry.product.id))

    await runWithConcurrency(realVariants, COMBINATION_CONCURRENCY, async ({ product, reference, variant, groupName }) => {
        const valueKey = `${groupName}_${variant.karazany}`
        const valueId = importContext.attributeValues.get(valueKey)

        const basePriceHT = Number(product.priceHT ?? 0)
        const variantPriceTTC = Number(
            variant.prix_vente_ttc != null ? variant.prix_vente_ttc : product.priceTTC ?? 0
        )
        const variantPriceHT = calculatePriceHT(variantPriceTTC, product.taxRate)
        const impactHT = Math.round((variantPriceHT - basePriceHT) * 1e6) / 1e6

        const combinationId = await createCombination({
            productId: product.id,
            reference: `${reference}-${variant.karazany}`,
            attributeValues: [{ id: valueId }],
            price: impactHT,
            minimal_quantity: 1,
            quantity: variant.stock_initial,
        })

        txCtx.combinations.push(combinationId)

        const comboKey = `${reference}::${String(variant.karazany).trim().toLowerCase()}`
        importContext.combinations.set(comboKey, {
            id: combinationId,
            productId: product.id,
            priceHT: variantPriceHT,
            priceTTC: variantPriceTTC,
        })

        const movementDateAdd = product.availableDate
            ? `${product.availableDate} 00:00:00`
            : ''

        await applyStockMovement({
            productId: product.id,
            attributeId: combinationId,
            targetQuantity: variant.stock_initial,
            dateAdd: movementDateAdd,
            onLog,
            fallback: () => updateCombinationStock(combinationId, variant.stock_initial, product.id),
            assumeZeroStock: true,
        })

        processed++
        onProgress('import_combinations', `${reference} - ${variant.karazany}`, processed, realVariants.length)
        onLog(`  ✅ Déclinaison ${reference} - ${variant.karazany} (stock: ${variant.stock_initial})`)
    })

    for (const productId of comboProductIds) {
        try {
            await syncProductStockFromCombinations(productId)
        } catch (error) {
            onLog(`  ⚠️ Sync stock global produit ${productId}: ${error?.message || error}`, 'warn')
        }
    }

    onLog(`✅ Étape 2 terminée: ${realVariants.length} déclinaison(s) créée(s)`)
}

// ---------------------------------------------------------------------------
// Étape 3 : Images
// ---------------------------------------------------------------------------
async function stageImages(zipFile, txCtx, onProgress, onLog) {
    onLog('🖼️ Étape 3/4 — Extraction ZIP...')
    const images = await extractZip(zipFile, onLog)
    onLog(`  → ${images.length} image(s) trouvée(s)`)

    // Seule source de vérité : les références produits importées depuis le CSV.
    // Le matcher cherche EXCLUSIVEMENT dans cette liste — aucune devinette.
    const csvReferences = Array.from(importContext.products.keys())

    const imagesByProduct = new Map()
    const unmatchedFiles = []
    for (const image of images) {
        const reference = getProductReferenceFromFilename(image.name, csvReferences)
        if (reference) {
            if (!imagesByProduct.has(reference)) imagesByProduct.set(reference, [])
            imagesByProduct.get(reference).push(image)
        } else {
            unmatchedFiles.push(image.name)
        }
    }

    if (unmatchedFiles.length) {
        const preview = unmatchedFiles.slice(0, 5).join(', ')
        const suffix = unmatchedFiles.length > 5 ? '…' : ''
        onLog(`  ⚠️ ${unmatchedFiles.length} image(s) sans correspondance avec une référence CSV: ${preview}${suffix}`, 'warn')
    }

    let totalUploaded = 0

    for (const [reference, productImages] of imagesByProduct) {
        const product = importContext.products.get(reference)
        if (!product) {
            onLog(`  ⚠️ Produit ${reference} non trouvé, images ignorées`)
            continue
        }

        onProgress('import_images', `Upload: ${reference}`, totalUploaded, images.length)

        const results = await uploadProductImages(product.id, productImages, (msg) => onLog(`  ${msg}`))

        for (const result of results) {
            if (result.success && result.imageId) {
                txCtx.images.push({ productId: product.id, imageId: result.imageId })
            }
            if (!result.success) {
                throw new Error(`Échec upload image "${result.filename}": ${result.error}`)
            }
        }

        totalUploaded += productImages.length
    }

    onLog(`✅ Étape 3 terminée: ${totalUploaded} image(s) uploadée(s)`)
}

// ---------------------------------------------------------------------------
// Étape 4 : Commandes
// ---------------------------------------------------------------------------

const normalizeImportLabel = (value) => {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

const ORDER_STATE_PAID_ID = 2
const ORDER_STATE_DELIVERED_ID = 5
const ORDER_STATE_CANCELLED_ID = 6

const normalizeStateLabel = (value) => {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}
const ORDER_CONCURRENCY = 1
const ORDER_RETRY_COUNT = 3
const ORDER_RETRY_DELAY_MS = 800

const shouldRetryOrderError = (error) => {
    const status = error?.response?.status
    if (status === 500) return true
    const message = String(error?.message || '')
    return message.includes('status code 500')
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const createOrderWithRetry = async (payload, onLog) => {
    let attempt = 0
    while (attempt < ORDER_RETRY_COUNT) {
        try {
            return await createOrder(payload)
        } catch (error) {
            attempt++
            if (!shouldRetryOrderError(error) || attempt >= ORDER_RETRY_COUNT) {
                throw error
            }
            if (typeof onLog === 'function') {
                onLog(`  ⚠️ Erreur 500 creation commande, retry ${attempt}/${ORDER_RETRY_COUNT}...`, 'warn')
            }
            await delay(ORDER_RETRY_DELAY_MS)
        }
    }
    throw new Error('Echec creation commande apres retries')
}

async function stageOrders(orders, txCtx, onProgress, onLog) {
    onLog(`📋 Étape 4/4 — Import commandes: ${orders.length} commande(s)`)

    onLog('  🔧 Vérification logo TCPDF (PS_LOGO)...')
    await patchLogoUrlToHttp(onLog)

    // ── Phase 4.A : pré-résolution des clients existants ─────────────────────
    try {
        const allEmails = orders.map((order) => order.email).filter(Boolean)
        const existingByEmail = await findCustomersByEmails(allEmails)
        if (existingByEmail.size) {
            for (const order of orders) {
                const key = String(order.email || '').trim().toLowerCase()
                const existingId = existingByEmail.get(key)
                if (existingId && !importContext.customers.has(order.email)) {
                    importContext.customers.set(order.email, existingId)
                }
            }
            onLog(`  → ${existingByEmail.size} client(s) existant(s) pré-résolus`)
        }
    } catch (error) {
        onLog(`  ⚠️ Pré-résolution clients ignorée: ${error?.message || error}`, 'warn')
    }

    // ── Phase 4.B : pré-création séquentielle des clients nouveaux ───────────
    // Dédoublonner par email pour éviter qu'on crée 2 fois le même client
    // si plusieurs commandes partagent la même adresse mail.
    const customersToCreate = new Map() // email → { nom, pwd }
    for (const order of orders) {
        if (!order.email || importContext.customers.has(order.email)) continue
        if (customersToCreate.has(order.email)) continue
        customersToCreate.set(order.email, { nom: order.nom, pwd: order.pwd })
    }

    for (const [email, info] of customersToCreate) {
        const customerResult = await createCustomer({
            email,
            lastname: info.nom,
            firstname: info.nom,
            passwd: info.pwd,
        })
        importContext.customers.set(email, customerResult.id)
        if (customerResult.created) {
            txCtx.customers.push(customerResult.id)
            onLog(`  → Client créé: ${email} (ID: ${customerResult.id})`)
        } else {
            onLog(`  → Client existant: ${email} (ID: ${customerResult.id})`)
        }
    }

    // ── Phase 4.C : pré-création des adresses dédoublonnées ──────────────────
    // Clef = id_customer + adresse brute lowercased (même logique que la version séquentielle).
    const addressesToCreate = new Map() // addressKey → { customerId, nom, adresse }
    for (const order of orders) {
        const customerId = importContext.customers.get(order.email)
        if (!customerId) continue
        const rawAddress = String(order.adresse || '').trim()
        const addressKey = `${customerId}::${rawAddress.toLowerCase()}`
        if (importContext.addresses.has(addressKey) || addressesToCreate.has(addressKey)) continue
        addressesToCreate.set(addressKey, { customerId, nom: order.nom, adresse: order.adresse })
    }

    for (const [addressKey, info] of addressesToCreate) {
        const addressId = await createAddress({
            id_customer: info.customerId,
            lastname: info.nom,
            address1: info.adresse,
            city: 'Antananarivo',
            postcode: '101',
        })
        importContext.addresses.set(addressKey, addressId)
        txCtx.addresses.push(addressId)
    }

    // ── Phase 4.D : création des commandes en parallèle borné ────────────────
    let processed = 0
    let totalOrders = 0
    let totalCarts = 0

    await runWithConcurrency(orders, ORDER_CONCURRENCY, async (order) => {
        const customerId = importContext.customers.get(order.email)
        const rawAddress = String(order.adresse || '').trim()
        const addressKey = `${customerId}::${rawAddress.toLowerCase()}`
        const addressId = importContext.addresses.get(addressKey)

        // Calcul totaux
        let totalAmountTTC = 0
        let totalAmountHT = 0

        // Map de dédoublonnage par (productId, productAttributeId) — filet de sécurité
        // si deux variantes distinctes du CSV résolvent vers le même id_product_attribute
        // (ex : variante inconnue → 0 + même produit sans variante → 0).
        const detailMap = new Map()

        for (const item of order.achat) {
            const product = importContext.products.get(item.reference)
            if (!product) continue

            const variant = item.variant ? String(item.variant).trim() : ''
            const comboKey = variant ? `${item.reference}::${variant.toLowerCase()}` : ''
            const combo = comboKey ? importContext.combinations.get(comboKey) : null

            const productAttributeId = combo?.id || 0
            const unitPriceTTC = Number(combo?.priceTTC != null ? combo.priceTTC : product.priceTTC ?? 0)
            const unitPriceHT = Number(
                combo?.priceHT != null ? combo.priceHT
                    : product.priceHT != null ? product.priceHT
                    : calculatePriceHT(unitPriceTTC, product.taxRate)
            )

            const rowKey = `${product.id}::${productAttributeId}`

            if (detailMap.has(rowKey)) {
                const existing = detailMap.get(rowKey)
                existing.quantity += item.quantity
                existing.totalPriceTTC += unitPriceTTC * item.quantity
                existing.totalPriceHT  += unitPriceHT  * item.quantity
                if (typeof onLog === 'function') {
                    onLog(
                        `  ⚠️ Doublon produit "${item.reference}"${variant ? ` (${variant})` : ''} fusionné (qty +${item.quantity}).`,
                        'warn'
                    )
                }
            } else {
                detailMap.set(rowKey, {
                    productId: product.id,
                    productAttributeId,
                    productName: product.name,
                    reference: item.reference,
                    variant,
                    quantity: item.quantity,
                    unitPrice: unitPriceHT,
                    unitPriceTTC,
                    totalPriceTTC: unitPriceTTC * item.quantity,
                    totalPriceHT:  unitPriceHT  * item.quantity,
                })
            }
        }

        const orderDetails = Array.from(detailMap.values())

        // Recalcul des totaux à partir des lignes dédoublonnées
        for (const d of orderDetails) {
            totalAmountTTC += d.totalPriceTTC
            totalAmountHT  += d.totalPriceHT
        }

        const normalizedDate = normalizeCsvOrderDate(order.date)

        const rawState = String(order.etat || '').trim()
        const normalizedState = normalizeStateLabel(rawState)
        const isCartState =
            !rawState ||
            normalizedState.includes('panier') ||
            normalizedState.includes('cart')

        const isNonCommandeState =
            !rawState ||
            isCartState ||
            normalizedState.includes('non commande') ||
            normalizedState.includes('non command')

        const isPaidState =
            normalizedState.includes('paiement') &&
            (normalizedState.includes('accepte') || normalizedState.includes('effectue'))
        const isDeliveredState = normalizedState.includes('livre')
        const isCancelledState = normalizedState.includes('annule')

        if (isNonCommandeState) {
            const cartStateLabel = rawState || (isCartState ? 'dans le panier' : 'non commande')

            if (isCartState) {
                const cartId = await createCartFromOrder({
                    customerId,
                    addressId,
                    rows: orderDetails,
                    date_add: normalizedDate,
                })

                txCtx.carts.push(cartId)
                totalCarts++
                processed++
                onProgress('import_orders', `Panier: ${order.email}`, processed, orders.length)
                onLog(`  ✅ Panier créé (ID: ${cartId}) — Etat: ${cartStateLabel}`)
                return
            }

            const { orderId, cartId } = await createOrderWithRetry({
                id_customer: customerId,
                id_address_delivery: addressId,
                id_address_invoice: addressId,
                total_paid: totalAmountTTC,
                total_paid_tax_incl: totalAmountTTC,
                total_paid_tax_excl: totalAmountHT,
                payment: 'Panier',
                date_add: normalizedDate,
                etat: cartStateLabel,
                onLog,
                order_details: orderDetails,
            }, onLog)

            txCtx.orders.push(orderId)
            if (cartId) txCtx.carts.push(cartId)
            totalOrders++
            processed++
            onProgress('import_orders', `Commande: ${order.email}`, processed, orders.length)
            onLog(`  ✅ Commande créée (ID: ${orderId}) — Etat: ${cartStateLabel}`)
            return
        }

        const initialStateId = isCancelledState ? ORDER_STATE_CANCELLED_ID : ORDER_STATE_PAID_ID

        const { orderId, cartId } = await createOrderWithRetry({
            id_customer:         customerId,
            id_address_delivery: addressId,
            id_address_invoice:  addressId,
            total_paid:          totalAmountTTC,
            total_paid_tax_incl: totalAmountTTC,
            total_paid_tax_excl: totalAmountHT,
            payment:             'Paiement à la livraison',
            date_add:            normalizedDate,
            current_state:       initialStateId,
            onLog,
            order_details:       orderDetails,
        }, onLog)

        if (isDeliveredState) {
            try {
                await updateOrderStatus(orderId, ORDER_STATE_PAID_ID)
            } catch (error) {
                if (typeof onLog === 'function') {
                    onLog(
                        `  ⚠️ Etat paiement non applique (commande ${orderId}): ${error?.message || error}`,
                        'warn'
                    )
                }
            }
        }

        const shouldUpdateStock = false

        if (shouldUpdateStock) {
            await applyOrderStockOut({
                orderId,
                orderDetails,
                dateAdd: normalizedDate,
                onLog,
                updateStock: true,
                recordMovement: false,
            })
        }

        const idsToSync = new Set(orderDetails.map((item) => item.productId).filter(Boolean))
        for (const pid of idsToSync) {
            try {
                await syncProductStockFromCombinations(pid)
            } catch (error) {
                if (typeof onLog === 'function') {
                    onLog(`  ⚠️ Sync stock global produit ${pid}: ${error?.message || error}`, 'warn')
                }
            }
        }

        const targetStateId = isDeliveredState ? ORDER_STATE_DELIVERED_ID : null

        if (targetStateId && targetStateId !== initialStateId) {
            // Passage d'état BLOQUANT : une commande "Livré" sans état correct = donnée corrompue.
            const stateUpdateResult = await updateOrderStateWithStockMovement({
                orderId,
                stateId: targetStateId,
                dateAdd: normalizedDate,
            })
            if (typeof onLog === 'function') {
                onLog(`  ✅ Etat commande mis a jour: ${rawState || targetStateId}`)
                onLog(`     Module retourné: date_add=${stateUpdateResult.date_add}`)
            }

            // Correction de la date_add si elle n'a pas été appliquée
            if (normalizedDate && normalizedDate !== stateUpdateResult.date_add) {
                await fixOrderHistoryDate(orderId, normalizedDate, onLog)
            }

            // Mouvements de stock : laisser PrestaShop gérer pour éviter les doublons.
        }

        txCtx.orders.push(orderId)
        if (cartId) txCtx.carts.push(cartId)

        if (typeof onLog === 'function' && orderDetails.length) {
            orderDetails.forEach((line) => {
                const ref = line.reference || line.productName || 'Produit'
                const variantLabel = line.variant ? `/${line.variant}` : ''
                onLog(`  → Ligne appliquee: ${ref}${variantLabel} x${line.quantity}`)
            })
        }

        totalOrders++
        processed++
        onProgress('import_orders', `Commande: ${order.email}`, processed, orders.length)
        onLog(`  ✅ Commande créée (ID: ${orderId}) — Total: ${totalAmountTTC.toFixed(2)}€`)
    })

    if (totalCarts) {
        onLog(
            `✅ Étape 4 terminée: ${totalOrders} commande(s) créée(s), ` +
            `${totalCarts} panier(s) créé(s) (total lignes: ${orders.length})`
        )
    } else {
        onLog(`✅ Étape 4 terminée: ${totalOrders}/${orders.length} commande(s) créée(s)`)
    }
}

// ---------------------------------------------------------------------------
// Point d'entrée principal — import transactionnel tout-ou-rien
// ---------------------------------------------------------------------------
export async function runTransactionalImport(
    { csvProduits, csvDeclinaisons, csvCommandes, zipImages ,importImages = true},
    onProgress,
    onLog
) {
    resetImportContext()
    clearTaxCache()

    const txCtx = createTxCtx()

    const log = (msg, type) => { if (typeof onLog === 'function') onLog(msg, type) }

    // Phase 0 : Parsing + validation
    log('🔍 Phase 0/4 — Parsing et validation des fichiers CSV...')

    let products, variants, orders
    try {
        products = parseFichier1(csvProduits)
        variants = parseFichier2(csvDeclinaisons)
        orders = parseFichier3(csvCommandes)
    } catch (error) {
        throw logError(onLog, 'Lecture CSV', error)
    }

    validateImportData({ products, variants, orders }, onLog)

    let mailSnapshot = null
    try {
        mailSnapshot = await disableEmailSending((msg, type) => log(msg, type))
    } catch {
        mailSnapshot = null
    }

    // Phases 1-4 : Import avec suivi transactionnel
    try {
        await stageProducts(products, txCtx, onProgress, onLog)
        await stageCombinations(variants, txCtx, onProgress, onLog)

        if(importImages){

        await stageImages(zipImages, txCtx, onProgress, onLog)

        }else {
            log('etape upload image ignore')
        }


        await stageOrders(orders, txCtx, onProgress, onLog)

        log('\n🎉 Import terminé avec succès — aucune donnée partielle.')
        return {
            products: txCtx.products.length,
            combinations: txCtx.combinations.length,
            images: txCtx.images.length,
            customers: txCtx.customers.length,
            orders: txCtx.orders.length,
        }

    } catch (error) {
        const detail = error?.message || String(error)
        log(`\n⛔ Échec de l'import: ${detail}`, 'error')
        log('↩️ Démarrage du rollback automatique...', 'warn')

        if (typeof onProgress === 'function') {
            onProgress('rollback', 'Rollback en cours...', 0, 1)
        }

        try {
            await rollbackImport(txCtx, onLog)
        } catch (rollbackError) {
            log(`❌ Erreur durant le rollback: ${rollbackError?.message || rollbackError}`, 'error')
            log('⚠️ Des données peuvent subsister dans PrestaShop — utilisez la fonction Réinitialisation.', 'error')
        }

        if (typeof onProgress === 'function') {
            onProgress('rollback', 'Rollback terminé', 1, 1)
        }

        const err = normalizeError(error)
        err.__logged = true
        throw err
    } finally {
        if (mailSnapshot) {
            await restoreEmailSending(mailSnapshot, (msg, type) => log(msg, type))
        }
    }
}
