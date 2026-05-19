// stores/benefice/beneficeStore.js
//
// Store Pinia pour la fonctionnalité Bénéfice.
// Gère l'état (daily, total, lignes), le chargement et les erreurs.

import { defineStore } from 'pinia'
import {
  loadDailyBenefice,
  loadTotalBenefice,
  getTodayDate,
  applyStrategy,
} from '../../services/benefice'

export const useBeneficeStore = defineStore('benefice', {
  state: () => ({
    daily: {
      date: getTodayDate(),
      benefice: 0,
      realBenefice: 0,
      salesHt: 0,
      purchasesHt: 0,
      realPurchasesHt: 0,
      lines: [],
      purchaseLines: [],
      orderCount: 0,
    },
    total: {
      benefice: 0,
      realBenefice: 0,
      salesHt: 0,
      purchasesHt: 0,
      realPurchasesHt: 0,
      lines: [],
      purchaseLines: [],
      categoryByProductId: {},
      orderCount: 0,
      byDay: {},
      byCategory: {},
      byCategoryDetailed: {},
    },
    loading: {
      daily: false,
      total: false,
    },
    errors: {
      daily: '',
      total: '',
    },
    lastUpdated: {
      daily: null,
      total: null,
    },
  }),

  getters: {
    isLoading: (state) => state.loading.daily || state.loading.total,
    dailyFormatted: (state) => state.daily.benefice,
    totalFormatted: (state) => state.total.benefice,
    hasDailyData: (state) => state.daily.lines.length > 0,
    hasTotalData: (state) => state.total.lines.length > 0,
  },

  actions: {
    setDailyDate(date) {
      this.daily.date = String(date || '').trim() || getTodayDate()
    },

    async fetchDaily(date, options = {}) {
      const target = date || this.daily.date
      this.loading.daily = true
      this.errors.daily = ''

      try {
        const result = await loadDailyBenefice(target, options)
        this.daily = { ...result }
        this.lastUpdated.daily = new Date().toISOString()
      } catch (err) {
        this.errors.daily = err instanceof Error ? err.message : String(err)
        this.daily = {
          date: target,
          benefice: 0,
          realBenefice: 0,
          salesHt: 0,
          purchasesHt: 0,
          realPurchasesHt: 0,
          lines: [],
          purchaseLines: [],
          orderCount: 0,
        }
      } finally {
        this.loading.daily = false
      }
    },

    async fetchTotal(options = {}) {
      this.loading.total = true
      this.errors.total = ''

      try {
        const result = await loadTotalBenefice(options)
        this.total = { ...result }
        this.lastUpdated.total = new Date().toISOString()
      } catch (err) {
        this.errors.total = err instanceof Error ? err.message : String(err)
        this.total = {
          benefice: 0,
          realBenefice: 0,
          salesHt: 0,
          purchasesHt: 0,
          realPurchasesHt: 0,
          lines: [],
          purchaseLines: [],
          categoryByProductId: {},
          orderCount: 0,
          byDay: {},
          byCategory: {},
          byCategoryDetailed: {},
        }
      } finally {
        this.loading.total = false
      }
    },

    async fetchAll(options = {}) {
      await Promise.all([
        this.fetchDaily(this.daily.date, options),
        this.fetchTotal(options),
      ])
    },

    /**
     * Pivot extensible : applique une stratégie nommée sur les lignes du total déjà chargé.
     * Permet aux consommateurs (vues) d'ajouter des dimensions sans modifier le store.
     */
    applyStrategy(strategy, options = {}) {
      return applyStrategy(strategy, this.total.lines, {
        ...options,
        purchaseLines: options.purchaseLines ?? this.total.purchaseLines,
        categoryByProductId: options.categoryByProductId ?? this.total.categoryByProductId,
      })
    },

    reset() {
      this.daily = {
        date: getTodayDate(),
        benefice: 0,
        realBenefice: 0,
        salesHt: 0,
        purchasesHt: 0,
        realPurchasesHt: 0,
        lines: [],
        purchaseLines: [],
        orderCount: 0,
      }
      this.total = {
        benefice: 0,
        realBenefice: 0,
        salesHt: 0,
        purchasesHt: 0,
        realPurchasesHt: 0,
        lines: [],
        purchaseLines: [],
        categoryByProductId: {},
        orderCount: 0,
        byDay: {},
        byCategory: {},
      }
      this.loading = { daily: false, total: false }
      this.errors = { daily: '', total: '' }
      this.lastUpdated = { daily: null, total: null }
    },
  },
})
