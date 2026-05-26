<script setup>
// BeneficeView — page complète dédiée à la fonctionnalité Bénéfice.

import { computed, onMounted, ref } from 'vue'
import { BeneficeSummary, BeneficeCard } from '../../components/benefice'
import { useBenefice } from '../../composables/benefice'
import { getCategories } from '../../api/categories'
import { loadStockSummaryByCategory } from '../../services/benefice/stockByCategoryService'

const { total, formatCurrency } = useBenefice()

const categoriesMap = ref({})
const stockByCategory = ref({})
const stockLoading = ref(false)
const stockError = ref('')

const computeBeneficeTtc = (data) => {
  const salesTtc = Number(data?.salesTtc || 0)
  return salesTtc - computePurchaseTtc(data)
}

const computePurchaseTtc = (data) => {
  const purchasesHt = Number(data?.realPurchasesHt || 0)
  const salesHt = Number(data?.salesHt || 0)
  const salesTtc = Number(data?.salesTtc || 0)
  if (!salesHt) return purchasesHt
  const ratio = salesTtc / salesHt
  return Number.isFinite(ratio) && ratio > 0 ? purchasesHt * ratio : purchasesHt
}

const formatQty = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? Math.round(num) : 0
}

const loadCategories = async () => {
  try {
    const list = await getCategories()
    const map = {}
    for (const c of list) {
      const key = String(c.id || '').trim()
      map[key] = c.name || ''
    }
    categoriesMap.value = map
  } catch (err) {
    categoriesMap.value = {}
  }
}

const getCategoryName = (id) => {
  const key = String(id || '').trim()
  return categoriesMap.value[key] || key || '—'
}

const stockRows = computed(() => {
  const rows = Object.entries(stockByCategory.value).map(([categoryId, totals]) => ({
    categoryId,
    physical: totals.physical || 0,
    reserved: totals.reserved || 0,
    available: totals.available || 0,
  }))

  rows.sort((a, b) => getCategoryName(a.categoryId).localeCompare(getCategoryName(b.categoryId)))
  return rows
})

const loadStockByCategory = async () => {
  stockLoading.value = true
  stockError.value = ''

  try {
    const result = await loadStockSummaryByCategory()
    stockByCategory.value = result.byCategory || {}
  } catch (err) {
    stockError.value = err instanceof Error ? err.message : String(err)
    stockByCategory.value = {}
  } finally {
    stockLoading.value = false
  }
}

onMounted(() => {
  loadCategories()
  loadStockByCategory()
})
</script>

<template>
  <div class="benefice-view">
    <header class="benefice-view__header">
      <div>
        <h1>Bénéfices</h1>
        <p class="benefice-view__desc">
          Suivi du bénéfice (vente − achat) sur la base des commandes PrestaShop.
        </p>
      </div>
    </header>

    <BeneficeSummary auto-fetch>
      <template #extras>
        <section class="ds-kpi-grid">
          <BeneficeCard
            label="Ventes HT totales"
            :value="total.salesHt"
            badgeClass="ds-badge-indigo"
            :isStyleCurrency="true"
          >
            <template #icon>
              <svg viewBox="0 0 24 24" fill="none" class="ds-icon-sm" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </template>
          </BeneficeCard>
          
          <BeneficeCard
            label="Coût achat (mouvements)"
            :value="total.purchasesHt"
            badgeClass="ds-badge-emerald"
            :isStyleCurrency="true"
          >
            <template #icon>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="ds-icon-sm">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </template>
          </BeneficeCard>
          
          <BeneficeCard
            label="Coût achat (produits vendus)"
            :value="total.realPurchasesHt"
            badgeClass="ds-badge-amber"
            :isStyleCurrency="true"
          >
            <template #icon>
              <svg viewBox="0 0 24 24" fill="none" class="ds-icon-sm" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </template>
          </BeneficeCard>
        </section>
        <section class="benefice-view__category-table" v-if="total.byCategoryDetailed">
          <h2>Bénéfice par catégorie</h2>
          <table class="category-table">
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>Vente HT</th>
                <th>Vente TTC</th>
                <th>Achat HT</th>
                <th>Achat TTC</th>
                <th>Bénéfice HT</th>
                <th>Bénéfice TTC</th>
                <th>Bénéfice total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(data, cat) in total.byCategoryDetailed" :key="cat">
                <td>{{ getCategoryName(cat) }}</td>
                <td>{{ formatCurrency(data.salesHt) }}</td>
                <td>{{ formatCurrency(data.salesTtc) }}</td>
                <td>{{ formatCurrency(data.realPurchasesHt ?? 0) }}</td>
                <td>{{ formatCurrency(computePurchaseTtc(data)) }}</td>
                <td>{{ formatCurrency(data.realBenefice ?? 0) }}</td>
                <td>{{ formatCurrency(computeBeneficeTtc(data)) }}</td>
                <td>{{ formatCurrency(data.beneficeHt) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="benefice-view__category-table">
          <h2>Stocks par catégorie</h2>
          <div v-if="stockLoading" class="benefice-view__stock-status">
            Chargement des stocks...
          </div>
          <div v-else-if="stockError" class="benefice-view__stock-status benefice-view__stock-status--error">
            {{ stockError }}
          </div>
          <table v-else class="category-table">
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>Qté physique</th>
                <th>Qté réservée</th>
                <th>Qté disponible</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in stockRows" :key="row.categoryId">
                <td>{{ getCategoryName(row.categoryId) }}</td>
                <td>{{ formatQty(row.physical) }}</td>
                <td>{{ formatQty(row.reserved) }}</td>
                <td>{{ formatQty(row.available) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>
    </BeneficeSummary>
  </div>
</template>

<style scoped>
.benefice-view {
  max-width: 1100px;
  padding: 24px;
}

.benefice-view__header {
  margin-bottom: 24px;
}

.benefice-view__header h1 {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 6px;
}

.benefice-view__desc {
  color: var(--text-muted, #6b7280);
  font-size: 14px;
  margin: 0;
}

.ds-kpi-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 24px;
}

@media (max-width: 1024px) {
  .ds-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .ds-kpi-grid {
    grid-template-columns: 1fr;
  }
}

.benefice-view__category-table {
  margin-top: 20px;
}

.benefice-view__category-table h2 {
  font-size: 16px;
  margin: 10px 0 12px;
}

.benefice-view__stock-status {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border, #e5e7eb);
  background: var(--surface, #fff);
  color: var(--text-muted, #6b7280);
  font-size: 13px;
  margin-bottom: 10px;
}

.benefice-view__stock-status--error {
  color: var(--danger, #b91c1c);
  border-color: rgba(185, 28, 28, 0.2);
  background: rgba(185, 28, 28, 0.05);
}

.category-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
}

.category-table thead {
  background: linear-gradient(90deg, rgba(249,250,251,1), rgba(243,244,246,1));
}

.category-table th,
.category-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(0,0,0,0.04);
  font-size: 14px;
}

.category-table th {
  font-weight: 600;
  color: var(--text-muted, #6b7280);
  text-transform: uppercase;
  font-size: 12px;
}

.category-table tbody tr:hover td {
  background: rgba(15,23,42,0.02);
}

@media (max-width: 600px) {
  .category-table th,
  .category-table td {
    padding: 8px 10px;
    font-size: 13px;
  }
}
</style>
