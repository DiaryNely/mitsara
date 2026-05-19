<script setup>
import { ref } from 'vue'

const emit = defineEmits(['apply', 'reset'])

const defaultState = {
  name: '',
  reference: '',
  categoryId: '',
  active: '',
  visibility: '',
  priceMin: '',
  priceMax: '',
  sortField: 'id',
  sortDirection: 'ASC',
  pageSize: 25,
}

const form = ref({ ...defaultState })

const normalizeValue = (value) => String(value || '').trim()

const handleApply = () => {
  emit('apply', {
    criteria: {
      name: normalizeValue(form.value.name),
      reference: normalizeValue(form.value.reference),
      categoryId: normalizeValue(form.value.categoryId),
      active: form.value.active,
      visibility: form.value.visibility,
      priceMin: normalizeValue(form.value.priceMin),
      priceMax: normalizeValue(form.value.priceMax),
    },
    sort: {
      field: form.value.sortField,
      direction: form.value.sortDirection,
    },
    pageSize: Number(form.value.pageSize) || defaultState.pageSize,
  })
}

const handleReset = () => {
  form.value = { ...defaultState }
  emit('reset', {
    criteria: {
      name: '',
      reference: '',
      categoryId: '',
      active: '',
      visibility: '',
      priceMin: '',
      priceMax: '',
    },
    sort: {
      field: defaultState.sortField,
      direction: defaultState.sortDirection,
    },
    pageSize: defaultState.pageSize,
  })
}
</script>

<template>
  <div class="filter-card">
    <div class="filter-header">
      <h3>Filtres produits</h3>
      <p>Definissez plusieurs criteres puis lancez la recherche.</p>
    </div>

    <div class="filter-grid">
      <label class="field">
        <span>Nom</span>
        <input v-model="form.name" type="text" class="input" placeholder="ex: iPod" />
      </label>

      <label class="field">
        <span>Reference</span>
        <input v-model="form.reference" type="text" class="input" placeholder="ex: REF-123" />
      </label>

      <label class="field">
        <span>Categorie (ID)</span>
        <input v-model="form.categoryId" type="number" min="1" class="input" placeholder="ex: 2" />
      </label>

      <label class="field">
        <span>Actif</span>
        <select v-model="form.active" class="input">
          <option value="">Tous</option>
          <option value="1">Actif</option>
          <option value="0">Inactif</option>
        </select>
      </label>

      <label class="field">
        <span>Visibilite</span>
        <select v-model="form.visibility" class="input">
          <option value="">Toutes</option>
          <option value="both">Catalogue + recherche</option>
          <option value="catalog">Catalogue</option>
          <option value="search">Recherche</option>
          <option value="none">Aucune</option>
        </select>
      </label>

      <label class="field">
        <span>Prix min</span>
        <input v-model="form.priceMin" type="number" min="0" step="0.01" class="input" placeholder="0" />
      </label>

      <label class="field">
        <span>Prix max</span>
        <input v-model="form.priceMax" type="number" min="0" step="0.01" class="input" placeholder="999" />
      </label>

      <label class="field">
        <span>Tri</span>
        <select v-model="form.sortField" class="input">
          <option value="id">ID</option>
          <option value="name">Nom</option>
          <option value="price">Prix</option>
          <option value="date_add">Date creation</option>
          <option value="date_upd">Date mise a jour</option>
        </select>
      </label>

      <label class="field">
        <span>Ordre</span>
        <select v-model="form.sortDirection" class="input">
          <option value="ASC">Ascendant</option>
          <option value="DESC">Descendant</option>
        </select>
      </label>

      <label class="field">
        <span>Taille page</span>
        <select v-model.number="form.pageSize" class="input">
          <option :value="10">10</option>
          <option :value="25">25</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </label>
    </div>

    <div class="filter-actions">
      <button class="btn btn--outline" type="button" @click="handleReset">Reinitialiser</button>
      <button class="btn btn--primary" type="button" @click="handleApply">Rechercher</button>
    </div>
  </div>
</template>

<style scoped>
.filter-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 18px 20px 20px;
  box-shadow: var(--shadow-xs);
  display: grid;
  gap: 14px;
}

.filter-header h3 {
  font-size: 16px;
  margin-bottom: 4px;
}

.filter-header p {
  font-size: 12.5px;
  color: var(--text-muted);
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.input {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  background: var(--surface);
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  transition: all var(--transition-fast);
  background: var(--surface);
  border: 1px solid var(--border);
}

.btn--outline:hover {
  border-color: var(--accent-border);
  color: var(--accent);
}

.btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

@media (max-width: 640px) {
  .filter-actions {
    flex-direction: column;
  }
}
</style>
