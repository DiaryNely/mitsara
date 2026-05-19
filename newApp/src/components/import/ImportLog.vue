<template>
	<div class="import-log">
		<div class="log-header">
			<h4>Journal d'import</h4>
			<span class="log-count">{{ logs.length }} entrée{{ logs.length !== 1 ? 's' : '' }}</span>
		</div>

		<div class="log-terminal">
			<div v-if="!logs.length" class="log-empty">En attente des logs…</div>
			<div v-for="entry in logs" :key="entry.id" class="log-row" :class="'log-' + (entry.type || 'info')">
				<span class="log-time">{{ formatTime(entry.timestamp) }}</span>
				<span class="log-message">{{ entry.message }}</span>
			</div>
		</div>
	</div>
</template>

<script setup>
const props = defineProps({
	logs: {
		type: Array,
		default: () => [],
	},
})

const formatTime = (value) => {
	if (!value) {
		return ''
	}
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		return ''
	}
	return date.toLocaleTimeString()
}
</script>

<style scoped>
.import-log {
	border: 1px solid var(--border);
	border-radius: var(--radius-lg);
	overflow: hidden;
	box-shadow: var(--shadow-sm);
}

.log-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 16px;
	background: var(--bg);
	border-bottom: 1px solid var(--border);
}

.log-header h4 {
	font-size: 13px;
	font-weight: 600;
	color: var(--text);
	margin: 0;
}

.log-count {
	font-size: 11.5px;
	color: var(--accent);
	background: var(--accent-light);
	padding: 2px 8px;
	border-radius: var(--radius-full);
	font-weight: 600;
}

.log-terminal {
	background: #0f172a;
	color: #e2e8f0;
	padding: 12px 16px;
	max-height: 240px;
	overflow: auto;
	font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
	font-size: 12px;
	line-height: 1.65;
}

.log-row {
	display: grid;
	grid-template-columns: 80px 1fr;
	gap: 10px;
	padding: 2px 0;
}

.log-time {
	color: #475569;
	flex-shrink: 0;
}

.log-info .log-message  { color: #cbd5e1; }
.log-success .log-message { color: #34d399; }
.log-error .log-message { color: #f87171; }

.log-empty {
	text-align: center;
	color: #475569;
	padding: 20px 0;
	font-style: italic;
}
</style>
