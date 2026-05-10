<script lang="ts">
	import { openMenu, menuOpen } from '$lib/stores/menu';
</script>

<svelte:head>
	<title>製 SEHYO</title>
</svelte:head>

{#if !$menuOpen}
	<div class="logo-screen">
		<button
			type="button"
			class="logo-button"
			onclick={openMenu}
			aria-label="Open Sehyo"
		>
			<img src="/sehyo-logo.svg" alt="Sehyo" width="200" height="200" />
		</button>
	</div>
{/if}

<style>
	.logo-screen {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--background);
	}
	.logo-button {
		appearance: none;
		border: 0;
		padding: 0;
		background: transparent;
		cursor: pointer;
		transition: transform 220ms ease, filter 220ms ease;
	}
	.logo-button img {
		display: block;
		width: clamp(160px, 36vw, 280px);
		height: auto;
		border-radius: clamp(34px, 7.5vw, 60px);
		box-shadow: 0 24px 80px -20px color-mix(in oklab, var(--primary) 70%, transparent);
	}
	.logo-button:hover { transform: scale(1.04); }
	.logo-button:active { transform: scale(0.97); }
	.logo-button:focus-visible { outline: 3px solid var(--ring); outline-offset: 6px; border-radius: 14px; }

	@media (prefers-reduced-motion: reduce) {
		.logo-button { transition: none; }
		.logo-button:hover, .logo-button:active { transform: none; }
	}
</style>
