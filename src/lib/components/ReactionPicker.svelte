<script lang="ts">
	import type { ReactionType } from '$lib/types';
	import { Button } from '$lib/components/ui/button';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';

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

	let userReaction = $state<ReactionType | null>(null);
	let isLoading = $state(false);
	let counts = $state(reactionCounts || { total: 0 });

	const reactions: { type: ReactionType; emoji: string; label: string }[] = [
		{ type: 'like', emoji: '👍', label: 'Like' },
		{ type: 'love', emoji: '❤️', label: 'Love' },
		{ type: 'haha', emoji: '😂', label: 'Haha' },
		{ type: 'wow', emoji: '😮', label: 'Wow' },
		{ type: 'sad', emoji: '😢', label: 'Sad' },
		{ type: 'angry', emoji: '😠', label: 'Angry' }
	];

	// Load user's current reaction
	$effect(() => {
		loadUserReaction();
	});

	// Update counts when prop changes
	$effect(() => {
		if (reactionCounts) {
			counts = reactionCounts;
		}
	});

	async function loadUserReaction() {
		try {
			const response = await fetch(
				`/api/reactions?target_type=${targetType}&target_id=${targetId}`
			);
			if (response.ok) {
				const data = await response.json();
				userReaction = data.reaction_type;
			}
		} catch (err) {
			console.error('Failed to load user reaction:', err);
		}
	}

	async function handleReaction(reactionType: ReactionType) {
		if (isLoading) return;

		isLoading = true;

		try {
			// If clicking the same reaction, remove it
			if (userReaction === reactionType) {
				const response = await fetch('/api/reactions', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ target_type: targetType, target_id: targetId })
				});

				if (!response.ok) throw new Error('Failed to remove reaction');

				const data = await response.json();
				userReaction = null;
				counts = data.reaction_counts;
			} else {
				// Add or update reaction
				const response = await fetch('/api/reactions', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						target_type: targetType,
						target_id: targetId,
						reaction_type: reactionType
					})
				});

				if (!response.ok) throw new Error('Failed to add reaction');

				const data = await response.json();
				userReaction = reactionType;
				counts = data.reaction_counts;
			}
		} catch (err) {
			console.error('Failed to handle reaction:', err);
		} finally {
			isLoading = false;
		}
	}

	function getReactionEmoji(type: ReactionType | null): string {
		if (!type) return '👍';
		const reaction = reactions.find((r) => r.type === type);
		return reaction?.emoji || '👍';
	}

	function getReactionLabel(type: ReactionType | null): string {
		if (!type) return 'Like';
		const reaction = reactions.find((r) => r.type === type);
		return reaction?.label || 'Like';
	}
</script>

<DropdownMenu>
	<DropdownMenuTrigger>
		<button
			class="flex items-center gap-1 hover:underline font-semibold transition {userReaction ? 'text-blue-600' : ''}"
			disabled={isLoading}
			onclick={() => !userReaction && handleReaction('like')}
		>
			<span>{getReactionEmoji(userReaction)}</span>
			<span>{getReactionLabel(userReaction)}</span>
			{#if counts.total > 0}
				<span class="text-muted-foreground ml-1">({counts.total})</span>
			{/if}
		</button>
	</DropdownMenuTrigger>
	<DropdownMenuContent side="top" align="start" class="w-auto p-2">
		<div class="flex gap-1">
			{#each reactions as reaction}
				<Button
					variant="ghost"
					size="icon"
					class="size-10 hover:scale-125 transition-transform"
					title={reaction.label}
					disabled={isLoading}
					onclick={() => handleReaction(reaction.type)}
				>
					<span class="text-2xl">{reaction.emoji}</span>
				</Button>
			{/each}
		</div>
	</DropdownMenuContent>
</DropdownMenu>

