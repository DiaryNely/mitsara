// composables/benefice/useBenefice.js
//
// Composable Vue 3 prêt à l'emploi pour la fonctionnalité Bénéfice.
// Encapsule le store + un formatteur monétaire, et expose une API simple.

import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useBeneficeStore } from '../../stores/benefice'

const formatCurrency = (value) => {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '0,00 €'
  return amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

/**
 * Composable Bénéfice : retourne refs réactives + actions.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.autoFetch=false]  Charge automatiquement daily + total à l'onMounted.
 * @param {string}  [opts.initialDate]      Date initiale (YYYY-MM-DD). Défaut: aujourd'hui.
 */
export function useBenefice(opts = {}) {
  const store = useBeneficeStore()
  const { daily, total, loading, errors, lastUpdated } = storeToRefs(store)

  if (opts.initialDate) {
    store.setDailyDate(opts.initialDate)
  }

  const dailyBenefice = computed(() => daily.value.benefice)
  const totalBenefice = computed(() => total.value.benefice)
  const dailyRealBenefice = computed(() => daily.value.realBenefice)
  const totalRealBenefice = computed(() => total.value.realBenefice)

  const dailyFormatted = computed(() => formatCurrency(daily.value.benefice))
  const totalFormatted = computed(() => formatCurrency(total.value.benefice))

  const isLoading = computed(() => loading.value.daily || loading.value.total)

  const fetchDaily = (date) => store.fetchDaily(date)
  const fetchTotal = () => store.fetchTotal()
  const fetchAll = () => store.fetchAll()
  const setDate = (date) => store.setDailyDate(date)
  const reset = () => store.reset()
  const applyStrategy = (name, options) => store.applyStrategy(name, options)

  if (opts.autoFetch) {
    onMounted(() => fetchAll())
  }

  return {
    // état
    daily,
    total,
    loading,
    errors,
    lastUpdated,
    // valeurs dérivées
    dailyBenefice,
    totalBenefice,
    dailyRealBenefice,
    totalRealBenefice,
    dailyFormatted,
    totalFormatted,
    isLoading,
    // actions
    fetchDaily,
    fetchTotal,
    fetchAll,
    setDate,
    reset,
    applyStrategy,
    // utils
    formatCurrency,
  }
}
