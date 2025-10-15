<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import Navbar from '$lib/components/Navbar.svelte';

	let { data, children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<Navbar user={data.user} />
	{@render children?.()}
</div>
