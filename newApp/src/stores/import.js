// stores/import.js
import { defineStore } from 'pinia'

export const useImportStore = defineStore('import', {
  state: () => ({
    files: {
      fichier1: null,
      fichier2: null,
      fichier3: null,
      images: null
    },
    progress: {
      currentStep: '',
      currentItem: '',
      percentage: 0,
      totalItems: 0,
      processedItems: 0
    },
    logs: [],
    status: 'idle', // idle, loading, rolling_back, success, error
    results: {
      products: 0,
      combinations: 0,
      images: 0,
      customers: 0,
      orders: 0
    }
  }),
  
  actions: {
    setFile(type, file) {
      this.files[type] = file
    },
    
    addLog(message, type = 'info') {
      this.logs.push({
        id: Date.now(),
        message,
        type,
        timestamp: new Date().toISOString()
      })
    },
    
    clearLogs() {
      this.logs = []
    },
    
    updateProgress(currentStep, currentItem, processed, total) {
      this.progress.currentStep = currentStep
      this.progress.currentItem = currentItem
      this.progress.processedItems = processed
      this.progress.totalItems = total
      this.progress.percentage = total > 0 ? Math.round((processed / total) * 100) : 0
    },
    
    resetState() {
      this.files = {
        fichier1: null,
        fichier2: null,
        fichier3: null,
        images: null
      }
      this.progress = {
        currentStep: '',
        currentItem: '',
        percentage: 0,
        totalItems: 0,
        processedItems: 0
      },
      this.logs = []
      this.status = 'idle'
      this.results = {
        products: 0,
        combinations: 0,
        images: 0,
        customers: 0,
        orders: 0
      }
    }
  }
})