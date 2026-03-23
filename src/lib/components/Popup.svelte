<script lang="ts">
	import Button from './Button.svelte';
	import { popupIn, popupOut } from '../models/transition';
	export let component: any;
	export let props: any = {};
	export let title: string;
	export let closeSelf: () => void;

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeSelf();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />
<div class="popup-shell" in:popupIn|global out:popupOut|global>
	<header class="popup-header">
		<Button icon="delete" tooltip="close" palette="plain-secondary" onclick={closeSelf} />
		<span class="popup-title">{title}</span>
	</header>
	<div class="popup-content">
		<svelte:component this={component} closePopup={closeSelf} {...props} />
	</div>
</div>

<style>
	.popup-shell {
		background: var(--background);
		display: flex;
		flex-direction: column;
		border-radius: var(--border-radius);
		overflow: hidden;
		max-height: min(90vh, calc(100vh - var(--padding) * 2));
		box-sizing: border-box;
	}
	.popup-header {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--padding-small);
		flex-shrink: 0;
		padding: var(--padding);
		padding-bottom: var(--padding-small);
	}
	.popup-title {
		font-weight: bold;
		min-width: 0;
		flex: 1;
	}
	.popup-content {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		display: flex;
		flex-direction: column;
	}
</style>
