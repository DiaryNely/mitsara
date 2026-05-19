<template>
	<div class="data-preview">
		<div class="preview-card">
			<div class="preview-header">
				<h4>Produits</h4>
				<span class="preview-count">{{ products.length }}</span>
			</div>
			<div v-if="productsPreview.length" class="preview-list">
				<div v-for="(row, index) in productsPreview" :key="index" class="preview-item">
					<div class="preview-item-title">{{ row.title }}</div>
					<div v-if="row.subtitle" class="preview-item-subtitle">{{ row.subtitle }}</div>
					<div v-if="row.fields.length" class="preview-item-grid">
						<div v-for="(field, fieldIndex) in row.fields" :key="fieldIndex" class="preview-item-field">
							<span class="field-label">{{ field.label }}</span>
							<span class="field-value">{{ field.value }}</span>
						</div>
					</div>
				</div>
			</div>
			<div v-else class="preview-empty">Aucun element.</div>
		</div>

		<div class="preview-card">
			<div class="preview-header">
				<h4>Declinaisons</h4>
				<span class="preview-count">{{ variants.length }}</span>
			</div>
			<div v-if="variantsPreview.length" class="preview-list">
				<div v-for="(row, index) in variantsPreview" :key="index" class="preview-item">
					<div class="preview-item-title">{{ row.title }}</div>
					<div v-if="row.subtitle" class="preview-item-subtitle">{{ row.subtitle }}</div>
					<div v-if="row.fields.length" class="preview-item-grid">
						<div v-for="(field, fieldIndex) in row.fields" :key="fieldIndex" class="preview-item-field">
							<span class="field-label">{{ field.label }}</span>
							<span class="field-value">{{ field.value }}</span>
						</div>
					</div>
				</div>
			</div>
			<div v-else class="preview-empty">Aucun element.</div>
		</div>

		<div class="preview-card">
			<div class="preview-header">
				<h4>Commandes</h4>
				<span class="preview-count">{{ orders.length }}</span>
			</div>
			<div v-if="ordersPreview.length" class="preview-list">
				<div v-for="(row, index) in ordersPreview" :key="index" class="preview-item">
					<div class="preview-item-title">{{ row.title }}</div>
					<div v-if="row.subtitle" class="preview-item-subtitle">{{ row.subtitle }}</div>
					<div v-if="row.fields.length" class="preview-item-grid">
						<div v-for="(field, fieldIndex) in row.fields" :key="fieldIndex" class="preview-item-field">
							<span class="field-label">{{ field.label }}</span>
							<span class="field-value">{{ field.value }}</span>
						</div>
					</div>
				</div>
			</div>
			<div v-else class="preview-empty">Aucun element.</div>
		</div>
	</div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
	products: {
		type: Array,
		default: () => [],
	},
	variants: {
		type: Array,
		default: () => [],
	},
	orders: {
		type: Array,
		default: () => [],
	},
})

const makePreview = (items) => items.slice(0, 4)

const formatNumber = (value) => {
	if (value === null || value === undefined || value === '') {
		return '-'
	}
	const numberValue = Number(value)
	return Number.isFinite(numberValue) ? numberValue.toFixed(2) : String(value)
}

const toPreviewItem = (item, config) => {
	if (!item || typeof item === 'string') {
		return {
			title: String(item || 'Element'),
			subtitle: '',
			fields: [],
		}
	}

	return {
		title: config.title(item),
		subtitle: config.subtitle(item),
		fields: config.fields(item),
	}
}

const productsPreview = computed(() =>
	makePreview(props.products).map((item) =>
		toPreviewItem(item, {
			title: (row) => row.nom || 'Produit',
			subtitle: (row) => (row.reference ? `Ref ${row.reference}` : 'Ref -'),
			fields: (row) => [
				{ label: 'Prix TTC', value: formatNumber(row.prix_ttc) },
				{ label: 'Taxe', value: row.taxe || '-' },
				{ label: 'Categorie', value: row.categorie || '-' },
				{ label: 'Achat', value: formatNumber(row.prix_achat) },
			],
		})
	)
)

const variantsPreview = computed(() =>
	makePreview(props.variants).map((item) =>
		toPreviewItem(item, {
			title: (row) => row.reference || 'Declinaison',
			subtitle: (row) => row.karazany || row.specificite || '',
			fields: (row) => [
				{ label: 'Specificite', value: row.specificite || '-' },
				{ label: 'Karazany', value: row.karazany || '-' },
				{ label: 'Stock', value: row.stock_initial ?? '-' },
				{ label: 'Prix TTC', value: formatNumber(row.prix_vente_ttc) },
			],
		})
	)
)

const ordersPreview = computed(() =>
	makePreview(props.orders).map((item) =>
		toPreviewItem(item, {
			title: (row) => row.email || row.nom || 'Commande',
			subtitle: (row) => row.date || '',
			fields: (row) => [
				{ label: 'Client', value: row.nom || '-' },
				{ label: 'Etat', value: row.etat || '-' },
				{ label: 'Adresse', value: row.adresse || '-' },
				{
					label: 'Articles',
					value: Array.isArray(row.achat) ? row.achat.length : '0',
				},
			],
		})
	)
)
</script>

<style scoped>
.data-preview {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 16px;
}

.preview-card {
	border: 1px solid var(--border);
	background: var(--surface);
	border-radius: var(--radius-md);
	padding: 14px;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.preview-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.preview-header h4 {
	font-size: 13px;
	font-weight: 600;
	color: var(--text);
}

.preview-count {
	font-size: 12px;
	color: var(--text-muted);
}

.preview-list {
	display: grid;
	gap: 10px;
	max-height: 220px;
	overflow: auto;
	padding-right: 4px;
}

.preview-item {
	border: 1px solid var(--border-light);
	background: var(--bg);
	border-radius: var(--radius-sm);
	padding: 8px 10px;
	display: grid;
	gap: 6px;
}

.preview-item-title {
	font-size: 12.5px;
	font-weight: 600;
	color: var(--text);
}

.preview-item-subtitle {
	font-size: 11.5px;
	color: var(--text-muted);
}

.preview-item-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 4px 10px;
}

.preview-item-field {
	font-size: 11px;
	color: var(--text-secondary);
	display: flex;
	justify-content: space-between;
	gap: 6px;
}

.field-label {
	color: var(--text-muted);
}

.preview-empty {
	font-size: 12px;
	color: var(--text-muted);
}

@media (max-width: 900px) {
	.data-preview {
		grid-template-columns: 1fr;
	}
}
</style>
