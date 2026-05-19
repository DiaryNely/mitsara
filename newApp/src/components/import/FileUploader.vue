<template>
	<div class="file-uploader" :class="{ 'file-uploader--selected': !!selectedName }">
		<div class="file-uploader-icon">
			<svg v-if="!selectedName" width="22" height="22" viewBox="0 0 22 22" fill="none">
				<path d="M11 4v11M7.5 9l3.5-5 3.5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
				<path d="M4 16h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
			</svg>
			<svg v-else width="22" height="22" viewBox="0 0 22 22" fill="none">
				<circle cx="11" cy="11" r="9" stroke="currentColor" stroke-width="1.8"/>
				<path d="M7 11l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</div>

		<div class="file-uploader-body">
			<span class="file-title">{{ title }}</span>
			<span class="file-name" :class="{ empty: !selectedName }">
				{{ selectedName || 'Aucun fichier sélectionné' }}
			</span>
		</div>

		<label class="file-button">
			<input class="file-input" type="file" :accept="accept" @change="onFileChange" />
			<span>{{ selectedName ? 'Changer' : 'Choisir' }}</span>
		</label>
	</div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
	title: {
		type: String,
		default: 'Fichier',
	},
	accept: {
		type: String,
		default: '',
	},
})

const emit = defineEmits(['file-selected'])

const selectedName = ref('')

const onFileChange = (event) => {
	const file = event.target.files && event.target.files[0]
	if (!file) {
		selectedName.value = ''
		emit('file-selected', null)
		return
	}

	selectedName.value = file.name
	emit('file-selected', file)
}
</script>

<style scoped>
.file-uploader {
	border: 1.5px dashed var(--border);
	background: var(--bg);
	border-radius: var(--radius-lg);
	padding: 18px 16px;
	display: flex;
	align-items: center;
	gap: 14px;
	transition: all var(--transition-fast);
}

.file-uploader:hover {
	border-color: var(--accent-border);
	background: var(--accent-light);
}

.file-uploader--selected {
	border-style: solid;
	border-color: var(--success);
	background: rgba(16,185,129,.04);
}

.file-uploader-icon {
	width: 40px;
	height: 40px;
	border-radius: var(--radius-md);
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	background: var(--surface);
	border: 1px solid var(--border);
	color: var(--text-muted);
	transition: all var(--transition-fast);
}

.file-uploader--selected .file-uploader-icon {
	background: rgba(16,185,129,.1);
	border-color: rgba(16,185,129,.2);
	color: var(--success);
}

.file-uploader-body {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
}

.file-title {
	font-size: 12.5px;
	font-weight: 700;
	color: var(--text);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.file-name {
	font-size: 12px;
	color: var(--text-muted);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.file-name.empty {
	opacity: 0.6;
	font-style: italic;
}

.file-uploader--selected .file-name {
	color: var(--success);
	font-style: normal;
	font-weight: 500;
}

.file-button {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	flex-shrink: 0;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	padding: 6px 12px;
	color: var(--text-secondary);
	font-size: 12px;
	font-weight: 600;
	cursor: pointer;
	transition: all var(--transition-fast);
	white-space: nowrap;
}

.file-button:hover {
	border-color: var(--accent-border);
	color: var(--accent);
}

.file-input {
	display: none;
}
</style>
