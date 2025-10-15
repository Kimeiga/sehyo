<script lang="ts">
	import type { ReactionType } from '$lib/types';
	import { Button } from '$lib/components/ui/button';
	import { Heart } from 'lucide-svelte';

	interface Props {
		targetType: 'post' | 'comment';
		targetId: string;
		reactionCounts?: {
			total: number;
			like?: number;
			love?: number;
			haha?: number;
			wow?: number;
			sad?: number;
			angry?: number;
		};
	}

	let { targetType, targetId, reactionCounts }: Props = $props();

	let isLiked = $state(false);
	let isLoading = $state(false);
	let likeCount = $state(reactionCounts?.total || 0);

	// Load user's current like status
	$effect(() => {
		loadUserLike();
	});

	// Update count when prop changes
	$effect(() => {
		if (reactionCounts) {
			likeCount = reactionCounts.total || 0;
		}
	});

	async function loadUserLike() {
		try {
			const response = await fetch(
				`/api/reactions?target_type=${targetType}&target_id=${targetId}`
			);
			if (response.ok) {
				const data = await response.json();
				isLiked = !!data.reaction_type; // Any reaction counts as "liked"
			}
		} catch (err) {
			console.error('Failed to load user reaction:', err);
		}
	}

	async function toggleLike() {
		if (isLoading) return;

		isLoading = true;

		try {
			if (isLiked) {
				// Unlike
				const response = await fetch('/api/reactions', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ target_type: targetType, target_id: targetId })
				});

				if (!response.ok) throw new Error('Failed to remove reaction');

				const data = await response.json();
				isLiked = false;
				likeCount = data.reaction_counts.total || 0;
			} else {
				// Like
				const response = await fetch('/api/reactions', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						target_type: targetType,
						target_id: targetId,
						reaction_type: 'like'
					})
				});

				if (!response.ok) throw new Error('Failed to add reaction');

				const data = await response.json();
				isLiked = true;
				likeCount = data.reaction_counts.total || 0;
			}
		} catch (err) {
			console.error('Failed to handle reaction:', err);
		} finally {
			isLoading = false;
		}
	}
</script>

<Button
	variant="ghost"
	size="sm"
	class="gap-1.5 group"
	disabled={isLoading}
	onclick={toggleLike}
>
	<Heart
		class="size-4 transition-all {isLiked
			? 'fill-red-500 text-red-500'
			: 'group-hover:text-red-500'}"
	/>
	<span class="transition-colors {isLiked ? 'text-red-500 font-semibold' : 'group-hover:text-red-500'}">
		{isLiked ? 'Liked' : 'Like'}
	</span>
	{#if likeCount > 0}
		<span class="text-muted-foreground">({likeCount})</span>
	{/if}
</Button>

