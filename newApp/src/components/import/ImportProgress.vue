<template>
	<div class="import-progress">
		<div class="progress-header">
			<span class="progress-title">Progression</span>
			<span class="progress-percent">{{ percentage }}%</span>
		</div>

		<div class="progress-bar">
			<div class="progress-bar-fill" :style="{ width: percentage + '%' }"></div>
		</div>

		<div class="progress-meta">
			<span>Etape: {{ progress.currentStep || '-' }}</span>
			<span>Item: {{ progress.currentItem || '-' }}</span>
			<span>{{ progress.processedItems || 0 }}/{{ progress.totalItems || 0 }}</span>
		</div>
	</div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
	progress: {
		type: Object,
		default: () => ({
			currentStep: '',
			currentItem: '',
			percentage: 0,
			totalItems: 0,
			processedItems: 0,
		}),
	},
})

const percentage = computed(() => {
	const value = Number(props.progress?.percentage || 0)
	if (Number.isNaN(value)) {
		return 0
	}
	return Math.min(100, Math.max(0, value))
})
</script>

<style scoped>
.import-progress {
	border: 1px solid var(--border);
	background: var(--surface);
	border-radius: var(--radius-lg);
	padding: 18px 20px;
	display: flex;
	flex-direction: column;
	gap: 12px;
	box-shadow: var(--shadow-sm);
}

.progress-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.progress-title {
	font-size: 13.5px;
	font-weight: 600;
	color: var(--text);
}

.progress-percent {
	font-size: 14px;
	font-weight: 800;
	color: var(--accent);
	letter-spacing: -0.02em;
	font-variant-numeric: tabular-nums;
}

.progress-bar {
	width: 100%;
	height: 10px;
	background: var(--border-light);
	border-radius: var(--radius-full);
	overflow: hidden;
}

.progress-bar-fill {
	height: 100%;
	background: linear-gradient(90deg, var(--accent), #8b5cf6);
	border-radius: var(--radius-full);
	transition: width var(--transition-base);
}

.progress-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 16px;
	font-size: 12px;
	color: var(--text-muted);
	padding-top: 2px;
}
</style>
