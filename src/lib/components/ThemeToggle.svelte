<script lang="ts">
	import { onMount } from 'svelte';
	import { Moon, Sun } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';

	let theme = $state<'dark' | 'light'>('dark');

	// Load theme from localStorage on mount
	onMount(() => {
		const stored = localStorage.getItem('theme');
		if (stored === 'light' || stored === 'dark') {
			theme = stored;
		} else {
			// Default to dark theme
			theme = 'dark';
		}
		applyTheme(theme);
	});

	function applyTheme(newTheme: 'dark' | 'light') {
		const root = document.documentElement;
		
		if (newTheme === 'light') {
			root.classList.add('light');
		} else {
			root.classList.remove('light');
		}
		
		localStorage.setItem('theme', newTheme);
	}

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		applyTheme(theme);
	}
</script>

<Button
	variant="ghost"
	size="icon"
	onclick={toggleTheme}
	title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
	{#if theme === 'dark'}
		<Sun class="size-5" />
	{:else}
		<Moon class="size-5" />
	{/if}
</Button>

