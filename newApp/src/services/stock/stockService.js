// services/stock/stockService.js
import { getStockAvailable, getAllStockAvailables } from '../../api/stock'
import { updateStockWithMovement } from '../../api/stockMovements'

export const MOVEMENT_TYPES = [
  { value: 'supply',     label: 'Approvisionnement' },
  { value: 'correction', label: 'Correction'        },
  { value: 'return',     label: 'Retour produit'    },
  { value: 'other',      label: 'Autre'             },
]

/**
 * Agrège les mouvements WS par jour pour le graphique.
 * Calcule le niveau de stock historique en remontant depuis le stock actuel.
 *
 * @param {Array}  movements    — items de getStockMovements(), triés date DESC
 * @param {number} currentStock — stock actuel (depuis stock_availables)
 */
export function computeDailyStats(movements, currentStock = 0) {
  if (!movements.length) return []

  // Travailler en ordre chronologique ASC pour calculer les niveaux
  const asc = [...movements].sort((a, b) => a.date_add.localeCompare(b.date_add))

  // Reconstituer le stock de départ : stock actuel - somme de tous les deltas
  const totalDelta = asc.reduce((s, m) => s + (m.quantity_delta || 0), 0)
  let runningStock = Math.max(0, currentStock - totalDelta)

  // Grouper par jour
  const map = {}
  for (const m of asc) {
    const day = (m.date_add || '').slice(0, 10)
    if (!day) continue

    if (!map[day]) {
      map[day] = { day, entries: 0, exits: 0, stock_start: runningStock, stock_end: runningStock }
    }

    const delta = m.quantity_delta || 0
    if (delta > 0) {
      map[day].entries += delta
    } else {
      map[day].exits += Math.abs(delta)
    }
    runningStock       += delta
    map[day].stock_end  = runningStock
  }

  return Object.values(map).sort((a, b) => a.day.localeCompare(b.day))
}

/**
 * Ajoute ou retire du stock via l'API admin interne PS.
 * La mise à jour stock_available ET la création ps_stock_mvt sont gérées par PS.
 */
export async function addStock(params) {
  const {
    product,
    attributeId       = 0,
    delta,
    movementType      = 'supply',
    comment           = '',
    employeeId        = 0,
    employeeFirstname = '',
    employeeLastname  = '',
  } = params

  if (!delta || delta === 0) {
    throw new Error('La quantité doit être différente de zéro.')
  }

  // Lire le stock actuel pour validation
  const stockNode = await getStockAvailable(product.id, attributeId)
  if (!stockNode) {
    throw new Error(
      `Stock introuvable pour le produit ${product.id}` +
      (attributeId ? ` / déclinaison ${attributeId}` : '')
    )
  }

  const quantityBefore = stockNode.quantity
  const expectedAfter  = quantityBefore + delta

  if (expectedAfter < 0) {
    throw new Error(
      `Stock insuffisant : stock actuel = ${quantityBefore}, retrait demandé = ${Math.abs(delta)}.`
    )
  }

  // Mise a jour via WS natif: stock_available + stock_movements
  const result = await updateStockWithMovement(product.id, attributeId, delta, {
    id:        employeeId,
    firstname: employeeFirstname,
    lastname:  employeeLastname,
  })

  const quantityAfter = result.new_quantity ?? expectedAfter

  return { quantityBefore, quantityAfter, delta }
}

export async function fetchStocksForProducts(productIds) {
  const results = {}
  await Promise.all(
    productIds.map(async (pid) => {
      const all = await getAllStockAvailables(pid)
      results[String(pid)] = all
    })
  )
  return results
}
